export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden />
}

export function FullScreenLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="fullscreen-center" role="status" aria-live="polite">
      <div className="loader-ring" aria-hidden />
      <p className="muted">{label}</p>
    </div>
  )
}
