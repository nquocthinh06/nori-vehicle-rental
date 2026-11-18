import type { SVGProps } from 'react'

export type IconName =
  | 'arrow-right'
  | 'arrow-up-right'
  | 'arrow-left'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'car'
  | 'motorbike'
  | 'pickup'
  | 'calendar'
  | 'pin'
  | 'search'
  | 'user'
  | 'menu'
  | 'close'
  | 'check'
  | 'shield'
  | 'sparkles'
  | 'wallet'
  | 'headphones'
  | 'globe'
  | 'clock'
  | 'sliders'
  | 'grid'
  | 'list'
  | 'info'
  | 'alert'
  | 'eye'
  | 'eye-off'
  | 'mail'
  | 'phone'
  | 'logout'
  | 'heart'
  | 'file'
  | 'settings'
  | 'home'
  | 'arrow-up'
  | 'loader'
  | 'road'
  | 'plus'
  | 'minus'
  | 'external'
  | 'bag'
  | 'leaf'
  | 'bell'
  | 'download'
  | 'upload'
  | 'trash'
  | 'edit'
  | 'lock'
  | 'bar-chart'
  | 'image'

const paths: Record<IconName, React.ReactNode> = {
  'arrow-right': (
    <>
      <path d="M4 12h15M13 5l7 7-7 7" />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d="M6 18 18 6M6 6h12v12" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M20 12H5m6-7-7 7 7 7" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  car: (
    <>
      <path d="m4 10 2-6h12l2 6M3 10h18v8H3zM6 18v2m12-2v2M7 14h.01M17 14h.01" />
      <path d="M3 10 1 9m20 1 2-1" />
    </>
  ),
  motorbike: (
    <>
      <circle cx="5" cy="17" r="3.5" />
      <circle cx="19" cy="17" r="3.5" />
      <path d="m5 17 5-8h5l4 8M9 17h5L9 9H6m8-5h3l2 13M8 5h4" />
    </>
  ),
  pickup: (
    <>
      <path d="M2 10h10V6h5l4 5v7h-3m-12 0H2v-8Zm10 0h8m-8 8h-2" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18m-13 5h.01m4 0h.01m4 0h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  shield: (
    <>
      <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1v4m-2-2h4M4 19v4m-2-2h4" />
    </>
  ),
  wallet: (
    <>
      <path d="M21 8H4a2 2 0 0 1 0-4h14v4m3 0v13H4a2 2 0 0 1-2-2V6m19 7h-6v4h6" />
      <path d="M17 15h.01" />
    </>
  ),
  headphones: (
    <>
      <path d="M3 14v-3a9 9 0 0 1 18 0v6a4 4 0 0 1-4 4h-4" />
      <rect x="2" y="11" width="5" height="8" rx="2" />
      <rect x="17" y="11" width="5" height="8" rx="2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 4v16M12 4v16M20 4v16M1 8h6m2 8h6m2-8h6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10 3 1 20h22L14 3h-4Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18M10 5c8-2 13 7 13 7l-3 4M6 6c-3 2-5 6-5 6s5 10 15 6M10 10a3 3 0 0 0 4 4" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 6 10 7L22 6" />
    </>
  ),
  phone: <path d="m7 2 3 5-3 3c1 3 4 6 7 7l3-3 5 3-2 5C10 23 1 14 2 4l5-2Z" />,
  logout: (
    <>
      <path d="M9 3H3v18h6m5-14 5 5-5 5M9 12h13" />
    </>
  ),
  heart: <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-6 6 8 16 8 16S26 11 20 5Z" />,
  file: (
    <>
      <path d="M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 12h8m-8 4h8" />
    </>
  ),
  settings: (
    <>
      <path d="m10 2-1 3-3 1-3-1-2 4 2 3-1 3 2 4 3-1 3 2 1 3h4l1-3 3-2 3 1 2-4-2-3 1-3-2-4-3 1-3-1-1-3h-4Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  home: (
    <>
      <path d="m2 10 10-8 10 8M4 9v13h6v-8h4v8h6V9" />
    </>
  ),
  'arrow-up': <path d="M12 21V3m-7 7 7-7 7 7" />,
  loader: <path d="M21 12a9 9 0 1 1-9-9" />,
  road: (
    <>
      <path d="M8 2 3 22m13-20 5 20M12 3v3m0 4v4m0 4v4" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  external: (
    <>
      <path d="M13 3h8v8m0-8L10 14M8 3H3v18h18v-5" />
    </>
  ),
  bag: (
    <>
      <path d="M3 7h18v15H3zM8 8V5a4 4 0 0 1 8 0v3" />
    </>
  ),
  leaf: (
    <>
      <path d="M21 3c-1 9-1 15-10 15a7 7 0 0 1-7-7c0-9 8-7 17-8ZM3 22 16 9" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  'bar-chart': (
    <>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
}

export function Icon({
  name,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-icon shrink-0 ${className}`}
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
