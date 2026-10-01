import { DbProvider } from './db/DbContext'
import { NavProvider } from './nav/Nav'
import type { Route } from './nav/stack'
import { ComingSoonScreen } from './screens/ComingSoonScreen'
import { IssueScreen } from './screens/IssueScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { MagazineScreen } from './screens/MagazineScreen'
import { PersonScreen } from './screens/PersonScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SpikeHome } from './spike/SpikeHome'
import { SettingsProvider } from './ui/SettingsProvider'

function screenFor(r: Route) {
  switch (r.name) {
    case 'library': return <LibraryScreen />
    case 'magazine': return <MagazineScreen id={r.id} />
    case 'issue': return <IssueScreen id={r.id} />
    case 'person': return <PersonScreen id={r.id} />
    case 'search': return <SearchScreen initial={r.q} />
    case 'reader': return <ReaderScreen issueId={r.issueId} leaf={r.leaf} />
    case 'settings': return <SettingsScreen />
    case 'soon': return <ComingSoonScreen what={r.what} />
    case 'dev': return <SpikeHome />
  }
}

export default function App() {
  return (
    <DbProvider>
      <SettingsProvider>
        <NavProvider render={screenFor} />
      </SettingsProvider>
    </DbProvider>
  )
}
