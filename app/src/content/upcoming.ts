// Magazines shown as "Coming soon" until their source adapters exist (docs/BACKLOG.md "Candidate sources").
// Temporary display data: replaced by catalog categories when the first new source lands (Phase 8).
export interface Upcoming {
  title: string
  years: string
  category: 'pulp' | 'rpg'
}

export const UPCOMING: Upcoming[] = [
  { title: 'Fantasy & Science Fiction', years: '1949–1984', category: 'pulp' },
  { title: 'Galaxy', years: '1950–1980', category: 'pulp' },
  { title: 'Fantastic', years: '1952–1980', category: 'pulp' },
  { title: "Asimov's Science Fiction", years: '1977–2014', category: 'pulp' },
  { title: 'The Twilight Zone Magazine', years: '1981–1989', category: 'pulp' },
  { title: 'Fame and Fortune Weekly', years: '1905–1928', category: 'pulp' },
  { title: 'Dragon', years: '1976–2013', category: 'rpg' },
  { title: 'Dungeon', years: '1986–2007', category: 'rpg' },
  { title: 'The Space Gamer', years: '1975–1985', category: 'rpg' },
]
