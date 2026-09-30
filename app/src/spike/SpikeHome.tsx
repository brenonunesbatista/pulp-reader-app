// Phase 1 developer tools (long-press the Library title): reader A/B benchmark + catalog check. Removed in Phase 3.
import { useState } from 'react'
import { useNav } from '../nav/context'
import { CatalogSpike } from './catalog/CatalogSpike'
import { SPIKE_ISSUES, type SpikeIssue } from './config'
import { ReaderA } from './readerA/ReaderA'
import { ReaderB } from './readerB/ReaderB'

type Open =
  | { reader: 'A' | 'B'; issue: SpikeIssue; startLeaf?: number; from?: 'catalog' }
  | { reader: 'catalog' }
  | null

export function SpikeHome() {
  const nav = useNav()
  const [open, setOpen] = useState<Open>(null)
  if (open?.reader === 'catalog') {
    return (
      <CatalogSpike onBack={() => setOpen(null)} onRead={(r) => setOpen({
        reader: 'B', issue: { id: r.id, label: r.label, storyLeaf: r.leaf }, startLeaf: r.leaf, from: 'catalog' })} />
    )
  }
  if (open?.reader === 'B') {
    return <ReaderB issue={open.issue} startLeaf={open.startLeaf}
                    onBack={() => setOpen(open.from === 'catalog' ? { reader: 'catalog' } : null)} />
  }
  if (open?.reader === 'A') return <ReaderA issue={open.issue} onBack={() => setOpen(null)} />
  return (
    <main className="spike-home screen">
      <p><button onClick={nav.back}>‹ Back to the app</button></p>
      <h1>Developer tools (Phase 1 spike)</h1>
      <p><button onClick={() => setOpen({ reader: 'catalog' })}>Catalog check (Part B)</button></p>
      <p>B = IIIF page images + OCR text layer (chosen). A = PDF.js baseline.</p>
      <table>
        <tbody>
          {SPIKE_ISSUES.map((issue) => (
            <tr key={issue.id}>
              <td>{issue.label}</td>
              <td><code>{issue.id}</code></td>
              <td><button onClick={() => setOpen({ reader: 'B', issue })}>Open in B</button></td>
              <td><button onClick={() => setOpen({ reader: 'A', issue })}>Open in A</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
