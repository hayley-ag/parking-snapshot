import { useEffect, useRef, useState } from 'react'
import type { SnapshotReport, Observation, Benchmark } from '../lib/types'
import QRCode from 'react-qr-code'
import styles from './ReportPage.module.css'
import {
  ChartLineUp, CreditCard, Signpost, Wrench, ShieldCheck,
  DeviceMobile, Globe, Buildings, ArrowUpRight,
  ChartBar, Gear, Star, TrendUp,
} from '@phosphor-icons/react'

interface Props {
  report: SnapshotReport
  photos: string[]
  innerRef?: React.RefObject<HTMLDivElement>
  isEditing?: boolean
  onReportChange?: (updated: SnapshotReport) => void
  pdfVariant?: 'print' | 'email'
}

const DEFAULT_CTA_TEXT = "We'd love to walk you through our findings and talk through what's possible for your property."

const CATEGORY_EMOJI: Record<string, string> = {
  Signage: '🪧',
  Pricing: '💰',
  Technology: '📱',
  Operations: '⚙️',
  'Customer Experience': '⭐',
  Revenue: '📈',
}

const BENCHMARK_ICON_MAP: Record<string, React.ElementType> = {
  Pricing: ChartLineUp,
  Rate: ChartLineUp,
  Payment: CreditCard,
  'Customer Experience': CreditCard,
  Signage: Signpost,
  Operations: Wrench,
  Maintenance: Wrench,
  Security: ShieldCheck,
  Enforcement: ShieldCheck,
  Technology: DeviceMobile,
  Online: Globe,
  Digital: Globe,
  Operator: Buildings,
  Accountability: Buildings,
}

function getBenchmarkIcon(icon?: string): React.ElementType {
  if (!icon) return ArrowUpRight
  const direct = BENCHMARK_ICON_MAP[icon]
  if (direct) return direct
  const lower = icon.toLowerCase()
  for (const [key, comp] of Object.entries(BENCHMARK_ICON_MAP)) {
    if (lower.includes(key.toLowerCase())) return comp
  }
  return ArrowUpRight
}

const VALUE_PROPS: { title: string; body: string; Icon: React.ElementType }[] = [
  {
    title: "Always Know What's Driving Your Results",
    body: "We capture data from every parking session to give you real-time visibility into your asset's performance, so you always understand what's happening and why.",
    Icon: ChartBar,
  },
  {
    title: 'Never Think About Operations Again',
    body: 'From enforcement and maintenance to driver support and tenant management, we handle the full operational load so you never have to.',
    Icon: Gear,
  },
  {
    title: 'A Better Experience for Every Driver',
    body: 'We manage every driver-facing touchpoint — signage, payment, support — so the experience at your property is seamless from the moment someone pulls in.',
    Icon: Star,
  },
  {
    title: 'Grow Your Revenue Without Lifting a Finger',
    body: 'We handle pricing, demand generation, and driver mix continuously, using real-time data to maximize what your asset earns every day.',
    Icon: TrendUp,
  },
]

// Single full-width image — cap portrait shots so they don't eat entire pages
const IMG_SINGLE = { maxHeight: '400px', width: 'auto', maxWidth: '100%', display: 'block' } as const
// 2-column grid cell image — fixed height so rows stay even
const IMG_GRID = { width: '100%', height: '260px', objectFit: 'cover' as const, display: 'block' } as const


