import { emptyPlayer, emptyTeam, newMatch, periodLengthSec } from './engine'
import type { AgeGroup, Match, MatchMode, Player } from './types'

function roster(names: [string, string][], onCardUntil = 10): Player[] {
  return names.map(([cap, name], i) =>
    emptyPlayer({
      cap,
      name,
      onCard: i < onCardUntil,
      present: i < onCardUntil,
      isFillIn: false,
    }),
  )
}

const WHITE: [string, string][] = [
  ['1', 'Mia Thompson'],
  ['2', 'Sophie Nguyen'],
  ['3', 'Ava Patel'],
  ['4', 'Chloe Williams'],
  ['5', 'Isla Bennett'],
  ['6', 'Grace OConnor'],
  ['7', 'Ruby Harrison'],
  ['8', 'Emilia Clarke'],
  ['9', 'Lily McKenzie'],
  ['10', 'Zara Ahmed'],
  ['11', 'Hannah Brooks'],
  ['12', 'Olivia Reid'],
]

const BLUE: [string, string][] = [
  ['1', 'Noah Campbell'],
  ['2', 'Jack Fraser'],
  ['3', 'Leo Martin'],
  ['4', 'Harry Wilson'],
  ['5', 'Oscar Taylor'],
  ['6', 'Archie Brown'],
  ['7', 'Finn Murphy'],
  ['8', 'Charlie Evans'],
  ['9', 'Max Robinson'],
  ['10', 'Luca Rossi'],
  ['13', 'Toby Nguyen'],
  ['14', 'Ethan Clarke'],
]

const WHITE_ALT: [string, string][] = [
  ['1', 'Amelia King'],
  ['2', 'Harper Lee'],
  ['3', 'Evelyn Scott'],
  ['4', 'Scarlett James'],
  ['5', 'Aurora Walsh'],
  ['6', 'Maya Chen'],
  ['7', 'Zoe Parker'],
  ['8', 'Nina Brooks'],
  ['9', 'Ellie Grant'],
  ['10', 'Sienna Fox'],
  ['11', 'Jade Nguyen'],
  ['12', 'Piper Mills'],
]

const BLUE_ALT: [string, string][] = [
  ['1', 'Liam Hughes'],
  ['2', 'Oliver Shaw'],
  ['3', 'Henry Bell'],
  ['4', 'William Cruz'],
  ['5', 'Lucas Reed'],
  ['6', 'Thomas Lane'],
  ['7', 'Benjamin Cole'],
  ['8', 'Mason Hart'],
  ['9', 'James Quinn'],
  ['10', 'Daniel Nash'],
  ['11', 'Samuel Ortiz'],
  ['12', 'Ryan Blake'],
]

export const FNC_EVENT_NAME = 'Far North Coast Water Polo — Junior Competition 2026'
export const FNC_NIGHT_DATE = '2026-09-25'

export interface VenueGameFixture {
  id: string
  grade: string
  stage: string
  startTime: string
  ageGroup: AgeGroup
  mode: MatchMode
  whiteName: string
  blueName: string
  whiteRoster?: [string, string][]
  blueRoster?: [string, string][]
  whiteOnCard?: number
  blueOnCard?: number
}

export interface VenueNight {
  id: string
  name: string
  shortName: string
  suburb: string
  games: VenueGameFixture[]
}

