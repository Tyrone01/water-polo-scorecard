import { playerGoalTotal, teamOf } from './engine'
import type { Match, Player, Side } from './types'

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function download(filename: string, text: string) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function csvFilenameStamp(match: Match): string {
  const safeEvent = (match.eventName || 'match').replace(/[^\w]+/g, '-').slice(0, 40)
  return `${safeEvent}-${match.date}`
}

export function eventLogFilename(match: Match): string {
  return `${csvFilenameStamp(match)}-event-log.csv`
}

export function playerSummaryFilename(match: Match): string {
  return `${csvFilenameStamp(match)}-player-summary.csv`
}

export function eventLogCsv(match: Match): string {
  const header = ['Period', 'Time', 'Cap', 'Side', 'W/B', 'Code', 'Score', 'Player', 'Notes']
  const rows = match.events.map((e) => {
    const team = teamOf(match, e.side)
    const name = team.players.find((p) => p.id === e.playerId || p.cap === e.cap)?.name || ''
    return [e.period, e.time, e.cap, e.side, e.side === 'white' ? 'W' : 'B', e.code, e.score || '', name, e.notes || '']
      .map(csvEscape)
      .join(',')
  })
  return [header.join(','), ...rows].join('\n')
}

export function playerSummaryCsv(match: Match): string {
  const header = [
    'Team', 'Side', 'Cap', 'Name', 'Fill-in', 'On card', 'Struck off',
    'Q1', 'Q2', 'Q3', 'Q4', 'Pen', 'Goals', 'Foul1', 'Foul2', 'Foul3', 'Personal fouls', 'Status',
  ]
  const rows: string[] = []
  for (const side of ['white', 'blue'] as Side[]) {
    const team = teamOf(match, side)
    for (const p of team.players) {
      const f = [0, 1, 2].map((i) => {
        const slot = p.fouls[i]
        return slot ? `${slot.code} Q${slot.period} ${slot.time}` : ''
      })
      const pf = p.fouls.filter((x) => x.code === 'E' || x.code === 'P').length
      const status = p.struckOff
        ? 'struck off'
        : p.fouls.some((x) => x.code === 'S')
          ? 'suspended'
          : pf >= 3
            ? '3 majors — out'
            : p.onCard
              ? 'on card'
              : 'bench'
      rows.push(
        [
          team.name, side, p.cap, p.name, p.isFillIn ? 'Y' : '', p.onCard ? 'Y' : '', p.struckOff ? 'Y' : '',
          p.goalsQ1, p.goalsQ2, p.goalsQ3, p.goalsQ4, p.goalsPen, playerGoalTotal(p),
          f[0], f[1], f[2], pf, status,
        ].map(csvEscape).join(','),
      )
    }
  }
  return [header.join(','), ...rows].join('\n')
}

export function exportEventLog(match: Match) {
  download(eventLogFilename(match), eventLogCsv(match))
}

export function exportPlayerSummary(match: Match) {
  download(playerSummaryFilename(match), playerSummaryCsv(match))
}

export function resultsFilename(match: Match): string {
  const id = match.revsport?.gameId ? `game-${match.revsport.gameId}` : csvFilenameStamp(match)
  return `${id}-results-for-revsport.csv`
}

function regularGoals(p: Player): number {
  return p.goalsQ1 + p.goalsQ2 + p.goalsQ3 + p.goalsQ4
}

/**
 * One file per game for an FNC admin to type into RevSport by hand.
 * Nothing is sent to RevSport. One TEAM row per side (score), then one SCORER
 * row per player who scored, by RevSport player id and cap.
 */
export function resultsCsv(match: Match): string {
  const header = [
    'Row', 'RevSport game ID', 'RevSport competition ID', 'Date', 'Grade', 'Round',
    'Side', 'RevSport team ID', 'Team', 'Score', 'Shootout',
    'Opponent RevSport team ID', 'Opponent', 'Opponent score',
    'RevSport player ID', 'Cap', 'Player', 'Goals', 'Note',
  ]
  const ref = match.revsport || {}
  const teamIds: Record<Side, string> = {
    white: match.white.revsportId || ref.homeTeamId || '',
    blue: match.blue.revsportId || ref.awayTeamId || '',
  }
  const score = { white: 0, blue: 0 }
  const shootout = { white: 0, blue: 0 }
  for (const side of ['white', 'blue'] as Side[]) {
    for (const p of teamOf(match, side).players) {
      score[side] += regularGoals(p)
      shootout[side] += p.goalsPen
    }
  }
  const hadShootout = shootout.white + shootout.blue > 0
  const common = [ref.gameId || '', ref.competitionId || '', match.date, match.grade, match.stage]
  const rows: string[] = []
  for (const side of ['white', 'blue'] as Side[]) {
    const other: Side = side === 'white' ? 'blue' : 'white'
    const team = teamOf(match, side)
    const opp = teamOf(match, other)
    const teamPart = [
      side === 'white' ? 'White (home)' : 'Blue (away)', teamIds[side], team.name,
      score[side], hadShootout ? shootout[side] : '',
      teamIds[other], opp.name, score[other],
    ]
    rows.push(['TEAM', ...common, ...teamPart, '', '', '', '', ''].map(csvEscape).join(','))
    const scorers = team.players
      .filter((p) => playerGoalTotal(p) > 0)
      .sort((a, b) => Number(a.cap) - Number(b.cap) || a.cap.localeCompare(b.cap))
    for (const p of scorers) {
      const note = [
        p.revsportId ? '' : 'Not on the RevSport player list — match by cap',
        p.goalsPen ? `${p.goalsPen} in shootout (not in Goals)` : '',
      ].filter(Boolean).join('; ')
      rows.push(
        ['SCORER', ...common, ...teamPart, p.revsportId || '', p.cap, p.name, regularGoals(p), note]
          .map(csvEscape)
          .join(','),
      )
    }
  }
  return [header.join(','), ...rows].join('\n')
}

export function exportResults(match: Match) {
  download(resultsFilename(match), resultsCsv(match))
}
