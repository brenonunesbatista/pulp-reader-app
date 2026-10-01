// Reader engine tuning (measured in Phase 1: docs/archive-findings.md, docs/DECISIONS.md).

/** low-res placeholder width (≈75–95 kB/page) */
export const LOW_WIDTH = 400
/** sharp width, capped by native width (IIIF returns 400 for upscaling) */
export const SHARP_WIDTH = 1200
/** thumbnails: bottom strip and page index */
export const THUMB_WIDTH = 120
export const INDEX_THUMB_WIDTH = 200
/** decoded reading units (ready to paint instantly): 1 behind, current, 2 ahead (~8 MB per page at 1200 px) */
export const DECODE_BEHIND = 1
export const DECODE_AHEAD = 2
/** units downloaded but not decoded (~250 kB per page; decoding takes tens of ms, the network 1–3 s) */
export const FETCH_AHEAD = 5
/** encoded blobs kept in memory */
export const BLOB_CACHE_PAGES = 40

export const USER_AGENT = 'Banca/0.3 (personal-use magazine reader; github.com/brenonunesbatista/pulp-reader-app)'
