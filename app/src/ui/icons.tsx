// Banca icon set (docs/design/mockups/DS.dc.html): 24 px grid, 2 px stroke, round caps/joins.
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  contents: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  pages: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  light: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  theme: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 3v18M12 8h5M12 12h7M12 16h5',
  enhance: 'M4 19l5-14 5 14M6 14h6M18 3v6M15 6h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  highlight: 'M14 4l6 6-9 9H5v-6zM4 21h16',
  read: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  atlas: 'M3 12h18M7 8v8M12 5v14M17 9v6',
  person: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1-4 4-6 8-6s7 2 8 6',
  trash: 'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  pulp: 'M5 3h11l3 3v15H5zM9 8h6M9 12h6M9 16h4',
  dice: 'M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01',
  check: 'M5 12l5 5 9-10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  share: 'M12 4v11M8 8l4-4 4 4M5 13v7h14v-7',
  pause: 'M9 5v14M15 5v14',
  alert: 'M12 4v10M12 19h.01',
  cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1A4.5 4.5 0 0 0 7 18z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24, filled = false, stroke = 2 }: {
  name: IconName; size?: number; filled?: boolean; stroke?: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
