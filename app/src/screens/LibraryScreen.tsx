import { UPCOMING } from '../content/upcoming'
import { getContents, getIssuesByIds, listMagazines } from '../data/catalogRepo'
import { recentProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useDownloadList } from '../downloads/context'
import { useIsActive, useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Masthead, Screen, SectionHeader } from '../ui/components'
import { formatBytes, monthYear, coverTag } from '../ui/format'
import { useAsync } from '../ui/useAsync'

export function LibraryScreen() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const mags = useAsync(() => listMagazines(catalog), [catalog])
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
  }, [catalog, user, active])
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
              <button key={issue.id} className="shelf-item"
                      onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: progress.page })}>
                <Cover path={issue.coverPath} alt={issue.title} tag={coverTag(issue)} dl={issue.id} />
                <div className="progress-bar">
                  <i style={{ width: pageCount ? `${Math.round(((progress.page + 1) / pageCount) * 100)}%` : '0%' }} />
                </div>
                <div className="t">{monthYear(issue.year, issue.month)}</div>
                <div className="w num">{story ? `${story} · ` : ''}p. {progress.page + 1}</div>
              </button>
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

      <section>
        <SectionHeader title="Pulp magazines" />
        {mags.status === 'loading' && <Loading />}
        {mags.status === 'error' && <ErrorBox error={mags.error} />}
        <div className="mag-grid">
          {mags.status === 'ok' && mags.data.map((m) => (
            <button key={m.id} className="mag-card" onClick={() => nav.push({ name: 'magazine', id: m.id })}>
              <div className="mosaic">{m.covers.map((c) => <Cover key={c} path={c} small />)}</div>
              <div className="info">
                <div className="title">{m.name}</div>
                <div className="muted small num">{m.firstYear}–{m.lastYear}</div>
                <div className="muted small num">{m.issueCount} issues · {m.readable} readable</div>
                <span className="tag">OPEN</span>
              </div>
            </button>
          ))}
          {UPCOMING.filter((u) => u.category === 'pulp').map((u) => (
            <button key={u.title} className="mag-card" disabled>
              <div className="mosaic">{Array.from({ length: 6 }, (_, i) => <Cover key={i} path={null} small />)}</div>
              <div className="info">
                <div className="title">{u.title}</div>
                <div className="muted small num">{u.years}</div>
                <div className="muted small">Not yet indexed</div>
                <span className="tag soon">COMING SOON</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </Screen>
  )
}
