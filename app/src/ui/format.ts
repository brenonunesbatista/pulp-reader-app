const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROLE_LABEL = { author: 'Author', editor: 'Editor', cover_artist: 'Cover artist', translator: 'Translator' } as const

export const monthYear = (year: number, month: number) => `${MON[month - 1]} ${year}`
export const roleLabel = (r: keyof typeof ROLE_LABEL) => ROLE_LABEL[r]
/** catalog cover paths are relative to the catalog dir (public/catalog) */
export const coverUrl = (path: string | null) => (path ? `/catalog/${path}` : null)
