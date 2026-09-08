import type { ReactNode } from 'react'

/**
 * Brend işarəsi — `resources/logo.svg` ilə eyni həndəsə, inline SVG kimi.
 * Gradient id-ləri unikaldır ki, bir səhifədə bir neçə ölçü yan-yana dursun.
 */
export function Mark({ size = 20 }: { size?: number }): ReactNode {
  const id = `lb${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Locabase"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`${id}-stem`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#74C2E9" />
          <stop offset="1" stopColor="#3F92C9" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#3B8CC4" />
          <stop offset="1" stopColor="#215B8E" />
        </linearGradient>
      </defs>
      <rect x="242" y="215" width="170" height="595" rx="85" fill={`url(#${id}-stem)`} />
      <rect x="242" y="640" width="540" height="170" rx="85" fill={`url(#${id}-base)`} />
    </svg>
  )
}

export function Wordmark(): ReactNode {
  return (
    <span className="text-[13px] font-semibold tracking-[-0.01em] text-text select-none">
      Loca<span className="font-normal text-muted">base</span>
    </span>
  )
}