function ObservationCard({
  obs, photos, isEditing, onChange,
}: {
  obs: Observation
  photos: string[]
  isEditing?: boolean
  onChange?: (updated: Observation) => void
}) {
  const upd = (patch: Partial<Observation>) => onChange?.({ ...obs, ...patch })
  const indices: number[] = obs.photo_indices?.length
    ? obs.photo_indices
    : obs.photoIndex !== null && obs.photoIndex !== undefined
      ? [obs.photoIndex]
      : []
  const cardPhotos = indices.map((i) => photos[i]).filter(Boolean)

  // When 4 photos have exactly 1 landscape image, move it to bottom-right (position 3)
  const [photoOrder, setPhotoOrder] = useState<number[] | null>(null)
  useEffect(() => {
    if (cardPhotos.length !== 4) { setPhotoOrder(null); return }
    let active = true
    const ratios = new Array<number>(4).fill(1)
    let remaining = 4
    cardPhotos.forEach((src, i) => {
      const img = new window.Image()
      img.onload = () => {
        // Rendered height at fixed width ∝ naturalHeight / naturalWidth
        ratios[i] = img.naturalHeight / img.naturalWidth
        if (--remaining === 0 && active) {
          // Sort tallest-rendered photos first so both rows have similar heights
          const order = [0, 1, 2, 3].sort((a, b) => ratios[b] - ratios[a])
          if (order.some((v, i) => v !== i)) {
            setPhotoOrder(order)
          } else {
            setPhotoOrder(null)
          }
        }
      }
      img.onerror = () => { if (--remaining === 0 && active) setPhotoOrder(null) }
      img.src = src
    })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardPhotos.join(',')])

  const orderedPhotos = photoOrder ? photoOrder.map((i) => cardPhotos[i]) : cardPhotos

  return (
    <div className={styles.findingCard}>
      <div className={styles.findingHeader}>
        <div className={styles.findingHeaderAnchor} data-finding-header>
          <div className={styles.findingMeta}>
            <span className={styles.findingIcon}>{CATEGORY_EMOJI[obs.category] ?? '🔍'}</span>
            <span className={styles.findingCategory}>{obs.category}</span>
          </div>
          {isEditing
            ? <input
                type="text"
                className={styles.editInput}
                value={obs.title}
                onChange={(e) => upd({ title: e.target.value })}
              />
            : <h3 className={styles.findingTitle}>{obs.title}</h3>
          }
        </div>
      </div>

      {/* findingBody is the single page-break-inside: avoid block */}
      <div className={styles.findingBody}>
        {orderedPhotos.length > 0 && (
          <div className={styles.findingPhotoRow}>
            <div className={styles.findingPhotoGrid}>
              {orderedPhotos.length === 1 ? (
                <div style={{ display: 'block' }}>
                  <img src={orderedPhotos[0]} alt={obs.title} style={IMG_SINGLE} />
                </div>
              ) : (
                <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <tbody>
                    {(() => {
                      const rows: string[][] = []
                      for (let i = 0; i < orderedPhotos.length; i += 2) rows.push(orderedPhotos.slice(i, i + 2))
                      return rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((src, ci) => (
                            <td key={ci} style={{ width: '50%', verticalAlign: 'top', padding: '4px' }}>
                              <img src={src} alt={`${obs.title} photo ${ri * 2 + ci + 1}`} style={IMG_GRID} />
                            </td>
                          ))}
                          {row.length === 1 && <td style={{ width: '50%' }} />}
                        </tr>
                      ))
                    })()}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <div className={styles.findingRow}>
          <span className={styles.findingRowLabel}>What we saw</span>
          {isEditing
            ? <textarea
                className={styles.editTextarea}
                value={obs.observation}
                onChange={(e) => upd({ observation: e.target.value })}
                rows={3}
              />
            : <p>{obs.observation}</p>
          }
        </div>
        <div className={styles.findingRow}>
          <span className={styles.findingRowLabel}>The opportunity</span>
          {isEditing
            ? <textarea
                className={styles.editTextarea}
                value={obs.opportunity}
                onChange={(e) => upd({ opportunity: e.target.value })}
                rows={2}
              />
            : <p>{obs.opportunity}</p>
          }
        </div>
        <div className={`${styles.findingRow} ${styles.findingRecommendation}`}>
          <span className={styles.findingRowLabel}>Recommendation</span>
          <p>{obs.recommendation}</p>
        </div>
      </div>
    </div>
  )
}

function BenchmarkCard({
  b, isEditing, onChange,
}: {
  b: Benchmark
  isEditing?: boolean
  onChange?: (updated: Benchmark) => void
}) {
  const BenchIcon = getBenchmarkIcon(b.icon)
  return (
    <div className={styles.benchmarkCard}>
      <BenchIcon size={20} color="var(--orange)" weight="bold" className={styles.benchmarkIcon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing
          ? <input
              type="text"
              className={styles.editInput}
              value={b.benchmark}
              onChange={(e) => onChange?.({ ...b, benchmark: e.target.value })}
            />
          : <h4 className={styles.benchmarkTitle}>{b.benchmark}</h4>
        }
        {isEditing
          ? <textarea
              className={styles.editTextarea}
              value={b.description}
              onChange={(e) => onChange?.({ ...b, description: e.target.value })}
              rows={2}
            />
          : <p className={styles.benchmarkDesc}>{b.description}</p>
        }
      </div>
    </div>
  )
}

function WhyAirGarage() {
  return (
    <section className={styles.whySection}>
      <p className={styles.whyEyebrow}>Why AirGarage</p>
      <h2 className={styles.whyHeadline}>A Partnership That Outperforms</h2>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', marginBottom: '12px' }}>
        <tbody>
          {(() => {
            const rows: (typeof VALUE_PROPS)[] = []
            for (let i = 0; i < VALUE_PROPS.length; i += 2) rows.push(VALUE_PROPS.slice(i, i + 2))
            return rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((vp, ci) => (
                  <td key={ci} style={{ width: '50%', verticalAlign: 'top', paddingRight: ci === 0 ? '28px' : '0', paddingBottom: '12px' }}>
                    <div className={styles.vpCard}>
                      <vp.Icon size={22} color="var(--orange)" weight="bold" className={styles.vpIcon} />
                      <h4 className={styles.vpTitle}>{vp.title}</h4>
                      <p className={styles.vpBody}>{vp.body}</p>
                    </div>
                  </td>
                ))}
              </tr>
            ))
          })()}
        </tbody>
      </table>
      <p className={styles.statBar}>
        142K+ Spaces&nbsp;&nbsp;|&nbsp;&nbsp;400+ Locations&nbsp;&nbsp;|&nbsp;&nbsp;40+ States&nbsp;&nbsp;|&nbsp;&nbsp;2M+ Drivers
      </p>
    </section>
  )
}

