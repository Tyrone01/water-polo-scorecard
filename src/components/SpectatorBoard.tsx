import { useEffect, useRef, useState } from 'react'
import { playClockSignal, playClockSound, unlockAudio } from '../audio'
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

/** True when the table clearly started a new shot-clock epoch (Fresh / Short / goal reset). */
function isShotClockReset(prev: BoardSnapshot | null, next: BoardSnapshot): boolean {
  if (next.shotClockRunning && next.shotClockRemainingSec >= 2) {
    if (!prev) return true
    // Restarted after stop, or remaining jumped up
    if (!prev.shotClockRunning) return true
    if (next.shotClockRemainingSec > prev.shotClockRemainingSec + 0.5) return true
  }
  if (prev && next.updatedAt > prev.updatedAt && next.shotClockRemainingSec > prev.shotClockRemainingSec + 1) {
    return true
  }
  return false
}

function isPeriodClockReset(prev: BoardSnapshot | null, next: BoardSnapshot): boolean {
  if (next.clockRunning && next.clockRemainingSec >= 5) {
    if (!prev) return true
    if (!prev.clockRunning) return true
    if (next.clockRemainingSec > prev.clockRemainingSec + 1) return true
  }
  if (prev && next.updatedAt > prev.updatedAt && next.clockRemainingSec > prev.clockRemainingSec + 1) {
    return true
  }
  return false
}

/**
 * Whole-second shot display matching the live sheet (Math.ceil), but never
 * jumps upward while the same countdown is running — that was the TV glitch
 * when a late poll arrived with a slightly higher remaining.
 */
function wholeShotSeconds(sec: number): number {
  return Math.max(0, Math.ceil(sec - 1e-9))
}

