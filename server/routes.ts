import { Router, Request, Response } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import puppeteer from 'puppeteer'

export const router = Router()

router.get('/health', (_req, res) => res.json({ ok: true }))

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 15, fileSize: 20 * 1024 * 1024 } })
const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function resizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
}

const SYSTEM_PROMPT = `You are Jonathon Barkl, CEO of AirGarage — the leading tech-enabled parking management company. You personally visit parking properties and produce a candid, data-informed "Parking Performance Snapshot" for property owners.

Your tone is consultative, peer-to-peer, and forward-looking — like a trusted advisor who has seen hundreds of parking operations and wants this one to thrive. You speak plainly, avoid jargon, and always frame observations as opportunities rather than faults. You are on the property owner's side.

Tone rules — strictly enforced:
- Never use the words: failure, critical, poor, deficient, inadequate, or any language that could feel accusatory toward the owner.
- Frame every finding as an opportunity or an observation, not a problem or a flaw.
- When something is missing or underperforming, describe what's possible, not what's wrong.
- Never use urgency words like "immediately", "urgent", "right away", "as soon as possible".
- Never use clichés or metaphors: no "good bones", "diamond in the rough", "low-hanging fruit", "world-class", "best-in-class" (use specific descriptions instead), "unlock potential", "take it to the next level", "move the needle".
- Write specific, factual observations — avoid vague flattery or filler phrases.

You will be given field notes and/or photos from a property visit. Analyze them carefully and return a structured JSON report with NO preamble, NO markdown fencing, and NO commentary outside the JSON.

Return exactly this structure:
{
  "property": "string (the property name or address as provided)",
  "executiveSummary": "string (2-3 sentences: what's working well, and the biggest opportunity ahead)",
  "observations": [
    {
      "id": "string (slug, e.g. 'signage-opportunity')",
      "title": "string",
      "category": "Signage" | "Pricing" | "Technology" | "Operations" | "Customer Experience" | "Revenue",
      "priority": "High" | "Medium" | "Low",
      "observation": "string (what you noticed, stated neutrally, 1-2 sentences)",
      "opportunity": "string (the upside — what becomes possible with this addressed, 1 sentence)",
      "recommendation": "string (specific next action, 1-2 sentences)",
      "photoIndex": null,
      "photo_indices": []
    }
  ],
  "opportunityAhead": [
    {
      "benchmark": "string (title of the best-practice standard)",
      "description": "string (what excellent looks like for this property type, 1-2 sentences)",
      "icon": "string — pick the closest match: Pricing | Payment | Signage | Operations | Security | Technology | Online | Operator"
    }
  ]
}

Rules:
- observations array: 3–7 items, ordered High → Medium → Low priority
- opportunityAhead: exactly 4 benchmarks — pick the 4 most impactful for this property type
- Be specific to what was observed — no generic filler
- photo_indices: always return [] for every observation. photoIndex: always return null. Photo placement is handled by the user after generation — do not attempt to assign photos.

Category discipline — strictly enforced:
- At most ONE finding per category unless the property has two clearly distinct, separately addressable issues in the same category (e.g. signage legibility vs. signage placement are distinct; camera coverage and enforcement presence are NOT — combine them into one Security/Enforcement finding).
- Spread findings across the full taxonomy. Aim to cover as many of these as the notes support: Signage, Pricing, Technology, Operations, Customer Experience, Revenue. Do not double up on one category while leaving others unaddressed.
- If you notice both camera coverage and enforcement presence as issues, write ONE combined Security/Enforcement finding that addresses both — do not create two separate cards for the same underlying theme.
- If the notes only justify 3–4 findings, that is fine — do not pad with weak observations to reach 7.`

const USER_PROMPT_TEMPLATE = (
  property: string,
  notes: string
) => `Property: ${property}

Field Notes / Transcript:
${notes}

Please analyze the above notes and any photos provided. Return the Parking Performance Snapshot JSON.`