/** Sample FNC game-night venues — officer picks venue only, then a game. */
export const FNC_VENUES: VenueNight[] = [
  {
    id: 'alstonville',
    name: 'Alstonville Aquatic Centre',
    shortName: 'Alstonville',
    suburb: 'Alstonville',
    games: [
      {
        id: 'als-1',
        grade: '16&U Boys',
        stage: 'Round 4',
        startTime: '18:00',
        ageGroup: 'U16',
        mode: 'ROUND',
        whiteName: 'Alstonville 16&U Boys',
        blueName: 'Ballina 16&U Boys',
      },
      {
        id: 'als-2',
        grade: '14&U Girls',
        stage: 'Round 4',
        startTime: '19:00',
        ageGroup: 'U14',
        mode: 'ROUND',
        whiteName: 'Alstonville 14&U Girls',
        blueName: 'Lismore 14&U Girls',
        whiteRoster: WHITE_ALT,
        blueRoster: BLUE_ALT,
      },
      {
        id: 'als-3',
        grade: '18&U Mixed',
        stage: 'Round 4',
        startTime: '20:00',
        ageGroup: 'U18',
        mode: 'ROUND',
        whiteName: 'Alstonville 18&U',
        blueName: 'Mullumbimby 18&U',
      },
    ],
  },
  {
    id: 'ballina',
    name: 'Ballina Indoor Pool',
    shortName: 'Ballina',
    suburb: 'Ballina',
    games: [
      {
        id: 'bal-1',
        grade: '15&U Boys',
        stage: 'Round 4',
        startTime: '17:30',
        ageGroup: 'U15',
        mode: 'ROUND',
        whiteName: 'Ballina 15&U Boys',
        blueName: 'Mullumbimby 15&U Boys',
      },
      {
        id: 'bal-2',
        grade: '13&U Girls',
        stage: 'Round 4',
        startTime: '18:30',
        ageGroup: 'U13',
        mode: 'ROUND',
        whiteName: 'Ballina 13&U Girls',
        blueName: 'Alstonville 13&U Girls',
        whiteRoster: WHITE_ALT,
        blueRoster: BLUE_ALT,
      },
      {
        id: 'bal-3',
        grade: '16&U Girls',
        stage: 'Round 4',
        startTime: '19:30',
        ageGroup: 'U16',
        mode: 'ROUND',
        whiteName: 'Ballina 16&U Girls',
        blueName: 'Lismore 16&U Girls',
        whiteRoster: WHITE_ALT,
        blueRoster: WHITE,
      },
    ],
  },
  {
    id: 'lismore',
    name: 'Lismore Memorial Baths',
    shortName: 'Lismore',
    suburb: 'Lismore',
    games: [
      {
        id: 'lis-1',
        grade: '14&U Boys',
        stage: 'Round 4',
        startTime: '18:00',
        ageGroup: 'U14',
        mode: 'ROUND',
        whiteName: 'Lismore 14&U Boys',
        blueName: 'Mullumbimby 14&U Boys',
      },
      {
        id: 'lis-2',
        grade: '17&U Girls',
        stage: 'Round 4',
        startTime: '19:15',
        ageGroup: 'U17',
        mode: 'ROUND',
        whiteName: 'Lismore 17&U Girls',
        blueName: 'Ballina 17&U Girls',
        whiteRoster: WHITE_ALT,
        blueRoster: BLUE_ALT,
      },
      {
        id: 'lis-3',
        grade: 'Open Mixed',
        stage: 'Round 4',
        startTime: '20:30',
        ageGroup: 'U18',
        mode: 'ROUND',
        whiteName: 'Lismore Open',
        blueName: 'Mullumbimby Open',
      },
      {
        id: 'lis-4',
        grade: '12&U Mixed',
        stage: 'Round 4',
        startTime: '17:00',
        ageGroup: 'U12',
        mode: 'ROUND',
        whiteName: 'Lismore 12&U',
        blueName: 'Alstonville 12&U',
        whiteOnCard: 9,
        blueOnCard: 9,
      },
    ],
  },
  {
    id: 'mullumbimby',
    name: 'Mullumbimby Pool',
    shortName: 'Mullumbimby',
    suburb: 'Mullumbimby',
    games: [
      {
        id: 'mul-1',
        grade: '16&U Boys',
        stage: 'Round 4',
        startTime: '18:00',
        ageGroup: 'U16',
        mode: 'ROUND',
        whiteName: 'Mullumbimby 16&U Boys',
        blueName: 'Alstonville 16&U Boys',
      },
      {
        id: 'mul-2',
        grade: '14&U Girls',
        stage: 'Round 4',
        startTime: '19:00',
        ageGroup: 'U14',
        mode: 'ROUND',
        whiteName: 'Mullumbimby 14&U Girls',
        blueName: 'Ballina 14&U Girls',
        whiteRoster: WHITE_ALT,
        blueRoster: BLUE_ALT,
      },
      {
        id: 'mul-3',
        grade: '15&U Mixed',
        stage: 'Round 4',
        startTime: '20:00',
        ageGroup: 'U15',
        mode: 'ROUND',
        whiteName: 'Mullumbimby 15&U',
        blueName: 'Lismore 15&U',
      },
    ],
  },
]

export function buildMatchFromFixture(venue: VenueNight, game: VenueGameFixture): Match {
  const whiteRoster = game.whiteRoster ?? WHITE
  const blueRoster = game.blueRoster ?? BLUE
  const whiteOn = game.whiteOnCard ?? 10
  const blueOn = game.blueOnCard ?? 10
  return newMatch({
    eventName: FNC_EVENT_NAME,
    stage: game.stage,
    venue: venue.name,
    grade: game.grade,
    date: FNC_NIGHT_DATE,
    startTime: game.startTime,
    ageGroup: game.ageGroup,
    mode: game.mode,
    officials: {
      referee1: 'A. Referee',
      referee2: 'B. Referee',
      tableSecretary: 'Table Secretary',
      timekeeper: 'Timekeeper',
    },
    white: emptyTeam(game.whiteName, roster(whiteRoster, whiteOn)),
    blue: emptyTeam(game.blueName, roster(blueRoster, blueOn)),
    currentPeriod: 1,
    clockRemainingSec: periodLengthSec(game.ageGroup, 1),
    started: false,
    sourceUrl: 'https://www.fncwaterpolo.org.au/games',
  })
}

/** Default demo match — Alstonville first game (FNC). */
export function demoMatch(): Match {
  const venue = FNC_VENUES[0]
  return buildMatchFromFixture(venue, venue.games[0])
}
