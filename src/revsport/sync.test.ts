import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatVenueAddressLine, parseRevSportHtml, parseVenueField } from './parser'
import { groupGamesByVenue, inferAgeGroup, shortVenueName, venueSlug, type LiveGame } from './sync'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')

describe('venue formatting', () => {
  it('formats street suburb postcode with commas', () => {
    expect(formatVenueAddressLine('Freeborn Place  Alstonville 2477')).toBe(
      'Freeborn Place, Alstonville 2477',
    )
  })

  it('parses FNC match-info venue block with address line', () => {
    const html = readFileSync(path.join(fixtures, 'fnc-game-venue.html'), 'utf8')
    expect(parseVenueField(html)).toBe(
      'Alstonville Aquatic Centre, Freeborn Place, Alstonville 2477',
    )
    const parsed = parseRevSportHtml(html, '2026-09-26', 'https://www.fncwaterpolo.org.au/game/2659570')
    expect(parsed.source).toBe('match-info')
    expect(parsed.venue).toBe('Alstonville Aquatic Centre, Freeborn Place, Alstonville 2477')
  })
})

describe('sync helpers', () => {
  it('infers age groups from grade labels', () => {
    expect(inferAgeGroup('16&U Boys')).toBe('U16')
    expect(inferAgeGroup('social')).toBe('U18')
  })

  it('groups fixture card venues', () => {
    const html = readFileSync(path.join(fixtures, 'fnc-socials-round1.html'), 'utf8')
    const parsed = parseRevSportHtml(
      html,
      '2026-09-26',
      'https://www.fncwaterpolo.org.au/games/27655/39100/round/1',
    )
    const games: LiveGame[] = (parsed.games || []).map((g) => ({
      id: g.detailsUrl,
      home: g.home,
      away: g.away,
      date: g.date,
      time: g.time,
      venueName: g.venue || 'TBA',
      detailsUrl: g.detailsUrl,
      grade: parsed.grade,
      competition: parsed.competition,
    }))
    const venues = groupGamesByVenue(games)
    expect(venues).toHaveLength(1)
    expect(venues[0].name).toBe('Alstonville Aquatic Centre')
    expect(venues[0].shortName).toBe('Alstonville')
    expect(venues[0].id).toBe(venueSlug('Alstonville Aquatic Centre'))
    expect(shortVenueName('Alstonville Aquatic Centre, Freeborn Place, Alstonville 2477')).toBe(
      'Alstonville',
    )
  })
})
