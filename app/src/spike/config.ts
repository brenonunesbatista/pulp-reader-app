// Phase 1 spike configuration (throwaway). Issues chosen in docs/archive-findings.md.

export interface SpikeIssue {
  id: string
  label: string
  /** a known story start leaf (from docs/archive-findings.md) to test jumping */
  storyLeaf: number
}

export const SPIKE_ISSUES: SpikeIssue[] = [
  { id: 'AmazingStoriesVolume01Number01', label: 'Apr 1926', storyLeaf: 63 },
  { id: 'Amazing_Stories_v14n03_1940-03_cape1736', label: 'Mar 1940', storyLeaf: 7 },
  { id: 'Amazing_Stories_v30n03_1956-03', label: 'Mar 1956', storyLeaf: 9 },
]

/** low-res placeholder width (≈75–95 kB/page) */
export const LOW_WIDTH = 400
/** sharp width, capped by native width (IIIF returns 400 for upscaling) */
export const SHARP_WIDTH = 1200
/** decoded pages (ready to paint instantly): 1 behind, current, 2 ahead → max 4 (~8 MB each at 1200 px) */
export const DECODE_BEHIND = 1
export const DECODE_AHEAD = 2
/** downloaded but not decoded (~250 kB each; decoding takes tens of ms, the network takes 1–3 s) */
export const FETCH_AHEAD = 5
/** encoded blobs kept in memory */
export const BLOB_CACHE_PAGES = 30

export const USER_AGENT = 'PulpReader/0.1 (personal-use reader spike; github.com/brenonunesbatista/pulp-reader-app)'
