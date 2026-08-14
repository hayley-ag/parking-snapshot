export interface Observation {
  id: string
  title: string
  category: 'Signage' | 'Pricing' | 'Technology' | 'Operations' | 'Customer Experience' | 'Revenue'
  priority: 'High' | 'Medium' | 'Low'
  observation: string
  opportunity: string
  recommendation: string
  photoIndex: number | null
  photo_indices?: number[]
}

export interface Benchmark {
  benchmark: string
  description: string
  icon?: string
}

export interface OriginalInputs {
  property: string
  notes: string
  photoFiles: File[]
}

export interface MissedObservation {
  quote: string
  why_it_matters: string
}

export interface UnusedPhoto {
  photo_index: number
  what_it_shows: string
  suggested_finding: string
}

export interface QualityCheckResult {
  missed_observations: MissedObservation[]
  unused_strong_photos: UnusedPhoto[]
  overall_coverage: string
}

export interface SnapshotReport {
  property: string
  executiveSummary: string
  observations: Observation[]
  opportunityAhead: Benchmark[]
  ctaText?: string
  ctaEmailUrl?: string
  ctaEmailText?: string
  ctaPrintText?: string
  ctaPrintUrl?: string
}
