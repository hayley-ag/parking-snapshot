import { useState } from 'react'
import type { SavedVersion } from '../lib/storage'
import { getSavedVersions, deleteVersion, updateVersionLabel } from '../lib/storage'

interface Props {
  onClose: () => void
  onLoad: (v: SavedVersion) => void
}

export function SavedVersionsPanel({ onClose, onLoad }: Props) {
  const [versions, setVersions] = useState<SavedVersion[]>(() => getSavedVersions())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const refresh = () => setVersions(getSavedVersions())

  const handleDelete = (id: string) => {
    if (!confirm('Delete this saved report?')) return
    deleteVersion(id)
    refresh()
  }

  const handleLabelClick = (v: SavedVersion) => {
    setEditingId(v.id)
    setEditingLabel(v.label)
  }

  const handleLabelBlur = (id: string) => {
    if (editingLabel.trim()) {
      updateVersionLabel(id, editingLabel.trim())
      refresh()
    }
    setEditingId(null)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '8px', width: '100%', maxWidth: '600px',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid #E8E8E8',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a' }}>
            Saved Reports
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer',
              color: '#666', lineHeight: 1, padding: '0 4px',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          {versions.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 24px', margin: 0 }}>
              No saved reports yet.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 24px', borderBottom: '1px solid #F0F0F0',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === v.id ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onBlur={() => handleLabelBlur(v.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLabelBlur(v.id) }}
                      style={{
                        border: '1.5px solid #FF6712', borderRadius: '4px', padding: '2px 6px',
                        fontSize: '0.9rem', fontWeight: 600, width: '100%', outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => handleLabelClick(v)}
                      title="Click to rename"
                      style={{
                        fontWeight: 600, fontSize: '0.9rem', color: '#1a1a1a', cursor: 'text',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {v.label}
                    </span>
                  )}
                  <span style={{ fontSize: '0.78rem', color: '#888', display: 'block', marginTop: '2px' }}>
                    {v.property} · {formatDate(v.savedAt)}
                  </span>
                </div>
                <button
                  onClick={() => onLoad(v)}
                  style={{
                    background: '#FF6712', color: 'white', border: 'none', borderRadius: '5px',
                    padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(v.id)}
                  style={{
                    background: 'none', border: 'none', color: '#cc2200', fontSize: '0.82rem',
                    cursor: 'pointer', flexShrink: 0, padding: '6px 4px',
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
