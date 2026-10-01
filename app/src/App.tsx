import { DbProvider } from './db/DbContext'
import { DownloadsProvider } from './downloads/DownloadsProvider'
import { ReaderScreen } from './reader/ReaderScreen'
import { NavProvider } from './nav/Nav'
import type { Route } from './nav/stack'
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
    case 'soon': return <ComingSoonScreen what={r.what} />
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
