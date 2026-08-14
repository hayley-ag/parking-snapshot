import { useState, useRef } from 'react'
import { analyzeProperty } from '../lib/api'
import type { SnapshotReport, OriginalInputs } from '../lib/types'
import styles from './FormPage.module.css'

interface Props {
  onReport: (report: SnapshotReport, photos: string[], inputs: OriginalInputs) => void
  prefill?: Partial<OriginalInputs>
}

const TEST_PROPERTY = '801 Bryant Street Surface Lot'
const TEST_NOTES = `This recording is for the surface lot at 801 Bryant. There's random trash in the parking lot, overgrown weeds on the perimeter, signs that are down. Their signage takes up a lot of space listing nearby destinations — and jury duty is spelled wrong on the sign, it says Judy Duty. There are signs advertising SpotHero, ParkWhiz, Way.com, and a physical machine — very confusing as a driver. The machine charges $40 for 24 hours but ParkWhiz only charges $30 for the same thing, so ParkWhiz is undercutting the machine and taking a commission on top. No dynamic pricing — same rate on a Giants game day as a regular Tuesday. No cameras visible or confirmed operational. A section of the perimeter fence has been pulled apart allowing free pedestrian entry. Someone appears to have set up a makeshift desk in a corner of the lot.`

function makePlaceholder(label: string, hue: number): File {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `hsl(${hue}, 12%, 42%)`
  ctx.fillRect(0, 0, 800, 600)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 400, 300)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], `${label}.jpg`, { type: 'image/jpeg' })
}

export function FormPage({ onReport, prefill }: Props) {
  const [property, setProperty] = useState(prefill?.property ?? '')
  const [notesMode, setNotesMode] = useState<'transcript' | 'field'>('transcript')
  const [notes, setNotes] = useState(prefill?.notes ?? '')
  const [photos, setPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).slice(0, 15 - photos.length)
    setPhotos((prev) => [...prev, ...arr].slice(0, 15))
  }

  const removePhoto = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i))

  const runAnalysis = async (p: string, n: string, photoFiles: File[]) => {
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('property', p)
      fd.append('notes', n)
      photoFiles.forEach((f) => fd.append('photos', f))
      const result = await analyzeProperty(fd)
      onReport(result.report, result.photos, { property: p, notes: n, photoFiles })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!property || !notes.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    await runAnalysis(property, notes, photos)
  }

  const handleLoadTest = async () => {
    const placeholders = [
      makePlaceholder('Test Photo 1', 210),
      makePlaceholder('Test Photo 2', 200),
      makePlaceholder('Test Photo 3', 220),
    ]
    setProperty(TEST_PROPERTY)
    setNotes(TEST_NOTES)
    setNotesMode('transcript')
    setPhotos(placeholders)
    await runAnalysis(TEST_PROPERTY, TEST_NOTES, placeholders)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <img
          src="https://storage.googleapis.com/airgarage-public-assets/ag-logo-orange.svg"
          alt="AirGarage"
          className={styles.logo}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div>
          <h1 className={styles.title}>Parking Performance Snapshot</h1>
          <p className={styles.subtitle}>CEO Site Visit Report Generator</p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Property Details</h2>
          <div className={styles.field}>
            <label className={styles.label}>Property address or name *</label>
            <input
              className={styles.input}
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              placeholder="e.g. 801 Bryant St or Downtown Parking Garage"
              required
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Photos</h2>
          <div
            className={styles.dropzone}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          >
            <span className={styles.dropzoneIcon}>📷</span>
            <span>Click or drag photos here (up to 15)</span>
            <span className={styles.dropzoneHint}>JPG, PNG, HEIC — max 20 MB each</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          {photos.length > 0 && (
            <div className={styles.photoGrid}>
              {photos.map((p, i) => (
                <div key={i} className={styles.photoThumb}>
                  <img src={URL.createObjectURL(p)} alt={`Photo ${i + 1}`} />
                  <button
                    type="button"
                    className={styles.photoRemove}
                    onClick={() => removePhoto(i)}
                    aria-label="Remove photo"
                  >×</button>
                  <span className={styles.photoNum}>{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.notesHeader}>
            <h2 className={styles.sectionTitle}>Notes *</h2>
            <div className={styles.toggle}>
              <button
                type="button"
                className={notesMode === 'transcript' ? styles.toggleActive : styles.toggleBtn}
                onClick={() => setNotesMode('transcript')}
              >
                Paste transcript
              </button>
              <button
                type="button"
                className={notesMode === 'field' ? styles.toggleActive : styles.toggleBtn}
                onClick={() => setNotesMode('field')}
              >
                Type field notes
              </button>
            </div>
          </div>
          <textarea
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              notesMode === 'transcript'
                ? 'Paste your voice memo transcript or call notes here…'
                : 'Type your field observations here. Note what you saw, any issues, pricing, signage, equipment, cleanliness, etc.'
            }
            rows={12}
            required
          />
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.submitRow}>
          <button
            type="button"
            className={styles.testBtn}
            onClick={handleLoadTest}
            disabled={loading}
          >
            Load test data →
          </button>
          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} />
                Analyzing property…
              </>
            ) : (
              'Generate Snapshot →'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
