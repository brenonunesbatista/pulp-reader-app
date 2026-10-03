// Magazines shown as "Coming soon" until their source adapters exist (docs/BACKLOG.md "Candidate sources").
// Display data only: an entry disappears by itself once a magazine with the same name is in the catalog.
export interface Upcoming {
  title: string
  years: string
  category: 'pulp' | 'rpg' | 'comics'
}

export const UPCOMING: Upcoming[] = [
  { title: "Asimov's Science Fiction", years: '1977–2014', category: 'pulp' },
  { title: 'Fame and Fortune Weekly', years: '1905–1928', category: 'pulp' },
  { title: 'Dragon', years: '1976–2013', category: 'rpg' },
  { title: 'Dungeon', years: '1986–2007', category: 'rpg' },
  { title: 'The Space Gamer', years: '1975–1985', category: 'rpg' },
]