export function SpectatorBoard({ id }: Props) {
  const [snap, setSnap] = useState<BoardSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const snapRef = useRef<BoardSnapshot | null>(null)

  const shotExpiredLocal = useRef(false)
  const periodExpiredLocal = useRef(false)
  const localShotHornPlayed = useRef(false)
  const localPeriodHornPlayed = useRef(false)
  /** Monotonic whole-second shot while a countdown is in progress. */
  const shotFloorRef = useRef<number | null>(null)
  /** Monotonic whole-second game/break clock (same anti-flicker as shot). */
  const clockFloorRef = useRef<number | null>(null)
  const firstSnapshot = useRef(true)
  const lastPlayedSignal = useRef<string | null>(null)

  useEffect(() => {
    document.title = 'FNC Water Polo Scoreboard'
  }, [])

  // TV board: no prompts. Try unlock on load; also on any silent remote/key/pointer.
  useEffect(() => {
    unlockAudio()
    const arm = () => unlockAudio()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [])

  useEffect(() => {
    let alive = true
    let timeoutId = 0

    async function poll() {
      try {
        const res = await fetch(`/api/board/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!alive) return
        if (res.ok) {
          const data = (await res.json()) as BoardSnapshot
          const prev = snapRef.current
          // Ignore stale / out-of-order polls — they jump clocks upward on the TV.
          if (!prev || data.updatedAt > prev.updatedAt) {
            if (isShotClockReset(prev, data)) {
              shotExpiredLocal.current = false
              localShotHornPlayed.current = false
              shotFloorRef.current = null
            }
            if (isPeriodClockReset(prev, data)) {
              periodExpiredLocal.current = false
              localPeriodHornPlayed.current = false
              clockFloorRef.current = null
            }
            snapRef.current = data
            setSnap(data)
            setNow(Date.now())
          }
        }
      } catch {
        /* keep last snapshot / waiting */
      }
      if (!alive) return
      const s = snapRef.current
      const running = Boolean(s?.clockRunning || s?.shotClockRunning || s?.breakRunning)
      // Fast while clocks run so the TV stays close to the table tablet
      timeoutId = window.setTimeout(() => void poll(), running ? 200 : 800)
    }

    void poll()
    return () => {
      alive = false
      window.clearTimeout(timeoutId)
    }
  }, [id])

  useEffect(() => {
    if (!snap?.clockRunning && !snap?.shotClockRunning && !snap?.breakRunning) return
    const t = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(t)
  }, [snap?.clockRunning, snap?.shotClockRunning, snap?.breakRunning])

  // Predictive horn at local zero (once). Server clockSignal is backup only.
  useEffect(() => {
    if (!snap) return
    const elapsed = Math.max(0, (now - snap.updatedAt) / 1000)

    const periodAtZero = snap.clockRunning && snap.clockRemainingSec - elapsed <= 0
    const shotAtZero = snap.shotClockRunning && snap.shotClockRemainingSec - elapsed <= 0

    if (periodAtZero) {
      periodExpiredLocal.current = true
      shotExpiredLocal.current = true
      if (!localPeriodHornPlayed.current) {
        localPeriodHornPlayed.current = true
        localShotHornPlayed.current = true
        playClockSound('period')
      }
    } else if (shotAtZero) {
      shotExpiredLocal.current = true
      if (!localShotHornPlayed.current) {
        localShotHornPlayed.current = true
        playClockSound('shot')
      }
    }
  }, [snap, now])

  useEffect(() => {
    if (!snap) return
    const signal = snap.clockSignal
    if (firstSnapshot.current) {
      firstSnapshot.current = false
      lastPlayedSignal.current = signal?.id ?? null
      return
    }
    if (!signal || signal.id === lastPlayedSignal.current) return
    lastPlayedSignal.current = signal.id
    if (signal.kind === 'shot' && localShotHornPlayed.current) return
    if (signal.kind === 'period' && localPeriodHornPlayed.current) return
    playClockSignal(signal)
  }, [snap])

  if (!snap) {
    return (
      <div className="board board-wait">
        <p>Waiting for table…</p>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - snap.updatedAt) / 1000)
  const inBreak = Boolean(snap.breakKind)

  let clockSec = snap.clockRunning ? Math.max(0, snap.clockRemainingSec - elapsed) : snap.clockRemainingSec
  if (periodExpiredLocal.current || (snap.clockRunning && clockSec <= 0)) {
    periodExpiredLocal.current = true
    shotExpiredLocal.current = true
    clockSec = 0
  }

  let breakSec = snap.breakRunning
    ? Math.max(0, (snap.breakRemainingSec ?? 0) - elapsed)
    : (snap.breakRemainingSec ?? 0)

  // Monotonic whole-second game/break display (ceil, never jump up mid-countdown).
  const clockRunningDisplay = inBreak ? snap.breakRunning : snap.clockRunning
  let clockWhole = Math.max(0, Math.ceil((inBreak ? breakSec : clockSec) - 1e-9))
  if (periodExpiredLocal.current && !inBreak) {
    clockWhole = 0
    clockFloorRef.current = 0
  } else if (clockRunningDisplay) {
    const floor = clockFloorRef.current
    if (floor == null || clockWhole < floor) {
      clockFloorRef.current = clockWhole
    } else {
      clockWhole = floor
    }
  } else {
    clockFloorRef.current = null
    clockWhole = Math.max(0, Math.ceil((inBreak ? (snap.breakRemainingSec ?? 0) : snap.clockRemainingSec) - 1e-9))
  }
  if (inBreak) breakSec = clockWhole
  else clockSec = clockWhole

  let shotSec = snap.shotClockRunning
    ? Math.max(0, snap.shotClockRemainingSec - elapsed)
    : snap.shotClockRemainingSec
  if (shotExpiredLocal.current || (snap.shotClockRunning && shotSec <= 0)) {
    shotExpiredLocal.current = true
    shotSec = 0
  }

  let shot = wholeShotSeconds(shotSec)
  if (shotExpiredLocal.current) {
    shot = 0
    shotFloorRef.current = 0
  } else if (snap.shotClockRunning) {
    const floor = shotFloorRef.current
    if (floor == null) {
      shotFloorRef.current = shot
    } else if (shot < floor) {
      shotFloorRef.current = shot
    } else {
      // Never jump back up mid-countdown (late / overlapping polls)
      shot = floor
    }
  } else {
    // Stopped with time left (Fresh/Short pending start) — show snap value, clear floor
    shotFloorRef.current = null
    shot = wholeShotSeconds(snap.shotClockRemainingSec)
  }

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
