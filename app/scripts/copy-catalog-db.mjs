// The app needs the prebuilt catalog (tools/build_catalog.py → public/catalog/). This script:
//  - copies catalog.db to public/assets/databases/ (where @capacitor-community/sqlite installs databases from)
//  - writes public/catalog/catalog.sha256 so the app reinstalls the catalog only when it changed
// Both outputs are git-ignored.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const src = 'public/catalog/catalog.db'
if (!existsSync(src)) {
  console.error(`\n[copy-catalog-db] ${src} is missing. Build it first (from the repo root):\n` +
    '  python tools/build_catalog.py --source data/source/Amazing_Stories_Reference_Guide.pdf --out app/public/catalog\n')
  process.exit(1)
}
mkdirSync('public/assets/databases', { recursive: true })
copyFileSync(src, 'public/assets/databases/catalog.db')
writeFileSync('public/catalog/catalog.sha256', createHash('sha256').update(readFileSync(src)).digest('hex') + '\n')
