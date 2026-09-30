import { useState } from 'react'
import { SPIKE_ISSUES, type SpikeIssue } from './spike/config'
import { ReaderA } from './spike/readerA/ReaderA'
import { ReaderB } from './spike/readerB/ReaderB'
import './spike/spike.css'

type Open = { reader: 'A' | 'B'; issue: SpikeIssue } | null

// Phase 1 spike shell: pick a reader and an issue. No app UI beyond this.
export default function App() {
  const [open, setOpen] = useState<Open>(null)
  if (open?.reader === 'B') return <ReaderB issue={open.issue} onBack={() => setOpen(null)} />
  if (open?.reader === 'A') return <ReaderA issue={open.issue} onBack={() => setOpen(null)} />
  return (
    <main className="spike-home">
      <h1>Pulp Reader — reader spike</h1>
      <p>B = IIIF page images + OCR text layer (candidate). A = PDF.js baseline.</p>
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
