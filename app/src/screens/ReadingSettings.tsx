import { useState } from 'react'
import { deleteAllProgress, recentProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useIsActive } from '../nav/context'
import { useAsync } from '../ui/useAsync'

/** Settings → Reading: forget the reading position of every issue (Continue reading empties). */
export function ReadingSettings() {
  const { user } = useDb()
  const active = useIsActive()
  const [tick, setTick] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const count = useAsync(async () => (await recentProgress(user, 100000)).length, [user, active, tick])
  const n = count.status === 'ok' ? count.data : 0
  const clear = async () => {
    if (!confirm) return setConfirm(true)
    setConfirm(false)
    await deleteAllProgress(user)
    setTick((t) => t + 1)
  }
  return (
    <section className="settings-group">
      <h3>Reading</h3>
      <p className="muted small num">{n === 0 ? 'No reading progress saved.' : `Reading progress saved for ${n} ${n === 1 ? 'issue' : 'issues'}.`}</p>
      <div className="btn-row">
        <button className={`btn danger ${confirm ? 'confirm' : ''}`} disabled={!n} onBlur={() => setConfirm(false)}
                onClick={() => void clear()}>
          {confirm ? `Clear progress of ${n === 1 ? '1 issue' : `${n} issues`}?` : 'Clear all reading progress'}
        </button>
      </div>
      <p className="muted small">Empties “Continue reading”. Highlights, bookmarks and downloads are kept. To forget one
        issue, use the × on its cover in the Library or <em>Clear progress</em> on the issue page.</p>
    </section>
  )
}
