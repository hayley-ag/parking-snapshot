import type { SnapshotReport } from './types'

export interface SavedVersion {
  id: string
  label: string
  savedAt: string
  property: string
  report: SnapshotReport
  photos: string[]  // base64 data URLs
  assignments: Record<string, number[]>
}

const STORAGE_KEY = 'ag_snapshot_versions'
const MAX_VERSIONS = 20

export function getSavedVersions(): SavedVersion[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

export function saveVersion(v: Omit<SavedVersion, 'id' | 'savedAt'>): { ok: boolean; error?: string } {
  const existing = getSavedVersions()
  if (existing.length >= MAX_VERSIONS) {
    return { ok: false, error: `You have ${MAX_VERSIONS} saved versions — delete one before saving a new one.` }
  }
  const newV: SavedVersion = { ...v, id: crypto.randomUUID(), savedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([newV, ...existing]))
  return { ok: true }
}

export function deleteVersion(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavedVersions().filter(v => v.id !== id)))
}

export function updateVersionLabel(id: string, label: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavedVersions().map(v => v.id === id ? { ...v, label } : v)))
}
