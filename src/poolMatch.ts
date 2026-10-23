import { FNC_BOARD_VENUE_IDS, isFncBoardVenueId, type FncBoardVenueId } from './boardPublish'

/**
 * Pool ids named in a venue string, as whole words.
 * "Alstonville Aquatic Centre" names alstonville. "Alstonville Ballina" names both.
 */
export function poolsNamedInVenue(name: string): FncBoardVenueId[] {
  const lower = name.trim().toLowerCase()
  if (!lower) return []
  return FNC_BOARD_VENUE_IDS.filter((id) => new RegExp(`(?:^|[^a-z0-9])${id}(?![a-z0-9])`).test(lower))
}

/** The one known pool this venue name identifies. Null when none or more than one fit. */
export function unambiguousPoolForVenueName(name: string): FncBoardVenueId | null {
  const hits = poolsNamedInVenue(name)
  return hits.length === 1 ? hits[0] : null
}

export type PoolPickReason = 'matched' | 'sole' | 'none' | 'ambiguous' | 'mixed' | 'list'

export interface PoolPick<T> {
  venue: T | null
  reason: PoolPickReason
}

/**
 * Option A: open a live venue only when the name identifies exactly one known pool.
 * A landing pool id (?venue=alstonville) opens only when exactly one venue names that pool.
 * A single venue in the list opens only when its name names exactly one known pool.
 * Otherwise the caller shows the pool list.
 * An id that is not a known pool (a card the official already tapped) opens that card.
 */
export function pickVenueForPool<T extends { id: string; name: string }>(
  venues: T[],
  opts: { requestedPoolId?: string | null; allowSoleVenue?: boolean } = {},
): PoolPick<T> {
  const requested = (opts.requestedPoolId || '').trim().toLowerCase()
  if (requested) {
    if (isFncBoardVenueId(requested)) {
      const mentioning = venues.filter((v) => poolsNamedInVenue(v.name).includes(requested))
      const unique = mentioning.filter((v) => unambiguousPoolForVenueName(v.name) === requested)
      if (unique.length === 1 && mentioning.length === 1) return { venue: unique[0], reason: 'matched' }
      if (mentioning.length === 1 && poolsNamedInVenue(mentioning[0].name).length > 1) {
        return { venue: null, reason: 'mixed' }
      }
      if (mentioning.length > 0) return { venue: null, reason: 'ambiguous' }
      return { venue: null, reason: 'none' }
    }
    const exact = venues.find((v) => v.id === requested)
    if (exact) return { venue: exact, reason: 'matched' }
    return { venue: null, reason: 'none' }
  }
  if (opts.allowSoleVenue && venues.length === 1) {
    const named = poolsNamedInVenue(venues[0].name)
    if (named.length === 1) return { venue: venues[0], reason: 'sole' }
    if (named.length > 1) return { venue: null, reason: 'mixed' }
    return { venue: null, reason: 'list' }
  }
  return { venue: null, reason: 'list' }
}

/** Plain-English reason the pool list is showing. */
export function poolListNote(poolId: string, reason: PoolPickReason): string | null {
  const label = poolId ? poolId.charAt(0).toUpperCase() + poolId.slice(1) : ''
  if (reason === 'mixed') return 'That venue name matches more than one pool. Pick the pool below.'
  if (reason === 'ambiguous') {
    return label
      ? `More than one venue could be ${label}. Pick the pool below.`
      : 'More than one venue could match. Pick the pool below.'
  }
  if (reason === 'none' && label) {
    return `No games found for ${label} in the next few days. Pick a pool below.`
  }
  return null
}
