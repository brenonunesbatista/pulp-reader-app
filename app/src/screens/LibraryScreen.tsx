import { getIssuesByIds, listCategories, listMagazines } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { useDownloadList } from '../downloads/context'
import { useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Masthead, Screen, SectionHeader } from '../ui/components'
import { coverTag, formatBytes, monthYear } from '../ui/format'
import { useAsync } from '../ui/useAsync'
import { ContinueReading } from './ContinueReading'
import { MagazineShelf } from './MagazineGrid'

export function LibraryScreen() {
  const { catalog } = useDb()
  const nav = useNav()
  const mags = useAsync(async () => ({ categories: await listCategories(catalog), magazines: await listMagazines(catalog) }), [catalog])
  // "On this device": downloaded and downloading issues (re-queried only when the set of issues changes)
  const downloads = useDownloadList()
  const dlKey = downloads.map((d) => d.issueId).join(',')
  const onDevice = useAsync(() => getIssuesByIds(catalog, dlKey ? dlKey.split(',').map(Number) : []), [catalog, dlKey])
  const sizeOf = (id: number) => downloads.find((d) => d.issueId === id)

  return (
    <Screen masthead={<Masthead section="pulp" />} section="pulp">
      <ContinueReading />

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
      {/* every category without a tab of its own (RPG and Comics have one) */}
      {mags.status === 'ok' && mags.data.categories.filter((c) => c.slug !== 'rpg' && c.slug !== 'comics').map((c) => (
        <MagazineShelf key={c.slug} category={c} magazines={mags.data.magazines} />
      ))}
    </Screen>
  )
}
