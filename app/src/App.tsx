import { useState } from 'react'
import { CatalogSpike } from './spike/catalog/CatalogSpike'
import { SPIKE_ISSUES, type SpikeIssue } from './spike/config'
import { ReaderA } from './spike/readerA/ReaderA'
import { ReaderB } from './spike/readerB/ReaderB'
import './spike/spike.css'

type Open =
  | { reader: 'A' | 'B'; issue: SpikeIssue; startLeaf?: number; from?: 'catalog' }
  | { reader: 'catalog' }
  | null

// Phase 1 spike shell: pick a reader and an issue, or the catalog check. No app UI beyond this.
export default function App() {
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
    <main className="spike-home">
      <h1>Pulp Reader — spike</h1>
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
