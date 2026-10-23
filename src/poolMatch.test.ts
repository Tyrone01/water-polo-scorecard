import { describe, expect, it } from 'vitest'
import { groupGamesByVenue, type LiveGame } from './revsport/sync'
import { pickVenueForPool, unambiguousPoolForVenueName } from './poolMatch'

function venue(id: string, name: string) {
  return { id, name }
}

describe('Option A pool matching', () => {
  it('auto-opens when the venue name is exactly one known pool', () => {
    expect(unambiguousPoolForVenueName('Alstonville Aquatic Centre')).toBe('alstonville')
    expect(unambiguousPoolForVenueName('Lismore Memorial Baths')).toBe('lismore')
    expect(unambiguousPoolForVenueName('Ballina Indoor Pool')).toBe('ballina')
    expect(unambiguousPoolForVenueName('Mullumbimby Leisure Centre')).toBe('mullumbimby')
    expect(unambiguousPoolForVenueName('alstonville-aquatic')).toBe('alstonville')

    const longerSlug = [venue('lismore-memorial-baths', 'Lismore Memorial Baths')]
    expect(pickVenueForPool(longerSlug, { requestedPoolId: 'lismore' })).toEqual({
      venue: longerSlug[0],
      reason: 'matched',
    })

    const only = [venue('alstonville', 'Alstonville Aquatic Centre')]
    expect(pickVenueForPool(only, { allowSoleVenue: true })).toEqual({
      venue: only[0],
      reason: 'sole',
    })
  })

  it('shows the pool list when two venues could be the requested pool', () => {
    const venues = [
      venue('alstonville', 'Alstonville Aquatic Centre'),
      venue('alstonville-memorial', 'Alstonville Memorial'),
    ]
    const pick = pickVenueForPool(venues, { requestedPoolId: 'alstonville' })
    expect(pick.venue).toBeNull()
    expect(pick.reason).toBe('ambiguous')
  })

  it('shows the pool list when one venue name could be two pools', () => {
    const carnival = [venue('alstonville-ballina-carnival', 'Alstonville Ballina Carnival')]
    expect(unambiguousPoolForVenueName('Alstonville Ballina Carnival')).toBeNull()
    expect(pickVenueForPool(carnival, { requestedPoolId: 'alstonville' }).venue).toBeNull()
    expect(pickVenueForPool(carnival, { requestedPoolId: 'alstonville' }).reason).toBe('mixed')
    expect(pickVenueForPool(carnival, { allowSoleVenue: true })).toEqual({
      venue: null,
      reason: 'mixed',
    })
  })

  it('shows the pool list when the only venue is not a known pool', () => {
    const grafton = [venue('grafton', 'Grafton Pool')]
    expect(unambiguousPoolForVenueName('Grafton Pool')).toBeNull()
    expect(unambiguousPoolForVenueName('Venue TBA')).toBeNull()
    expect(pickVenueForPool(grafton, { allowSoleVenue: true })).toEqual({
      venue: null,
      reason: 'list',
    })
    expect(pickVenueForPool(grafton, { requestedPoolId: 'ballina' })).toEqual({
      venue: null,
      reason: 'none',
    })
  })

  it('still opens a card the official already tapped', () => {
    const picked = venue('alstonville-ballina-carnival', 'Alstonville Ballina Carnival')
    expect(pickVenueForPool([picked], { requestedPoolId: picked.id })).toEqual({
      venue: picked,
      reason: 'matched',
    })
  })

  it('does not file an ambiguous venue name under one pool', () => {
    const game = (id: string, venueName: string): LiveGame => ({
      id,
      home: 'A',
      away: 'B',
      venueName,
      detailsUrl: `https://x/game/${id}`,
    })
    const venues = groupGamesByVenue([
      game('1', 'Alstonville Aquatic Centre'),
      game('2', 'Alstonville Ballina Carnival'),
    ])
    expect(venues.map((v) => v.id).sort()).toEqual(['alstonville', 'alstonville-ballina-carnival'])
    const carnival = venues.find((v) => v.name === 'Alstonville Ballina Carnival')!
    expect(unambiguousPoolForVenueName(carnival.name)).toBeNull()
  })
})
