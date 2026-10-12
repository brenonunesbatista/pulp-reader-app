// The app ships two prebuilt read-only databases:
//  - catalog.db (tools/build_catalog.py → public/catalog/, needs the reference PDF, built by hand)
//  - atlas.db   (tools/atlas/build_atlas.py → public/atlas/, rebuilt here from content/atlas and content/magazines on
//               every dev/build run; newer ones also arrive over the air, src/updates)
// This script copies both to public/assets/databases/ (where @capacitor-community/sqlite installs databases from) and
// writes public/catalog/databases.sha256 so the app reinstalls them only when one of them changed. Outputs are
// git-ignored.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const catalog = 'public/catalog/catalog.db'
const atlas = 'public/atlas/atlas.db'
if (!existsSync(catalog)) {
  console.error(`\n[copy-databases] ${catalog} is missing. Build it first (from the repo root):\n` +
    '  python tools/build_catalog.py --out app/public/catalog\n')
  process.exit(1)
}
// DRAFT_ABOUT=1 also ships draft magazine descriptions (preview builds, until they are reviewed)
const atlasArgs = ['../tools/atlas/build_atlas.py', ...(process.env.DRAFT_ABOUT ? ['--draft-about'] : [])]
const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', atlasArgs, { stdio: 'inherit' })
if (py.status !== 0) {
  console.error('\n[copy-databases] building atlas.db failed (see above; `python tools/atlas/validate.py` lists content errors)\n')
  process.exit(1)
}
mkdirSync('public/assets/databases', { recursive: true })
const hash = createHash('sha256')
for (const [src, name] of [[catalog, 'catalog.db'], [atlas, 'atlas.db']]) {
  copyFileSync(src, `public/assets/databases/${name}`)
  hash.update(readFileSync(src))
}
writeFileSync('public/catalog/databases.sha256', hash.digest('hex') + '\n')
