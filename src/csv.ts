import { playerGoalTotal, teamOf } from './engine'
import type { Match, Side } from './types'

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
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
