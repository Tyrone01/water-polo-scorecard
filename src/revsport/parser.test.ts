import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { gamesOnDate, inferIsoDate, pickRelevantDate } from './dates'
import { htmlLooksLikeRevSport, isRevSportUrl, parsePlayerName, parseRevSportHtml } from './parser'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')

describe('parsePlayerName', () => {
  it('reads (#N) caps and strips row numbers', () => {
    expect(parsePlayerName('3. Harry Clerk (#4)')).toEqual({ name: 'Harry Clerk', cap: '4' })
    expect(parsePlayerName('Benjamin Carter (#1)')).toEqual({ name: 'Benjamin Carter', cap: '1' })
    expect(parsePlayerName('1. Clement Green Carlos')).toEqual({ name: 'Clement Green Carlos', cap: null })
  })
})

describe('WPTAS match card fixture', () => {
  const html = readFileSync(path.join(fixtures, 'wptas-game-2621794.html'), 'utf8')
  const result = parseRevSportHtml(html)

  it('detects a two-team game page', () => {
    expect(result.source).toBe('game')
    expect(result.teams).toHaveLength(2)
  })

  it('reads club names from headings, not invented', () => {
    const names = result.teams.map((t) => t.name)
    expect(names[0]).toMatch(/Clarence Crocs/i)
    expect(names[1]).toMatch(/Honey Badgers/i)
  })

  it('parses Harry Clerk as cap 4 (not row number 3)', () => {
    const harry = result.teams[0].players.find((p) => /Harry Clerk/i.test(p.name))
    expect(harry).toBeTruthy()
    expect(harry?.cap).toBe('4')
    expect(harry?.capGuessed).toBe(false)
  })

  it('parses Oscar Butterworth-Barry cap 13 on the second team', () => {
    const oscar = result.teams[1].players.find((p) => /Butterworth-Barry/i.test(p.name))
    expect(oscar?.cap).toBe('13')
  })

  it('does not invent players — counts match the tables', () => {
    expect(result.teams[0].players.length).toBe(13)
    expect(result.teams[1].players.length).toBe(12)
    for (const t of result.teams) {
      for (const p of t.players) {
        expect(p.name.length).toBeGreaterThan(2)
        expect(p.name).not.toMatch(/undefined|player \d+/i)
      }
    }
  })

  it('flags sequential caps only when (#N) is missing', () => {
    const guessed = result.teams[0].players.filter((p) => p.capGuessed)
    expect(guessed.map((p) => p.name).join(',')).toMatch(/Clement Green Carlos/)
    expect(guessed.map((p) => p.name).join(',')).toMatch(/Bailey Siddall/)
  })
})

describe('WPACT team-stats fixture', () => {
  const html = readFileSync(path.join(fixtures, 'wpact-team-stats-25376.html'), 'utf8')
  const result = parseRevSportHtml(html)

  it('parses one team from team-stats', () => {
    expect(result.source).toBe('team-stats')
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].name).toMatch(/Sutherland Shire Seals/i)
  })

  it('reads caps from Name (#N)', () => {
    const ben = result.teams[0].players.find((p) => /Benjamin Carter/i.test(p.name))
    expect(ben?.cap).toBe('1')
    expect(result.teams[0].players).toHaveLength(11)
    expect(result.teams[0].players.every((p) => !p.capGuessed)).toBe(true)
  })
})

describe('AJWP fixtures and team list', () => {
  const listing = readFileSync(path.join(fixtures, 'ajwp-games-listing.html'), 'utf8')
  const round1 = readFileSync(path.join(fixtures, 'ajwp-games-round1.html'), 'utf8')
  const game = readFileSync(path.join(fixtures, 'ajwp-game-2306256.html'), 'utf8')
  const team = readFileSync(path.join(fixtures, 'ajwp-team-379405.html'), 'utf8')

  it('reads grade links from the association games hub', () => {
    const hub = readFileSync(path.join(fixtures, 'ajwp-games-hub.html'), 'utf8')
    const result = parseRevSportHtml(hub, '2026-08-28', 'https://www.revolutionise.com.au/ajwp/games')
    expect(result.grades?.map((g) => g.label)).toEqual(['A Grade', 'B Grade', 'C Grade', 'Flipper Ball'])
    expect(result.grades?.[0].url).toMatch(/\/games\/24352\/3690$/)
    expect(result.games?.length ?? 0).toBe(0)
  })

  it('reads round links from a grade fixtures URL', () => {
    const result = parseRevSportHtml(listing)
    expect(result.source).toBe('fixtures')
    expect(result.roundUrls?.length).toBeGreaterThan(5)
    expect(result.competition).toMatch(/Friday night jnrs/i)
    expect(result.grade).toMatch(/A Grade/i)
  })

  it('parses round tabs with inferred dates', () => {
    const result = parseRevSportHtml(listing, '2026-08-28')
    expect(result.rounds?.length).toBeGreaterThan(5)
    expect(result.rounds?.[0].label).toMatch(/Round 1/)
    expect(result.rounds?.[0].url).toMatch(/\/round\/1$/)
    expect(result.rounds?.[0].date).toBe('2026-10-17')
    expect(result.rounds?.[1].date).toBe('2026-10-24')
    expect(result.roundUrls?.[0]).toBe(result.rounds?.[0].url)
  })

  it('parses White vs Blue games from a round page', () => {
    const result = parseRevSportHtml(round1)
    expect(result.source).toBe('fixtures')
    expect(result.games?.length).toBe(2)
    expect(result.games?.[0].home).toMatch(/Walruses-A/i)
    expect(result.games?.[0].away).toMatch(/Dugongs-A/i)
    expect(result.games?.[0].detailsUrl).toMatch(/\/game\/2306256/)
    expect(result.games?.[0].time).toBe('19:00')
    expect(result.games?.[0].venue).toMatch(/Alstonville Pool/i)
  })

  it('reads match info (venue, date, refs) without inventing players', () => {
    const result = parseRevSportHtml(game)
    expect(result.source).toBe('match-info')
    expect(result.teams.map((t) => t.name).join(',')).toMatch(/Walruses-A/)
    expect(result.teams.map((t) => t.name).join(',')).toMatch(/Dugongs-A/)
    expect(result.venue).toMatch(/Alstonville Pool/i)
    expect(result.date).toBe('2025-10-17')
    expect(result.startTime).toBe('19:00')
    expect(result.referees).toMatch(/Hunter Collins/i)
    expect(result.teamPageUrls?.[0]).toMatch(/\/teams\/379405/)
    expect(result.teams.every((t) => t.players.length === 0)).toBe(true)
  })

  it('reads team list caps from the numbered column', () => {
    const result = parseRevSportHtml(team)
    expect(result.source).toBe('team-list')
    expect(result.teams[0].name).toMatch(/Walruses-A/i)
    const zoe = result.teams[0].players.find((p) => /Zoe Silver/i.test(p.name))
    expect(zoe?.cap).toBe('4')
    expect(zoe?.capGuessed).toBe(false)
    expect(result.teams[0].players.length).toBe(7)
  })
})

