// QC (The Finisher): checks for the suggested fixes (venue list from today, per-round labels).
import { describe, expect, it } from 'vitest'
import { gamesFromToday, type LiveGame } from './revsport/sync'

const g = (id: string, date: string): LiveGame => ({ id, home: 'A', away: 'B', date, detailsUrl: `https://x/game/${id}` } as LiveGame)

describe('venue list from today (QC fix)', () => {
  it('drops last week, keeps tonight and later', () => {
    const games = [g('1', '2026-10-19'), g('2', '2026-10-26'), g('3', '2026-11-02')]
    expect(gamesFromToday(games, '2026-10-26').map((x) => x.id)).toEqual(['2', '3'])
    expect(gamesFromToday(games, '2026-10-23').map((x) => x.id)).toEqual(['2', '3'])
  })
  it('end of season: nothing ahead keeps everything', () => {
    const games = [g('1', '2026-10-19')]
    expect(gamesFromToday(games, '2026-12-01').map((x) => x.id)).toEqual(['1'])
  })
})
