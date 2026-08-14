import { useState, useEffect } from 'react'
import type { QualityCheckResult, MissedObservation } from '../lib/types'
import styles from './QualityCheckPanel.module.css'

interface Props {
  result: QualityCheckResult | null
  loading: boolean
  onRegenerate: (selected: MissedObservation[]) => void
  onFreeformRegen: (text: string) => void
  regenLoading?: boolean
}

export function QualityCheckPanel({ result, loading, onRegenerate, onFreeformRegen, regenLoading }: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [freeformText, setFreeformText] = useState('')
  const [inlineMsg, setInlineMsg] = useState('')

  // Reset selections whenever a new QC result arrives
  useEffect(() => { setSelectedIndices(new Set()) }, [result])

  const toggleSelect = (i: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleFreeformSubmit = () => {
    if (!freeformText.trim()) {
      setInlineMsg('Add a note above to request changes')
      return
    }
    setInlineMsg('')
    onFreeformRegen(freeformText.trim())
    setFreeformText('')
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.checking}>
          <span className={styles.spinner} />
          Checking coverage…
        </div>
      </div>
    )
  }

  if (!result) return null

  const hasMissed = result.missed_observations.length > 0
  const selectedObs = result.missed_observations.filter((_, i) => selectedIndices.has(i))

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.label}>Quality Check</span>
        <span className={styles.verdict}>{result.overall_coverage}</span>
      </div>

      {hasMissed && (
        <div className={styles.group}>
          <h4 className={styles.groupTitle}>Missed observations — click to select, then regenerate</h4>
          <div className={styles.cards}>
            {result.missed_observations.map((obs, i) => {
              const selected = selectedIndices.has(i)
              return (
                <div
                  key={i}
                  className={`${styles.missedCard} ${selected ? styles.missedCardSelected : ''}`}
                  onClick={() => toggleSelect(i)}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === ' ' && toggleSelect(i)}
                >
                  <span className={styles.checkmark}>{selected ? '✓' : ''}</span>
                  <div>
                    <p className={styles.quote}>"{obs.quote}"</p>
                    <p className={styles.whyItMatters}>{obs.why_it_matters}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <button
            className={styles.regenBtn}
            onClick={() => onRegenerate(selectedObs)}
            disabled={selectedObs.length === 0 || regenLoading}
          >
            {regenLoading
              ? 'Regenerating…'
              : selectedObs.length === 0
                ? 'Select observations above to regenerate'
                : `Regenerate with ${selectedObs.length} selected`}
          </button>
        </div>
      )}

      <div className={styles.freeformSection}>
        <label className={styles.freeformLabel}>Anything you'd like to change?</label>
        <textarea
          className={styles.freeformTextarea}
          value={freeformText}
          onChange={(e) => { setFreeformText(e.target.value); setInlineMsg('') }}
          placeholder="e.g. soften the tone on the signage finding, add a note about the Giants game pricing, remove the fence breach finding..."
          rows={4}
        />
        {inlineMsg && <p className={styles.inlineMsg}>{inlineMsg}</p>}
        <button className={styles.freeformBtn} onClick={handleFreeformSubmit} disabled={regenLoading}>
          {regenLoading ? 'Regenerating…' : 'Apply changes and regenerate'}
        </button>
      </div>
    </div>
  )
}
