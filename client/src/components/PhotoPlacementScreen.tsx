import { useRef, useState } from 'react'
import type { SnapshotReport, QualityCheckResult, MissedObservation } from '../lib/types'
import { generatePdfBlob, downloadZip } from '../lib/api'
import { ReportPage } from '../pages/ReportPage'
import { QualityCheckPanel } from './QualityCheckPanel'
import { SavedVersionsPanel } from './SavedVersionsPanel'
import { saveVersion } from '../lib/storage'
import type { SavedVersion } from '../lib/storage'
import styles from './PhotoPlacementScreen.module.css'

const CATEGORY_ICON: Record<string, string> = {
  Signage: '🪧',
  Pricing: '💰',
  Technology: '📱',
  Operations: '⚙️',
  'Customer Experience': '⭐',
  Revenue: '📈',
}

interface Props {
  report: SnapshotReport
  originalReport: SnapshotReport
  photos: string[]
  assignments: Record<string, number[]>
  onAssign: (obsId: string, indices: number[]) => void
  onReset: () => void
  onUpdateReport: (r: SnapshotReport) => void
  onResetReport: () => void
  regenLoading: boolean
  qcResult: QualityCheckResult | null
  qcLoading: boolean
  onRegenerate: (selected: MissedObservation[]) => void
  onFreeformRegen: (text: string) => void
  onLoadVersion: (v: SavedVersion) => void
}