describe('RevSport date helpers', () => {
  it("infers ISO from 'Fri 17 Oct' without a year", () => {
    expect(inferIsoDate('Fri 17 Oct', '2026-08-28')).toBe('2026-10-17')
  })

  it('picks the earliest upcoming date when today is not in the list', () => {
    expect(pickRelevantDate(['2026-10-17', '2026-10-24'], '2026-08-28')).toBe('2026-10-17')
  })

  it('picks today when today is in the list', () => {
    expect(pickRelevantDate(['2026-08-21', '2026-08-28', '2026-09-04'], '2026-08-28')).toBe('2026-08-28')
  })

  it('filters games to one date', () => {
    const games = [
      { home: 'A', away: 'B', date: '2026-10-17', detailsUrl: '/g/1' },
      { home: 'C', away: 'D', date: '2026-10-24', detailsUrl: '/g/2' },
    ]
    expect(gamesOnDate(games, '2026-10-17')).toHaveLength(1)
    expect(gamesOnDate(games, '2026-10-17')[0].home).toBe('A')
  })
})

describe('isRevSportUrl', () => {
  it('accepts official host and custom club /games/ paths', () => {
    expect(isRevSportUrl('https://www.revolutionise.com.au/ajwp/games/24352/3690')).toBe(true)
    expect(isRevSportUrl('https://www.fncwaterpolo.org.au/games/23702/3790')).toBe(true)
    expect(isRevSportUrl('https://www.waterpoloqld.com.au/games/26294/42555')).toBe(true)
    expect(isRevSportUrl('https://www.waterpolonsw.org.au/games/26443/33120/round/1')).toBe(true)
    expect(isRevSportUrl('https://example.com/not-revsport')).toBe(false)
    expect(isRevSportUrl('http://www.fncwaterpolo.org.au/games/23702/3790')).toBe(false)
  })
})

describe('htmlLooksLikeRevSport', () => {
  it('matches the CDN hostname and rejects random HTML', () => {
    expect(
      htmlLooksLikeRevSport(
        '<script src="https://cdn-static.revolutionise.com.au/assets/js/jquery.min.js"></script>',
      ),
    ).toBe(true)
    expect(htmlLooksLikeRevSport('<html><body>hello</body></html>')).toBe(false)
  })
})

describe('custom club domain hrefs', () => {
  it('resolves FNC-style absolute and root-relative round and team links', () => {
    const html = `
      <link href="https://cdn-static.revolutionise.com.au/assets/css/theme.min.css">
      <a href="https://www.fncwaterpolo.org.au/games/23702/3790/round/1"><b>Round 1</b></a>
      <div>Fri 17 Oct</div>
      <a href="/games/23702/3790/round/2"><b>Round 2</b></a>
      <div class="card card-hover x">
        <a href="/games/team/23702/111">Home Club</a>
        <a href="/games/team/23702/222">Away Club</a>
        <a href="https://www.fncwaterpolo.org.au/game/999">Details</a>
        Fri 17 Oct 2026 19:00 Pool Home Club
      </div>
    `
    const result = parseRevSportHtml(html, '2026-08-28', 'https://www.fncwaterpolo.org.au/games/23702/3790')
    expect(result.roundUrls?.some((u) => /fncwaterpolo\.org\.au\/games\/23702\/3790\/round\/1/.test(u))).toBe(true)
    expect(result.roundUrls?.some((u) => /fncwaterpolo\.org\.au\/games\/23702\/3790\/round\/2/.test(u))).toBe(true)
    expect(result.games?.[0].detailsUrl).toMatch(/fncwaterpolo\.org\.au\/game\/999/)
    expect(result.games?.[0].homeTeamUrl).toMatch(/\/teams\/111/)
  })
})
