// Copies pdf.js runtime assets (JPX/JBIG2 wasm decoders, standard fonts) to public/pdfjs/ (git-ignored).
// IA PDFs are MRC scans with JPEG2000/JBIG2 images: without the wasm decoders pages render blank.
import { cpSync } from 'node:fs'

for (const dir of ['wasm', 'standard_fonts']) {
  cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true })
}
