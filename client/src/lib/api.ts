import type { SnapshotReport, QualityCheckResult } from './types'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import JSZip from 'jszip'

export async function analyzeProperty(formData: FormData): Promise<{ report: SnapshotReport; photos: string[] }> {
  const res = await fetch('/api/analyze', { method: 'POST', body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function runQualityCheck(
  notes: string,
  report: SnapshotReport,
  photos: string[]
): Promise<QualityCheckResult> {
  const res = await fetch('/api/quality-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes, report, photos }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function editReport(
  report: SnapshotReport,
  instruction: string
): Promise<SnapshotReport> {
  const res = await fetch('/api/edit-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, instruction }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.report
}

function findSafeSlice(canvas: HTMLCanvasElement, idealY: number, windowPx: number): number {
  const ctx = canvas.getContext('2d')
  if (!ctx) return idealY

  const w = canvas.width
  const startY = Math.max(0, Math.floor(idealY) - windowPx)
  const endY = Math.min(canvas.height - 1, Math.floor(idealY) + windowPx)
  const height = endY - startY + 1
  const { data } = ctx.getImageData(0, startY, w, height)

  let bestY = Math.floor(idealY)
  let bestScore = -Infinity

  for (let row = 0; row < height; row++) {
    let sum = 0, sumSq = 0
    for (let x = 0; x < w; x++) {
      const i = (row * w + x) * 4
      const b = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      sum += b
      sumSq += b * b
    }
    const avg = sum / w
    const variance = sumSq / w - avg * avg
    const stdDev = Math.sqrt(Math.max(0, variance))
    const distPenalty = (Math.abs(row - windowPx) / windowPx) * 15
    const score = avg - stdDev * 0.4 - distPenalty
    if (score > bestScore) { bestScore = score; bestY = startY + row }
  }

  return bestY
}

async function buildPdf(element: HTMLElement, variant: 'print' | 'email'): Promise<jsPDF> {
  const links = element.querySelectorAll<HTMLAnchorElement>('a[href]')
  const savedHrefs: string[] = []
  if (variant === 'print') {
    links.forEach((a, i) => { savedHrefs[i] = a.href; a.removeAttribute('href') })
  }

  // Tracks margin-top mutations so they can be undone in finally
  const modifiedCards: { el: HTMLElement; orig: string }[] = []

  try {
    const SCALE = 2
    const marginPt = variant === 'print' ? 54 : 36

    // ── Orphan-header pre-pass ────────────────────────────────────────────────
    // Compute the real jsPDF page height in DOM pixels from the element width.
    const contentWPt = 612 - marginPt * 2
    const jsPdfScale = contentWPt / (element.offsetWidth * SCALE)
    const domPxPerPage = (792 - marginPt * 2) / jsPdfScale / SCALE

    // Findings start after the cover (forced page break).
    const preTop = element.getBoundingClientRect().top
    const coverEl = element.querySelector('[data-pdf-page-break]')
    const coverBottom = coverEl ? coverEl.getBoundingClientRect().bottom - preTop : 0

    // For each finding header whose bottom falls in the last 180px of a page,
    // push the whole card (divider + card) down via margin-top so the header
    // lands at the top of the next page with its content intact.
    element.querySelectorAll<HTMLElement>('[data-finding-header]').forEach((headerEl) => {
      const headerBottom = headerEl.getBoundingClientRect().bottom - preTop
      const posAfterCover = headerBottom - coverBottom
      if (posAfterCover <= 0) return
      const posOnPage = posAfterCover % domPxPerPage
      if (posOnPage > domPxPerPage - 180) {
        const card = headerEl.closest<HTMLElement>('[data-finding-card]')
        if (card) {
          const push = Math.ceil(domPxPerPage - posOnPage + 20)
          modifiedCards.push({ el: card, orig: card.style.marginTop })
          card.style.marginTop = `${push}px`
        }
      }
    })

    // Wait for reflow if any cards were pushed
    if (modifiedCards.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    // ─────────────────────────────────────────────────────────────────────────

    const containerRect = element.getBoundingClientRect()

    // Measure every <img> and [data-pdf-block] element before capture.
    // These become forbidden cut zones — the slicer will never cut through them.
    const blockEls = [
      ...Array.from(element.querySelectorAll('img')),
      ...Array.from(element.querySelectorAll('[data-pdf-block]')),
    ]
    const blockZones = blockEls
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          top: Math.floor((r.top - containerRect.top) * SCALE) - 4,
          bottom: Math.ceil((r.bottom - containerRect.top) * SCALE) + 4,
        }
      })
      .filter((z) => z.bottom > z.top && z.bottom > 0)

    // Finding headers get a 100px buffer below them so the slicer can't cut
    // in the thin gap between the category/title and the first line of body content.
    // If a cut would land anywhere from the header top to 100px below the header
    // bottom, the slicer backs up to just before the header — a small, clean break.
    const HEADER_BUFFER_PX = 100
    const headerZones = Array.from(element.querySelectorAll('[data-finding-header]'))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          top: Math.floor((r.top - containerRect.top) * SCALE) - 4,
          bottom: Math.ceil((r.bottom - containerRect.top) * SCALE) + HEADER_BUFFER_PX * SCALE,
        }
      })
      .filter((z) => z.bottom > z.top && z.bottom > 0)

    const forbidden = [...blockZones, ...headerZones]

    // Clickable link zones (email variant only — print strips hrefs above).
    // Positions are captured in canvas-space so they can be re-projected onto
    // whichever page(s) they land on after slicing.
    const linkZones = variant === 'email'
      ? Array.from(links)
          .map((a) => {
            const r = a.getBoundingClientRect()
            return {
              top: Math.floor((r.top - containerRect.top) * SCALE),
              bottom: Math.ceil((r.bottom - containerRect.top) * SCALE),
              left: Math.floor((r.left - containerRect.left) * SCALE),
              right: Math.ceil((r.right - containerRect.left) * SCALE),
              href: a.href,
            }
          })
          .filter((z) => z.bottom > z.top && z.right > z.left)
      : []

    // Forced page-break points — slice exactly at the bottom edge of [data-pdf-page-break] elements
    const forcedBreaks = Array.from(element.querySelectorAll('[data-pdf-page-break]'))
      .map((el) => Math.ceil((el.getBoundingClientRect().bottom - containerRect.top) * SCALE))
      .filter((y) => y > 0)
      .sort((a, b) => a - b)

    const canvas = await html2canvas(element, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const pageH = 792
    const contentW = 612 - marginPt * 2
    const imgW = canvas.width
    const imgH = canvas.height
    const scale = contentW / imgW
    const pxPerPage = (pageH - marginPt * 2) / scale

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })

    let pageStart = 0
    let first = true
    while (pageStart < imgH) {
      if (!first) pdf.addPage()
      first = false

      const idealEnd = pageStart + pxPerPage
      let sliceEnd: number

      if (idealEnd >= imgH) {
        sliceEnd = imgH
      } else {
        // Priority 1: forced page breaks (cover, etc.)
        const forced = forcedBreaks.find((y) => y > pageStart && y <= idealEnd + pxPerPage * 0.4)
        if (forced) {
          sliceEnd = forced
        } else {
          // Check whether the ideal cut point falls inside a forbidden zone
          const hit = forbidden.find((z) => z.top < idealEnd && z.bottom > idealEnd)
          if (hit && hit.top > pageStart + 20) {
            sliceEnd = hit.top
          } else {
            sliceEnd = findSafeSlice(canvas, idealEnd, 120)
          }
        }
      }

      sliceEnd = Math.max(pageStart + 1, sliceEnd)
      // Absorb a tiny trailing sliver rather than creating a near-empty page
      if (sliceEnd < imgH && imgH - sliceEnd < pxPerPage * 0.12) {
        sliceEnd = imgH
      }
      const sliceH = sliceEnd - pageStart

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = imgW
      sliceCanvas.height = sliceH
      sliceCanvas.getContext('2d')!.drawImage(canvas, 0, pageStart, imgW, sliceH, 0, 0, imgW, sliceH)

      pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', marginPt, marginPt, contentW, sliceH * scale)

      // Overlay a real clickable link annotation wherever a link zone lands on this page slice
      linkZones.forEach((z) => {
        const zTop = Math.max(z.top, pageStart)
        const zBottom = Math.min(z.bottom, sliceEnd)
        if (zBottom <= zTop) return
        const linkX = marginPt + z.left * scale
        const linkY = marginPt + (zTop - pageStart) * scale
        const linkW = (z.right - z.left) * scale
        const linkH = (zBottom - zTop) * scale
        pdf.link(linkX, linkY, linkW, linkH, { url: z.href })
      })

      pageStart = sliceEnd
    }

    return pdf
  } finally {
    modifiedCards.forEach(({ el, orig }) => { el.style.marginTop = orig })
    if (variant === 'print') {
      links.forEach((a, i) => { if (savedHrefs[i]) a.href = savedHrefs[i] })
    }
  }
}

export async function generatePdfBlob(element: HTMLElement, variant: 'print' | 'email'): Promise<Blob> {
  const pdf = await buildPdf(element, variant)
  return pdf.output('blob')
}

// Bundles multiple already-built PDF blobs into one .zip so the browser only
// sees a single download action — Chrome silently drops the second of two
// automatic downloads that aren't each tied to their own user gesture.
export async function downloadZip(
  files: { filename: string; blob: Blob }[],
  zipFilename: string
): Promise<void> {
  const zip = new JSZip()
  files.forEach(({ filename, blob }) => zip.file(filename, blob))
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFilename
  a.click()
  URL.revokeObjectURL(url)
}
