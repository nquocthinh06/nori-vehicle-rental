import { NoriLink, Text } from '@/components/ui'

export function Brand({ inverse = false, large = false }: { inverse?: boolean; large?: boolean }) {
  return (
    <NoriLink
      href="/"
      aria-label="NORI — Trang chủ"
      className={`inline-flex items-center gap-2.5 ${inverse ? 'text-inverse hover:text-brand-bright' : 'text-ink hover:text-brand'}`}
    >
      <span
        className={`nori-wordmark leading-none ${large ? 'text-brand-display' : 'text-wordmark'}`}
      >
        nori<span className={inverse ? 'text-brand-bright' : 'text-brand'}>.</span>
      </span>
      {!large && (
        <span
          className={`ml-2 hidden border-l pl-3 text-micro font-medium uppercase leading-snug tracking-widest sm:block ${inverse ? 'border-inverse/20 text-on-night-muted' : 'border-line text-muted'}`}
        >
          Your way.
          <br />
          Every day.
        </span>
      )}
    </NoriLink>
  )
}
