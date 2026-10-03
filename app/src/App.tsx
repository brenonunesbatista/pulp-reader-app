import { DbProvider } from './db/DbContext'
import { DownloadsProvider } from './downloads/DownloadsProvider'
import { ReaderScreen } from './reader/ReaderScreen'
import { NavProvider } from './nav/Nav'
import type { Route } from './nav/stack'
import { AtlasHomeScreen } from './atlas/AtlasHomeScreen'
import { EntityScreen } from './atlas/EntityScreen'
import { PathScreen } from './atlas/PathScreen'
import { TimelineScreen } from './atlas/TimelineScreen'
import { WantToScreen } from './atlas/WantToScreen'
import { ComingSoonScreen } from './screens/ComingSoonScreen'
import { IssueScreen } from './screens/IssueScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { MagazineScreen } from './screens/MagazineScreen'
import { NotesScreen } from './screens/NotesScreen'
import { PersonScreen } from './screens/PersonScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SettingsProvider } from './ui/SettingsProvider'

function screenFor(r: Route) {
  switch (r.name) {
    case 'library': return <LibraryScreen />
    case 'magazine': return <MagazineScreen id={r.id} />
    case 'issue': return <IssueScreen id={r.id} />
    case 'person': return <PersonScreen id={r.id} />
    case 'search': return <SearchScreen initial={r.q} />
    case 'reader': return <ReaderScreen issueId={r.issueId} leaf={r.leaf} storyId={r.storyId} />
    case 'settings': return <SettingsScreen />
    case 'notes': return <NotesScreen />
    case 'soon': return r.what === 'atlas' ? <AtlasHomeScreen /> : <ComingSoonScreen what={r.what} />
    case 'atlas': return <AtlasHomeScreen />
    case 'timeline': return <TimelineScreen focus={r.focus} subject={r.subject} saved={r.saved} />
    case 'entity': return <EntityScreen id={r.id} />
    case 'path': return <PathScreen id={r.id} />
    case 'wantTo': return <WantToScreen list={r.list} />
  }
}

export default function App() {
  return (
    <DbProvider>
      <SettingsProvider>
        <DownloadsProvider>
          <NavProvider render={screenFor} />
        </DownloadsProvider>
      </SettingsProvider>
    </DbProvider>
  )
}
