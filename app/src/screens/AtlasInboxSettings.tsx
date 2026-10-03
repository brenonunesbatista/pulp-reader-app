import { useState } from 'react'
import { clearInbox, deleteInboxItem, listInbox } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { inboxMarkdown } from '../atlas/subject'
import { useIsActive } from '../nav/context'
import { copyText, shareMarkdown } from '../notes/share'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

/** Settings → Atlas inbox: suggestions and searches that found nothing, exported as Markdown for curation. */
export function AtlasInboxSettings() {
  const { user } = useDb()
  const active = useIsActive()
  const [tick, setTick] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const items = useAsync(() => listInbox(user), [user, tick, active])
  const list = items.status === 'ok' ? items.data : []
  const refresh = () => setTick((t) => t + 1)
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(null), 2000) }
  const md = () => inboxMarkdown(list)

  return (
    <section className="settings-group">
      <h3>Atlas inbox</h3>
      <p className="muted small">
        Your suggestions and the Atlas searches that found nothing. Export them and paste them into the conversation that
        curates the Atlas; new entries come back for review.
      </p>
      {list.length === 0 && <p className="muted small">Empty. Use “Suggest” on the Atlas home or on any Atlas page.</p>}
      {list.length > 0 && (
        <ul className="inbox-list">
          {list.map((i) => (
            <li key={i.id}>
              <span className={`kind ${i.kind}`}>{i.kind === 'search' ? 'Search' : 'Idea'}</span>
              <span className="txt">
                {i.kind === 'search' ? `“${i.text}”` : i.text}
                <span className="muted small num">
                  {i.context ? ` · from ${i.context}` : ''}{i.count > 1 ? ` · ×${i.count}` : ''} · {new Date(i.updatedAt).toISOString().slice(0, 10)}
                </span>
              </span>
              <button className="icon-btn" aria-label="Remove" onClick={() => void deleteInboxItem(user, i.id).then(refresh)}><Icon name="trash" size={20} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <button className="btn" disabled={!list.length}
                onClick={() => void shareMarkdown(`banca-atlas-inbox-${new Date().toISOString().slice(0, 10)}.md`, md(), 'Banca Atlas inbox')}>
          <Icon name="share" size={20} />Export
        </button>
        <button className="btn" disabled={!list.length} onClick={() => void copyText(md()).then(() => flash('Copied'))}>
          <Icon name="copy" size={20} />Copy
        </button>
        <button className={`btn danger ${confirm ? 'confirm' : ''}`} disabled={!list.length} onBlur={() => setConfirm(false)}
                onClick={() => {
                  if (!confirm) return setConfirm(true)
                  setConfirm(false)
                  void clearInbox(user).then(refresh)
                }}>
          {confirm ? 'Clear the inbox?' : 'Clear'}
        </button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
    </section>
  )
}
