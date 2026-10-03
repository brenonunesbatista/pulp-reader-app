// Scan keys (catalog `ia_identifier`), pure: an IA item ("Galaxy_v01n01_1950-10") or one issue inside a "pack" item
// ("<item>/<stem>", Phase 8b: Dragon, Dungeon) whose page set, OCR and page list are the `<stem>_*` files of that item.

export function scanParts(key: string): { item: string; stem: string; pack: boolean } {
  const i = key.indexOf('/')
  return i < 0 ? { item: key, stem: key, pack: false } : { item: key.slice(0, i), stem: key.slice(i + 1), pack: true }
}

const IIIF_IMAGE = 'https://iiif.archive.org/image/iiif/3/'
/** the IIIF server cannot open sub-books whose names contain these (Dungeon "# 1 - … & …"): 404 for every encoding */
const IIIF_UNSAFE = /[#&]/

/** Image "service" of one page of a pack issue: a IIIF image id, or — for names IIIF cannot serve — a BookReader page
 *  URL template with `{w}` for the width (archive.org redirects it to the item's data server). `leafNum` = scandata leaf
 *  (IIIF file name), `index` = position among the issue's pages (BookReader `n<index>`). */
export function packPageSvc(item: string, stem: string, leafNum: number, index: number): string {
  if (IIIF_UNSAFE.test(stem)) {
    return `https://archive.org/download/${encodeURIComponent(item)}/page/n${index}_w{w}.jpg?subPrefix=${encodeURIComponent(stem)}`
  }
  return IIIF_IMAGE + encodeURIComponent(`${item}/${stem}_jp2.zip/${stem}_jp2/${stem}_${String(leafNum).padStart(4, '0')}.jp2`)
}

/** URL of a page image `width` px wide (≤ the page's full width) from its service */
export function sizedImageUrl(svc: string, width: number, fullWidth: number): string {
  const w = Math.min(width, fullWidth)
  if (svc.includes('{w}')) return svc.replace('{w}', String(w))
  return w >= fullWidth ? `${svc}/full/max/0/default.jpg` : `${svc}/full/${w},/0/default.jpg`
}
