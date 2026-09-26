import { useEffect, useState } from 'react'
import { formatTime } from '../engine'
import type { BoardFoulSummary, BoardLastEvent, BoardRosterPlayer, BoardSnapshot } from '../boardPublish'

interface Props {
  id: string
}

function periodLabel(period: BoardSnapshot['period']): string {
  return period === 'PSO' ? 'PSO' : `Q${period}`
}

function foulClass(cap: string, fouls: BoardFoulSummary[]): string {
  const f = fouls.find((row) => row.cap === cap)
  if (!f) return ''
  if (f.out || f.pf >= 3) return 'pf3'
  if (f.pf === 2) return 'pf2'
  return ''
}

function EventRail({
  side,
  events,
  fouls,
}: {
  side: 'white' | 'blue'
  events: BoardLastEvent[]
  fouls: BoardFoulSummary[]
}) {
  return (
    <aside className={`board-rail ${side}`}>
      {events.length === 0 ? <div className="board-rail-empty">—</div> : null}
      {events.map((e, i) => {
        const highlight = foulClass(e.cap, fouls)
        return (
          <div key={`${e.time}-${e.code}-${e.cap}-${i}`} className={`board-goal${highlight ? ` ${highlight}` : ''}`}>
            <span className="board-goal-cap">#{e.cap || '—'}</span>
            <span className={`code-pill ${e.code}`}>{e.code}</span>
            <span className="board-goal-time">{e.time}</span>
          </div>
        )
      })}
    </aside>
  )
}

function LineupRail({
  side,
  roster,
}: {
  side: 'white' | 'blue'
  roster: BoardRosterPlayer[]
}) {
  return (
    <aside className={`board-rail lineup ${side}`}>
      <div className="board-lineup-head">LINEUPS</div>
      {roster.length === 0 ? <div className="board-rail-empty">—</div> : null}
      {roster.map((p, i) => (
        <div key={`${p.cap}-${p.name}-${i}`} className="board-lineup-row">
          <span className="board-lineup-cap">#{p.cap}</span>
          <span className="board-lineup-name">{p.name}</span>
          {p.fillIn ? <span className="board-lineup-fi">FI</span> : null}
        </div>
      ))}
    </aside>
  )
}

export function SpectatorBoard({ id }: Props) {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    document.title = 'FNC Water Polo Scoreboard'
  }, [])

  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const res = await fetch(`/api/board/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!alive) return
        if (res.ok) {
          const data = (await res.json()) as BoardSnapshot
          setSnap(data)
        }
      } catch {
        /* keep last snapshot / waiting */
      }
    }
    void poll()
    const t = window.setInterval(() => void poll(), 750)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [id])

  useEffect(() => {
    if (!snap?.clockRunning && !snap?.shotClockRunning && !snap?.breakRunning) return
    const t = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [snap?.clockRunning, snap?.shotClockRunning, snap?.breakRunning])

  if (!snap) {
    return (
      <div className="board board-wait">
        <p>Waiting for table…</p>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - snap.updatedAt) / 1000)
  const inBreak = Boolean(snap.breakKind)
  const clockSec = snap.clockRunning ? Math.max(0, snap.clockRemainingSec - elapsed) : snap.clockRemainingSec
  const breakSec = snap.breakRunning
    ? Math.max(0, (snap.breakRemainingSec ?? 0) - elapsed)
    : (snap.breakRemainingSec ?? 0)
  const shotSec = snap.shotClockRunning
    ? Math.max(0, snap.shotClockRemainingSec - elapsed)
    : snap.shotClockRemainingSec
  const shot = Math.max(0, Math.ceil(shotSec))
  const whiteEvents = snap.last.filter((e) => e.side === 'white')
  const blueEvents = snap.last.filter((e) => e.side === 'blue')
  const whiteFouls = snap.whiteFouls ?? []
  const blueFouls = snap.blueFouls ?? []

  return (
    <div className="board">
      <div className="board-names">
        <div className={`board-name white${snap.possession === 'white' ? ' has-ball' : ''}`}>
          <span className="board-side">White</span>
          <span>{snap.whiteName || 'White'}</span>
        </div>
        <div className={`board-name blue${snap.possession === 'blue' ? ' has-ball' : ''}`}>
          <span>{snap.blueName || 'Blue'}</span>
          <span className="board-side">Blue</span>
        </div>
      </div>
      <div className="board-main">
        {!snap.started ? (
          <LineupRail side="white" roster={snap.whiteRoster ?? []} />
        ) : (
          <EventRail side="white" events={whiteEvents} fouls={whiteFouls} />
        )}
        <div className="board-center">
          <div className="board-score">
            <span className="board-score-n">{snap.white}</span>
            <span className="board-dash">–</span>
            <span className="board-score-n">{snap.blue}</span>
          </div>
        </div>
        {!snap.started ? (
          <LineupRail side="blue" roster={snap.blueRoster ?? []} />
        ) : (
          <EventRail side="blue" events={blueEvents} fouls={blueFouls} />
        )}
      </div>
      <div className="board-clocks">
        <div className="board-clock-block">
          <span className={`board-clock-label${inBreak ? ' break' : ''}`}>
            {inBreak ? (snap.breakKind === 'half' ? 'HALF' : 'BREAK') : 'Game'}
          </span>
          <span className="board-clock">{formatTime(inBreak ? breakSec : clockSec)}</span>
        </div>
        <div className="board-clock-block">
          <span className="board-clock-label">Period</span>
          <span className="board-period">{periodLabel(snap.period)}</span>
          {snap.ended ? <span className="board-final">FINAL</span> : null}
        </div>
        <div className="board-clock-block">
          <span className="board-clock-label">Shot</span>
          <span className={`board-shot${shot <= 5 ? ' low' : ''}`}>{shot}</span>
          <span className={`board-pos-line${snap.possession ? ' on' : ''}`}>
            {snap.possession === 'white' ? 'POS White' : snap.possession === 'blue' ? 'POS Blue' : 'POS —'}
          </span>
        </div>
      </div>
    </div>
  )
}
