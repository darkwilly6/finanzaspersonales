export interface ReinvestCandidate { businessId: string; name: string; reinvestMinor: number }

/**
 * Sugerencia del panel: el negocio con más dinero asignado a reinversión según TU reparto,
 * ya limitado por su reserva mínima y por los pagos que vienen. Es una regla, no una predicción.
 */
export function pickSuggestion(candidates: readonly ReinvestCandidate[]): ReinvestCandidate | null {
  const eligible = candidates.filter((c) => c.reinvestMinor > 0)
  if (eligible.length === 0) return null
  return [...eligible].sort((a, b) => b.reinvestMinor - a.reinvestMinor || a.name.localeCompare(b.name, 'es'))[0]!
}