export function ReportPage({ report, photos, innerRef, isEditing, onReportChange, pdfVariant = 'email' }: Props) {
  const ownRef = useRef<HTMLDivElement>(null)
  const reportRef = innerRef ?? ownRef

  const updObs = (obs: Observation) => onReportChange?.({
    ...report,
    observations: report.observations.map((o) => o.id === obs.id ? obs : o),
  })

  const updBenchmark = (updated: Benchmark, idx: number) => onReportChange?.({
    ...report,
    opportunityAhead: report.opportunityAhead.map((b, i) => i === idx ? updated : b),
  })

  const ctaText = report.ctaText ?? DEFAULT_CTA_TEXT
  const DEFAULT_CTA_EMAIL_URL = 'https://www.airgarage.com/get-a-proposal?utm_medium=email&utm_source=saleshandy&utm_campaign=abm'
  const DEFAULT_CTA_EMAIL_TEXT = 'Book a Call with Your Local Market Expert →'
  const DEFAULT_CTA_PRINT_TEXT = 'Scan to book a call with your local market expert'
  const DEFAULT_CTA_PRINT_URL = 'https://www.airgarage.com/get-a-proposal?utm_medium=direct-mail&utm_source=abm&utm_campaign=abm'
  const ctaEmailUrl = report.ctaEmailUrl ?? DEFAULT_CTA_EMAIL_URL
  const ctaEmailText = report.ctaEmailText ?? DEFAULT_CTA_EMAIL_TEXT
  const ctaPrintText = report.ctaPrintText ?? DEFAULT_CTA_PRINT_TEXT
  const ctaPrintUrl = report.ctaPrintUrl ?? DEFAULT_CTA_PRINT_URL

  const reportBody = (
    <div ref={reportRef} className={styles.report}>
      {/* Cover page — dark top + white Executive Summary bottom, forced page break after */}
      <div className={styles.coverPage} data-pdf-page-break>
        {/* Dark top section */}
        <div className={styles.cover}>
          <div className={styles.coverTop}>
            <span className={styles.coverWordmark}>AirGarage</span>
            <p className={styles.coverEyebrow}>Parking Performance Snapshot</p>
          </div>

          <div className={styles.coverMiddle}>
            <h1 className={styles.coverProperty}>{report.property}</h1>
          </div>

          <div style={{ padding: '0 48px 20px' }}>
            <div className={styles.coverStats}>
              <div className={styles.coverStat}>
                <span className={styles.coverStatLabel}>Prepared by</span>
                <span className={styles.coverStatValue}>AirGarage</span>
              </div>
            </div>
          </div>

          <div className={styles.coverDivider} />
        </div>

        {/* White bottom — Executive Summary only */}
        <div className={styles.coverWhite}>
          <h2 className={styles.sectionHeading}>Executive Summary</h2>
          {isEditing
            ? <textarea
                className={`${styles.executiveSummary} ${styles.editTextarea}`}
                value={report.executiveSummary}
                onChange={(e) => onReportChange?.({ ...report, executiveSummary: e.target.value })}
                rows={4}
              />
            : <p className={styles.executiveSummary}>{report.executiveSummary}</p>
          }
        </div>
      </div>

      {/* Observations */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading} style={{ pageBreakBefore: 'avoid', breakBefore: 'avoid' }}>
          What We Noticed
        </h2>
        <div className={styles.findingsGrid}>
          {report.observations.map((obs: Observation, i: number) => (
            <div key={obs.id} data-finding-card>
              {i > 0 && <hr className={styles.findingDivider} />}
              <ObservationCard
                obs={obs}
                photos={photos}
                isEditing={isEditing}
                onChange={isEditing ? updObs : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Opportunity + Why + CTA + Footer always start on same page together */}
      <div data-pdf-block>
        {/* The Opportunity Ahead */}
        <section style={{ display: 'block', marginBottom: '28px' }}>
          <h2 className={styles.sectionHeading}>The Opportunity Ahead</h2>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', marginTop: '16px' }}>
            <tbody>
              {(() => {
                const items = report.opportunityAhead.slice(0, 4)
                const rows: typeof items[] = []
                for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
                return rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((b, ci) => (
                      <td key={ci} style={{ width: '50%', verticalAlign: 'top', paddingRight: ci === 0 ? '28px' : '0', paddingBottom: '14px' }}>
                        <BenchmarkCard
                          b={b}
                          isEditing={isEditing}
                          onChange={isEditing ? (updated) => updBenchmark(updated, report.opportunityAhead.indexOf(b)) : undefined}
                        />
                      </td>
                    ))}
                    {row.length === 1 && <td style={{ width: '50%' }} />}
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </section>

        {/* Why AirGarage */}
        <WhyAirGarage />

        {/* Let's Talk */}
        <section className={styles.ctaSection} style={{ marginTop: '28px' }}>
          <h2 className={styles.ctaHeading}>Let's Talk</h2>
          {isEditing
            ? <textarea
                className={`${styles.ctaText} ${styles.editTextarea} ${styles.editTextareaOnDark}`}
                value={ctaText}
                onChange={(e) => onReportChange?.({ ...report, ctaText: e.target.value })}
                rows={2}
              />
            : <p className={styles.ctaText}>{ctaText}</p>
          }
          {isEditing && (
            <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>
                Email button URL
                <input
                  className={`${styles.editInput} ${styles.editTextareaOnDark}`}
                  value={ctaEmailUrl}
                  onChange={(e) => onReportChange?.({ ...report, ctaEmailUrl: e.target.value })}
                  style={{ marginTop: '4px' }}
                />
              </label>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>
                Email button text
                <input
                  className={`${styles.editInput} ${styles.editTextareaOnDark}`}
                  value={ctaEmailText}
                  onChange={(e) => onReportChange?.({ ...report, ctaEmailText: e.target.value })}
                  style={{ marginTop: '4px' }}
                />
              </label>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>
                Direct mail button text
                <input
                  className={`${styles.editInput} ${styles.editTextareaOnDark}`}
                  value={ctaPrintText}
                  onChange={(e) => onReportChange?.({ ...report, ctaPrintText: e.target.value })}
                  style={{ marginTop: '4px' }}
                />
              </label>
              <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>
                Direct mail QR URL
                <input
                  className={`${styles.editInput} ${styles.editTextareaOnDark}`}
                  value={ctaPrintUrl}
                  onChange={(e) => onReportChange?.({ ...report, ctaPrintUrl: e.target.value })}
                  style={{ marginTop: '4px' }}
                />
              </label>
            </div>
          )}
          {pdfVariant === 'print'
            ? <div className={styles.ctaPrintRow}>
                <div className={styles.ctaQrBox}>
                  <QRCode value={ctaPrintUrl} size={64} bgColor="#ffffff" fgColor="#000000" />
                </div>
                <span className={`${styles.ctaButton} ${styles.ctaButtonPrint}`}>{ctaPrintText}</span>
              </div>
            : <a
                href={ctaEmailUrl}
                className={styles.ctaButton}
                target="_blank"
                rel="noopener noreferrer"
              >{ctaEmailText}</a>
          }
        </section>

        <footer className={styles.footer}>
          <img
            src="https://storage.googleapis.com/airgarage-public-assets/ag-logo-orange.svg"
            alt="AirGarage"
            className={styles.footerLogo}
            style={{ width: '24px', height: '24px', display: 'block' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span>© {new Date().getFullYear()} AirGarage — prepared for {report.property}</span>
        </footer>
      </div>
    </div>
  )

  return reportBody
}
