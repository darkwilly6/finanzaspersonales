export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" aria-label="Capital OS">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden focusable="false">
        <rect width="32" height="32" rx="8" className="logo-bg" />
        <path d="M21.5 11.2A7.5 7.5 0 1 0 21.5 20.8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="23" cy="16" r="2" fill="var(--pos)" />
      </svg>
      {compact ? null : <span className="logo-text">Capital OS</span>}
    </span>
  )
}
