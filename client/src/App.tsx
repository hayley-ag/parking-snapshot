import { useState, useCallback } from 'react'
import { FormPage } from './pages/FormPage'
import { PhotoPlacementScreen } from './components/PhotoPlacementScreen'
import { analyzeProperty, runQualityCheck, editReport } from './lib/api'
import type { SnapshotReport, OriginalInputs, QualityCheckResult, MissedObservation } from './lib/types'
import type { SavedVersion } from './lib/storage'

export default function App() {
  const [report, setReport] = useState<SnapshotReport | null>(null)
  const [originalReport, setOriginalReport] = useState<SnapshotReport | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [inputs, setInputs] = useState<OriginalInputs | null>(null)
  const [photoAssignments, setPhotoAssignments] = useState<Record<string, number[]>>({})

  const [qcResult, setQcResult] = useState<QualityCheckResult | null>(null)
  const [qcLoading, setQcLoading] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)

  const triggerQualityCheck = useCallback(async (
    currentReport: SnapshotReport,
    currentInputs: OriginalInputs
  ) => {
    setQcResult(null)
    setQcLoading(true)
    try {
      const result = await runQualityCheck(currentInputs.notes, currentReport, [])
      setQcResult(result)
    } catch (err) {
      console.error('Quality check failed:', err)
    } finally {
      setQcLoading(false)
    }
  }, [])

  const handleReport = useCallback((
    r: SnapshotReport,
    p: string[],
    i: OriginalInputs
  ) => {
    setReport(r)
    setOriginalReport(r)
    setPhotos(p)
    setInputs(i)
    setQcResult(null)
    setPhotoAssignments({})
    triggerQualityCheck(r, i)
  }, [triggerQualityCheck])

  const handleRegenerate = useCallback(async (selected: MissedObservation[]) => {
    if (!inputs) return
    setRegenLoading(true)

    const missedList = selected.map((o) => `- "${o.quote}"`).join('\n')
    const appendix = [
      'IMPORTANT: A previous version of this report missed the following observations from the transcript. You must include these in the report:',
      missedList,
    ].join('\n')
    const augmentedNotes = `${inputs.notes}\n\n${appendix}`

    try {
      const fd = new FormData()
      fd.append('property', inputs.property)
      fd.append('notes', augmentedNotes)
      inputs.photoFiles.forEach((f) => fd.append('photos', f))

      const result = await analyzeProperty(fd)
      const newInputs = { ...inputs, notes: augmentedNotes }
      setReport(result.report)
      setOriginalReport(result.report)
      setPhotos(result.photos)
      setInputs(newInputs)
      setQcResult(null)
      triggerQualityCheck(result.report, newInputs)
    } catch (err) {
      console.error('Regeneration failed:', err)
      alert('Regeneration failed — please try again.')
    } finally {
      setRegenLoading(false)
    }
  }, [inputs, triggerQualityCheck])

  const handleFreeformRegen = useCallback(async (freeformText: string) => {
    if (!inputs || !report) return
    setRegenLoading(true)
    try {
      const updatedReport = await editReport(report, freeformText)
      setReport(updatedReport)
      setOriginalReport(updatedReport)
      setQcResult(null)
      triggerQualityCheck(updatedReport, inputs)
    } catch (err) {
      console.error('Edit failed:', err)
      alert('Edit failed — please try again.')
    } finally {
      setRegenLoading(false)
    }
  }, [inputs, report, triggerQualityCheck])

  const handleUpdateReport = useCallback((updated: SnapshotReport) => {
    setReport(updated)
  }, [])

  const handleResetReport = useCallback(() => {
    if (originalReport) setReport(originalReport)
  }, [originalReport])

  const handleLoadVersion = useCallback((v: SavedVersion) => {
    setReport(v.report)
    setOriginalReport(v.report)
    setPhotos(v.photos)
    setPhotoAssignments(v.assignments)
    setInputs({ property: v.property, notes: '', photoFiles: [] })
    setQcResult(null)
    setQcLoading(false)
  }, [])

  const handleReset = () => {
    setReport(null)
    setOriginalReport(null)
    setPhotos([])
    setInputs(null)
    setPhotoAssignments({})
    setQcResult(null)
    setQcLoading(false)
  }

  if (!report) {
    return <FormPage onReport={handleReport} />
  }

  return (
    <PhotoPlacementScreen
      report={report}
      originalReport={originalReport!}
      photos={photos}
      assignments={photoAssignments}
      onAssign={(obsId, indices) =>
        setPhotoAssignments((prev) => ({ ...prev, [obsId]: indices }))
      }
      onReset={handleReset}
      onUpdateReport={handleUpdateReport}
      onResetReport={handleResetReport}
      regenLoading={regenLoading}
      qcResult={qcResult}
      qcLoading={qcLoading}
      onRegenerate={handleRegenerate}
      onFreeformRegen={handleFreeformRegen}
      onLoadVersion={handleLoadVersion}
    />
  )
}
