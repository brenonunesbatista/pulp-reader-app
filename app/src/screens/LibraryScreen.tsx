import { getContents, getIssuesByIds, listCategories, listMagazines } from '../data/catalogRepo'
import { deleteProgress, recentProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useDownloadList } from '../downloads/context'
import { useIsActive, useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Masthead, Screen, SectionHeader } from '../ui/components'
import { formatBytes, monthYear, coverTag } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import { useState } from 'react'
import { MagazineShelf } from './MagazineGrid'

export function LibraryScreen() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const [cleared, setCleared] = useState(0)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const mags = useAsync(async () => ({ categories: await listCategories(catalog), magazines: await listMagazines(catalog) }), [catalog])
  // reload the shelf whenever the Library becomes visible again (e.g. back from the reader)
  const shelf = useAsync(async () => {
    const recent = await recentProgress(user)
    const issues = await getIssuesByIds(catalog, recent.map((p) => p.issueId))
    return Promise.all(issues.map(async (issue) => {
      const progress = recent.find((p) => p.issueId === issue.id)!
      // story being read = last story starting at or before the saved leaf
      const toc = await getContents(catalog, issue.id)
      const story = [...toc].reverse().find((s) => s.iaLeaf !== null && s.iaLeaf <= progress.page)
      return { issue, progress, story: story?.title ?? null, pageCount: progress.pageCount }
    }))
  }, [catalog, user, active, cleared])
  const forget = async (issueId: number) => {
    if (confirmId !== issueId) return setConfirmId(issueId)
    setConfirmId(null)
    await deleteProgress(user, issueId)
    setCleared((n) => n + 1)
  }
  // "On this device": downloaded and downloading issues (re-queried only when the set of issues changes)
  const downloads = useDownloadList()
  const dlKey = downloads.map((d) => d.issueId).join(',')
  const onDevice = useAsync(() => getIssuesByIds(catalog, dlKey ? dlKey.split(',').map(Number) : []), [catalog, dlKey])
  const sizeOf = (id: number) => downloads.find((d) => d.issueId === id)

  return (
    <Screen masthead={<Masthead section="pulp" />} section="pulp">
      {shelf.status === 'ok' && shelf.data.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="Continue reading" />
          <div className="shelf">
            {shelf.data.map(({ issue, progress, story, pageCount }) => (
              <div key={issue.id} className="shelf-slot">
              <button className={`shelf-x ${confirmId === issue.id ? 'confirm' : ''}`} onBlur={() => setConfirmId(null)}
                      aria-label={`Remove ${issue.title} from Continue reading`} onClick={() => void forget(issue.id)}>
                {confirmId === issue.id ? 'Remove?' : <Icon name="close" size={16} stroke={2.6} />}
              </button>
              <button className="shelf-item"
                      onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: progress.page })}>
                <Cover path={issue.coverPath} alt={issue.title} tag={coverTag(issue)} dl={issue.id} />
                <div className="progress-bar">
                  <i style={{ width: pageCount ? `${Math.round(((progress.page + 1) / pageCount) * 100)}%` : '0%' }} />
                </div>
                <div className="t">{monthYear(issue.year, issue.month)}</div>
                <div className="w num">{story ? `${story} · ` : ''}p. {progress.page + 1}</div>
              </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {onDevice.status === 'ok' && onDevice.data.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="On this device" aside={<span className="aside num">
            {formatBytes(downloads.reduce((n, d) => n + d.bytes, 0))}</span>} />
          <div className="shelf">
            {onDevice.data.map((issue) => {
              const d = sizeOf(issue.id)
              return (
                <button key={issue.id} className="shelf-item" onClick={() => nav.push({ name: 'issue', id: issue.id })}>
                  <Cover path={issue.coverPath} alt={issue.title} tag={coverTag(issue)} dl={issue.id} />
                  <div className="t">{monthYear(issue.year, issue.month)}</div>
                  <div className="w num">{d?.state === 'done' ? formatBytes(d.bytes) : d?.state === 'paused' ? 'Paused' : d?.state === 'error' ? 'Failed' : 'Downloading…'}</div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {mags.status === 'loading' && <Loading />}
      {mags.status === 'error' && <ErrorBox error={mags.error} />}
      {/* every category without a tab of its own (RPG has one) */}
      {mags.status === 'ok' && mags.data.categories.filter((c) => c.slug !== 'rpg').map((c) => (
        <MagazineShelf key={c.slug} category={c} magazines={mags.data.magazines} />
      ))}
    </Screen>
  )
}