router.post('/analyze', upload.array('photos', 15), async (req: Request, res: Response) => {
  try {
    const { property, notes } = req.body
    const files = (req.files as Express.Multer.File[]) || []

    // Resize and encode photos
    const imageContents: Anthropic.ImageBlockParam[] = await Promise.all(
      files.map(async (file) => {
        const resized = await resizeImage(file.buffer)
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/jpeg' as const,
            data: resized.toString('base64'),
          },
        }
      })
    )

    const userContent: Anthropic.MessageParam['content'] = [
      ...imageContents,
      {
        type: 'text',
        text: USER_PROMPT_TEMPLATE(property, notes),
      },
    ]

    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const report = JSON.parse(jsonText)

    // Attach base64 photo data for rendering
    const photosBase64 = files.map((f) => `data:image/jpeg;base64,${f.buffer.toString('base64')}`)

    res.json({ report, photos: photosBase64 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[/api/analyze]', message, stack)
    res.status(500).json({ error: message })
  }
})

const QUALITY_CHECK_PROMPT = `You are reviewing a parking audit report that was just generated.
Your job is to identify meaningful gaps — things the auditor noted in the transcript that didn't make it into the report.

You will receive:
- The original transcript/notes
- The generated report JSON

Return JSON only, no preamble:

{
  "missed_observations": [
    {
      "quote": "exact phrase from the transcript that wasn't captured",
      "why_it_matters": "one sentence on why this was worth including"
    }
  ],
  "unused_strong_photos": [],
  "overall_coverage": "one sentence verdict on how well the report captured the transcript"
}

Only flag genuinely significant omissions from the transcript — not every minor detail.
If coverage is good, say so and return empty missed_observations array.
Do not invent problems that aren't clearly evidenced by the transcript.`

router.post('/quality-check', async (req: Request, res: Response) => {
  try {
    const { notes, report, photos } = req.body as {
      notes: string
      report: object
      photos: string[]
    }

    const userContent: Anthropic.MessageParam['content'] = [
      {
        type: 'text',
        text: `Original transcript/notes:\n${notes}\n\nGenerated report:\n${JSON.stringify(report, null, 2)}\n\nPlease review and return the quality check JSON.`,
      },
    ]

    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: QUALITY_CHECK_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    res.json(JSON.parse(jsonText))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/quality-check]', message)
    res.status(500).json({ error: message })
  }
})

router.post('/edit-report', async (req: Request, res: Response) => {
  try {
    const { report, instruction } = req.body as { report: object; instruction: string }

    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are editing an existing parking performance report JSON. Apply only the specific changes requested by the user. Preserve all other findings, tone, structure, and content exactly as-is. Return the same JSON structure with minimal changes — only touch what the instruction asks you to change. Return JSON only, no preamble, no markdown fencing.`,
      messages: [
        {
          role: 'user',
          content: `Here is the current report JSON:\n${JSON.stringify(report, null, 2)}\n\nApply this change:\n${instruction}\n\nReturn the updated report JSON with only the requested changes made.`,
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    res.json({ report: JSON.parse(jsonText) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/edit-report]', message)
    res.status(500).json({ error: message })
  }
})

router.post('/pdf', async (req: Request, res: Response) => {
  try {
    const { html, variant } = req.body as { html: string; variant: 'print' | 'email' }

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 900 })
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Trim document to actual content height to eliminate trailing blank pages
    await page.evaluate(() => {
      const h = document.body.scrollHeight
      document.body.style.height = h + 'px'
      document.documentElement.style.height = h + 'px'
    })

    const margin = variant === 'print' ? '0.75in' : '0.5in'

    const pdf = await page.pdf({
      format: 'Letter',
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
    })

    await browser.close()

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="parking-snapshot-${variant}.pdf"`,
    })
    res.send(Buffer.from(pdf))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'PDF generation failed', detail: String(err) })
  }
})
