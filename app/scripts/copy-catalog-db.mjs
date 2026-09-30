// @capacitor-community/sqlite copies prebuilt databases from public/assets/databases/*.db (git-ignored copy).
// The catalog itself is built by tools/build_catalog.py into public/catalog/.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

const src = 'public/catalog/catalog.db'
if (existsSync(src)) {
  mkdirSync('public/assets/databases', { recursive: true })
  copyFileSync(src, 'public/assets/databases/catalog.db')
} else {
  console.warn(`[copy-catalog-db] ${src} missing — run tools/build_catalog.py first`)
}
