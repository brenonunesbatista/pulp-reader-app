import { useState } from 'react'
import { addSuggestion } from '../data/atlasRepo'
import { useDb } from '../db/useDb'

/** "Suggest for the Atlas": a subject, work or person to curate later (Settings → Atlas inbox → export). */
export function SuggestForm({ context, initial = '', onDone }: { context: string | null; initial?: string; onDone: () => void }) {
  const { user } = useDb()
  const [text, setText] = useState(initial)
  const [sent, setSent] = useState(false)
  if (sent) {
    return (
      <div className="a-suggest sent" role="status">
        Added to the Atlas inbox (Settings → Atlas inbox).
        <button className="btn small" type="button" onClick={onDone}>OK</button>
      </div>
    )
  }
  return (
    <form className="a-suggest" onSubmit={(e) => {
      e.preventDefault()
      if (!text.trim()) return
      void addSuggestion(user, text, context).then(() => setSent(true))
    }}>
      <label htmlFor="a-suggest-text">Suggest for the Atlas{context ? <span className="muted"> · from {context}</span> : null}</label>
      <textarea id="a-suggest-text" rows={2} value={text} autoFocus placeholder="A subject, work, person or path — e.g. “Dune on film and in music”"
                onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button className="btn small primary" type="submit" disabled={!text.trim()}>Add to inbox</button>
        <button className="btn small" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