export function PhotoPlacementScreen({
  report, originalReport, photos, assignments, onAssign, onReset,
  onUpdateReport, onResetReport,
  regenLoading, qcResult, qcLoading, onRegenerate, onFreeformRegen,
  onLoadVersion,
}: Props) {
  const pdfReportRef = useRef<HTMLDivElement>(null)
  const [pdfLoading, setPdfLoading] = useState<'print' | 'email' | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [mode, setMode] = useState<'place' | 'edit'>('place')
  const [pdfVariant, setPdfVariant] = useState<'print' | 'email'>('email')
  const [showSavedVersions, setShowSavedVersions] = useState(false)

  // Build merged report with user's photo assignments for PDF rendering
  const reportWithPhotos: SnapshotReport = {
    ...report,
    observations: report.observations.map((obs) => ({
      ...obs,
      photo_indices: assignments[obs.id] ?? [],
      photoIndex: assignments[obs.id]?.[0] ?? null,
    })),
  }

  const downloadBothPdfs = async () => {
    if (!pdfReportRef.current || pdfLoading) return
    try {
      setPdfLoading('email')
      setPdfVariant('email')
      await new Promise((r) => setTimeout(r, 100))
      const emailBlob = await generatePdfBlob(pdfReportRef.current, 'email')

      setPdfLoading('print')
      setPdfVariant('print')
      await new Promise((r) => setTimeout(r, 100))
      const printBlob = await generatePdfBlob(pdfReportRef.current, 'print')

      const base = `Property Snapshot_${report.property}_AirGarage`
      await downloadZip(
        [
          { filename: `${base}-email.pdf`, blob: emailBlob },
          { filename: `${base}-direct-mail.pdf`, blob: printBlob },
        ],
        `${base}.zip`
      )
    } catch {
      alert('PDF generation failed — please try again.')
    } finally {
      setPdfLoading(null)
      setPdfVariant('email')
    }
  }

  const handleSaveVersion = () => {
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const defaultLabel = `${report.property} — ${dateStr}`
    const label = prompt('Save version as:', defaultLabel)
    if (label === null) return
    const result = saveVersion({ label: label.trim() || defaultLabel, property: report.property, report, photos, assignments })
    if (!result.ok) {
      alert(result.error)
    } else {
      alert('Version saved.')
    }
  }

  const handleDrop = (obsId: string, slot: number, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverKey(null)
    const photoIndex = parseInt(e.dataTransfer.getData('photo-index'), 10)
    if (isNaN(photoIndex)) return

    const current = (assignments[obsId] ?? []).slice()
    const withoutPhoto = current.filter((v) => v !== photoIndex)
    const insertAt = Math.min(slot, withoutPhoto.length)
    withoutPhoto.splice(insertAt, 0, photoIndex)
    onAssign(obsId, withoutPhoto.slice(0, 4))
  }

  const removePhoto = (obsId: string, slot: number) => {
    const current = (assignments[obsId] ?? []).slice()
    current.splice(slot, 1)
    onAssign(obsId, current)
  }

  // When editing, pass reportWithPhotos so photos appear in context
  // onUpdateReport strips merged photo fields on the way back up via App
  const handleEditChange = (updated: SnapshotReport) => {
    onUpdateReport(updated)
  }

  return (
    <div className={styles.screen}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className={styles.backBtn} onClick={onReset} disabled={regenLoading}>
            {regenLoading ? 'Regenerating…' : '← New Snapshot'}
          </button>
          <button className={styles.resetBtn} onClick={() => setShowSavedVersions(true)}>
            Saved reports
          </button>
        </div>

        <div className={styles.modeToggle}>
          <button
            className={mode === 'place' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('place')}
          >
            Place Photos
          </button>
          <button
            className={mode === 'edit' ? styles.modeActive : styles.modeBtn}
            onClick={() => setMode('edit')}
          >
            Edit Report
          </button>
        </div>

        <div className={styles.toolbarRight}>
          <button className={styles.resetBtn} onClick={handleSaveVersion}>
            Save version
          </button>
          {mode === 'edit' && (
            <button className={styles.resetBtn} onClick={onResetReport} title="Restore original AI-generated text">
              Reset to AI version
            </button>
          )}
          <div className={styles.exportBtns}>
            <button
              className={styles.exportBtn}
              onClick={downloadBothPdfs}
              disabled={!!pdfLoading || regenLoading}
            >
              {pdfLoading === 'email' ? 'Generating email…' : pdfLoading === 'print' ? 'Generating direct mail…' : '⬇ Download PDFs (Email + Direct Mail)'}
            </button>
          </div>
        </div>
      </div>

      {/* Place Photos mode */}
      {mode === 'place' && (
        <>
          {photos.length > 0 && (
            <div className={styles.strip}>
              <span className={styles.stripLabel}>Your photos — drag to place</span>
              <div className={styles.stripScroll}>
                {photos.map((src, i) => (
                  <div
                    key={i}
                    className={styles.stripPhoto}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('photo-index', String(i))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <img src={src} alt={`Photo ${i + 1}`} />
                    <span className={styles.stripNum}>{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.content}>
            <div className={styles.findingsHeading}>
              <h2>Place photos on findings</h2>
              <p>Drag photos from the strip above onto each finding. Up to 4 photos per finding.</p>
            </div>

            <div className={styles.findingsList}>
              {report.observations.map((obs) => {
                const obsPhotos = assignments[obs.id] ?? []
                return (
                  <div key={obs.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardMeta}>
                        <span className={styles.cardIcon}>{CATEGORY_ICON[obs.category] ?? '🔍'}</span>
                        <span className={styles.cardCategory}>{obs.category}</span>
                      </div>
                      <h3 className={styles.cardTitle}>{obs.title}</h3>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.cardRow}>
                        <span className={styles.cardRowLabel}>What we saw</span>
                        <p>{obs.observation}</p>
                      </div>
                      <div className={styles.cardRow}>
                        <span className={styles.cardRowLabel}>The opportunity</span>
                        <p>{obs.opportunity}</p>
                      </div>
                    </div>

                    <div className={styles.dropZones}>
                      {[0, 1, 2, 3].map((slot) => {
                        const photoIdx = obsPhotos[slot]
                        const hasPhoto = photoIdx !== undefined
                        const isOver = dragOverKey === `${obs.id}-${slot}`
                        return (
                          <div
                            key={slot}
                            className={[
                              styles.dropZone,
                              isOver ? styles.dropZoneOver : '',
                              hasPhoto ? styles.dropZoneFilled : '',
                            ].join(' ')}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'copy'
                              setDragOverKey(`${obs.id}-${slot}`)
                            }}
                            onDragLeave={() => setDragOverKey(null)}
                            onDrop={(e) => handleDrop(obs.id, slot, e)}
                          >
                            {hasPhoto ? (
                              <div className={styles.droppedPhoto}>
                                <img src={photos[photoIdx]} alt="" />
                                <span className={styles.droppedNum}>{photoIdx + 1}</span>
                                <button
                                  className={styles.removeBtn}
                                  onClick={() => removePhoto(obs.id, slot)}
                                  type="button"
                                  aria-label="Remove photo"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <span className={styles.dropLabel}>Drop photo here</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <QualityCheckPanel
              result={qcResult}
              loading={qcLoading}
              onRegenerate={onRegenerate}
              onFreeformRegen={onFreeformRegen}
              regenLoading={regenLoading}
            />
          </div>
        </>
      )}

      {/* Edit Report mode */}
      {mode === 'edit' && (
        <div className={styles.editView}>
          <div className={styles.editBanner}>
            ✏️ Edit mode — click any text field to edit. Changes apply to the exported PDF immediately.
          </div>
          <ReportPage
            report={reportWithPhotos}
            photos={photos}
            isEditing
            onReportChange={handleEditChange}
          />
        </div>
      )}

      {/* Hidden ReportPage for PDF generation */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '-9999px',
          width: '900px',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <ReportPage
          report={reportWithPhotos}
          photos={photos}
          innerRef={pdfReportRef}
          pdfVariant={pdfVariant}
        />
      </div>

      {showSavedVersions && (
        <SavedVersionsPanel
          onClose={() => setShowSavedVersions(false)}
          onLoad={(v) => {
            setShowSavedVersions(false)
            onLoadVersion(v)
          }}
        />
      )}
    </div>
  )
}
