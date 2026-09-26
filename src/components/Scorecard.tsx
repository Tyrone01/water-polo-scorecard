import { useEffect, useMemo, useState } from 'react'
import { exportEventLog, exportPlayerSummary } from '../csv'
import { autoSaveMatchToDrive, retrySaveMatchToDrive } from '../driveClient'
import {
  applyEvent,
  deleteEvent,
  deriveLiveExclusions,
  editEvent,
  endQuarter,
  formatTime,
  parseTimeInput,
  runningScoreFromEvents,
  setOnCard,
  quarterLengthSec,
  setPeriod,
  setPresent,
  strikeOff,
  timeoutAllowance,
  undoLast,
  unstrike,
  tickClock,
} from '../engine'
import { boardUrl } from '../boardPublish'
import { LEGEND, TEST_NUKE_GAME, type EventCode, type LogEvent, type Match, type PeriodId, type Player, type Side } from '../types'
import { EventLog } from './EventLog'
import { Tip } from './Tip'
import { TeamPanel } from './TeamPanel'

interface Props {
  match: Match
  setMatch: (next: Match | ((prev: Match) => Match)) => void
  onSetup: () => void
  onClearNext: () => void
  onVenues?: () => void
}

export function Scorecard({ match, setMatch, onSetup, onClearNext, onVenues }: Props) {
  const [side, setSide] = useState<Side | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [timeStr, setTimeStr] = useState(formatTime(match.clockRemainingSec))
  const [flash, setFlash] = useState<string[]>([])
  const [edit, setEdit] = useState<LogEvent | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [recon, setRecon] = useState<string | null>(null)

  useEffect(() => {
    if (!match.clockRunning) setTimeStr(formatTime(match.clockRemainingSec))
  }, [match.clockRemainingSec, match.clockRunning])

  useEffect(() => {
    if (!match.clockRunning && !match.shotClockRunning && !match.breakRunning) return
    const id = window.setInterval(() => {
      setMatch((prev) => tickClock(prev, 0.25))
    }, 250)
    return () => window.clearInterval(id)
  }, [match.clockRunning, match.shotClockRunning, match.breakRunning, setMatch])

  useEffect(() => {
    if (!match.ended) return
    if (match.driveSave?.status === 'verified') return
    setMatch((prev) =>
      prev.driveSave?.status === 'verified' || prev.driveSave?.status === 'saving'
        ? prev
        : { ...prev, driveSave: { status: 'saving' } },
    )
    void autoSaveMatchToDrive(match).then((driveSave) => {
      setMatch((prev) => ({ ...prev, driveSave }))
    })
  }, [match.ended, match.id, setMatch])

  const score = runningScoreFromEvents(match.events)
  const liveE = deriveLiveExclusions(match)
  const alerts = [...flash, ...match.alerts]

  function selectPlayer(s: Side, p: Player) {
    setSide(s)
    setPlayer(p)
    setTimeStr(formatTime(match.clockRemainingSec))
  }

  function record(code: EventCode) {
    const t = parseTimeInput(timeStr)
    const timeRemainingSec = t ?? match.clockRemainingSec
    const useSide = code === 'TO' ? (match.possession || side) : side
    if (!useSide) {
      setFlash(['Select White or Blue (tap a player, or possession for TO).'])
      return
    }
    if (code !== 'TO' && !player) {
      setFlash(['Select a cap, then a code.'])
      return
    }
    const result = applyEvent(match, {
      side: useSide,
      cap: code === 'TO' ? '' : (player?.cap || ''),
      playerId: code === 'TO' ? undefined : player?.id,
      code,
      timeRemainingSec,
    })
    if (!result.ok) {
      setFlash([result.error || 'Blocked'])
      return
    }
    setMatch(result.match)
    setFlash(result.warnings)
    setTimeStr(formatTime(result.match.clockRemainingSec))
  }

  function rename(s: Side, id: string, name: string) {
    const team = s === 'white' ? match.white : match.blue
    const players = team.players.map((p) => (p.id === id ? { ...p, name } : p))
    setMatch(s === 'white' ? { ...match, white: { ...team, players } } : { ...match, blue: { ...team, players } })
  }

  const periodLabel = match.currentPeriod === 'PSO' ? 'PSO' : `Q${match.currentPeriod}`
  const editForm = useMemo(() => edit, [edit])
  const shotSec = Math.max(0, Math.ceil(match.shotClockRemainingSec ?? match.shotClockSec))

  return (
    <div className="live scoring-layout">
      {alerts.length ? (
        <div className={`banner ${alerts.some((a) => /RED FLAG/i.test(a)) ? '' : 'warn'}`}>
          <span>{alerts.join(' · ')}</span>
          <button className="btn small" onClick={() => { setFlash([]); setMatch({ ...match, alerts: [] }) }}>
            Dismiss
          </button>
        </div>
      ) : null}
      {match.ended ? (
        <div
          className={`banner ${
            match.driveSave?.status === 'verified' ? 'ok' : match.driveSave?.status === 'error' ? '' : 'warn'
          }`}
        >
          <span>
            {match.driveSave?.status === 'verified' ? (
              <>
                Game over — saved &amp; verified on Club Drive
                {match.driveSave.logUrl ? (
                  <>
                    {' '}
                    <a href={match.driveSave.logUrl} target="_blank" rel="noreferrer">
                      event log
                    </a>
                  </>
                ) : null}
                {match.driveSave.summaryUrl ? (
                  <>
                    {' · '}
                    <a href={match.driveSave.summaryUrl} target="_blank" rel="noreferrer">
                      player summary
                    </a>
                  </>
                ) : null}
              </>
            ) : match.driveSave?.status === 'error' ? (
              <>Game over — Drive save failed{match.driveSave.error ? `: ${match.driveSave.error}` : ''}</>
            ) : (
              'Game over — auto-saving scorecard to Club Drive…'
            )}
          </span>
          {match.driveSave?.status === 'error' ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setMatch((prev) => ({ ...prev, driveSave: { status: 'saving' } }))
                void retrySaveMatchToDrive(match).then((driveSave) => {
                  setMatch((prev) => ({ ...prev, driveSave }))
                })
              }}
            >
              Save to Drive
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            disabled={match.driveSave?.status !== 'verified'}
            onClick={onClearNext}
          >
            Clear for next game
          </button>
        </div>
      ) : null}
      {liveE.length ? (
        <div className="exclusions">
          Live exclusion {liveE.map((x) => `${x.side === 'white' ? 'W' : 'B'} #${x.cap} ${formatTime(x.remainingSec)}`).join(' · ')}{' '}
          (18s actual play)
        </div>
      ) : null}

      <div className="live-topbar">
        <img src="/logo-fnc.jpg" alt="" className="fnc-logo-sm" />
        <div className="live-topbar-meta">
          <strong>{match.eventName || 'FNC Water Polo'}</strong>
          <span>
            {match.venue} · {match.grade} · {match.stage} · {match.date} {match.startTime}
          </span>
        </div>
        <div className="live-topbar-score">
          <span className="tn">{match.white.name}</span>
          <span className="sc">
            {score.white} – {score.blue}
          </span>
          <span className="tn">{match.blue.name}</span>
        </div>
        <Tip text="Tap a cap, check the remaining time, then tap a code. Goals (G / EG / PG) auto-reset the shot clock.">
          <button type="button" className="guide-btn">Guide</button>
        </Tip>
      </div>

      <div className="scoring-main">
        <div className="scoring-left">
          <div className="actionbar scoring-actionbar">
            <div>
              <div className="sel">
                {side && player ? (
                  <>
                    {side === 'white' ? 'WHITE' : 'BLUE'} #{player.cap} {player.name}
                  </>
                ) : (
                  'Tap a player, then a code'
                )}
              </div>
              <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                <label className="field" style={{ minWidth: 80 }}>
                  Time
                  <input value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
                </label>
                <span className="timeouts">
                  TO {match.mode}: W {match.white.timeouts.length}/{timeoutAllowance(match.mode)} · B{' '}
                  {match.blue.timeouts.length}/{timeoutAllowance(match.mode)}
                </span>
              </div>
              <div className="codes" style={{ marginTop: 6 }}>
                {(['G', 'EG', 'PG', 'E', 'P', 'S', 'TO', 'SU'] as EventCode[]).map((c) => {
                  const meta = LEGEND.find((l) => l.code === c)
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`code-btn ${c}`}
                      title={meta?.tip || c}
                      onClick={() => record(c)}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="tools">
              <button className="btn" onClick={() => setMatch(undoLast(match))} disabled={!match.events.length && !match.lastStrike}>
                Undo
              </button>
              <button
                className="btn"
                onClick={() => {
                  const { match: next, check } = endQuarter(match)
                  setMatch(next)
                  setRecon(
                    check.ok
                      ? `End of period OK (${check.logGoals.white}–${check.logGoals.blue}).`
                      : `Mismatch: ${check.issues.join('; ')}`,
                  )
                }}
              >
                End Q
              </button>
              <button className="btn" onClick={() => setShowLog((v) => !v)}>
                {showLog ? 'Hide log' : 'Log'}
              </button>
              <button className="btn" onClick={() => exportEventLog(match)}>CSV</button>
              <button className="btn" onClick={() => exportPlayerSummary(match)}>Summary</button>
              <button className="btn" onClick={() => setShowComments(true)}>Notes</button>
              {onVenues ? (
                <button className="btn" onClick={onVenues}>Venues</button>
              ) : null}
              <button className="btn" onClick={onSetup}>Setup</button>
              {TEST_NUKE_GAME ? (
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm('TEST nuke: wipe this game and go back to venues?')) onClearNext()
                  }}
                >
                  Nuke
                </button>
              ) : null}
            </div>
          </div>
          {recon ? <div className="footer-meta">{recon}</div> : null}

          <div className="teams-duo">
            <TeamPanel
              side="white"
              team={match.white}
              compact
              selectedId={side === 'white' ? player?.id : undefined}
              onSelect={(p) => selectPlayer('white', p)}
              onRename={(id, name) => rename('white', id, name)}
              onStrike={(id) => setMatch(strikeOff(match, 'white', id))}
              onUnstrike={(id) => {
                const r = unstrike(match, 'white', id)
                if (!r.ok) setFlash([r.error || 'Blocked'])
                else setMatch(r.match)
              }}
              onPresent={(id, present) => setMatch(setPresent(match, 'white', id, present))}
              onToggleCard={(id, on) => {
                const r = setOnCard(match, 'white', id, on)
                if (!r.ok) setFlash([r.error || 'Blocked'])
                else setMatch(r.match)
              }}
            />
            <TeamPanel
              side="blue"
              team={match.blue}
              compact
              selectedId={side === 'blue' ? player?.id : undefined}
              onSelect={(p) => selectPlayer('blue', p)}
              onRename={(id, name) => rename('blue', id, name)}
              onStrike={(id) => setMatch(strikeOff(match, 'blue', id))}
              onUnstrike={(id) => {
                const r = unstrike(match, 'blue', id)
                if (!r.ok) setFlash([r.error || 'Blocked'])
                else setMatch(r.match)
              }}
              onPresent={(id, present) => setMatch(setPresent(match, 'blue', id, present))}
              onToggleCard={(id, on) => {
                const r = setOnCard(match, 'blue', id, on)
                if (!r.ok) setFlash([r.error || 'Blocked'])
                else setMatch(r.match)
              }}
            />
          </div>

          {showLog ? (
            <div className="scoring-log">
              <EventLog events={match.events} onEdit={setEdit} />
            </div>
          ) : null}
        </div>

        <aside className="scoring-rail">
          <div className="rail-game-clock">
            <div className="rail-label">
              <span className="chip">{periodLabel}</span>
              {match.breakKind ? (
                <span className="chip break">{match.breakKind === 'half' ? 'HALF' : 'BREAK'}</span>
              ) : null}
              <span className="muted">Game clock</span>
            </div>
            <div className="clock game-rail">
              {formatTime(match.breakKind ? match.breakRemainingSec : match.clockRemainingSec)}
            </div>
            <div className="clock-actions rail-game-actions">
              <button
                className="btn"
                onClick={() =>
                  match.breakKind
                    ? setMatch({ ...match, breakRunning: !match.breakRunning })
                    : setMatch({ ...match, clockRunning: !match.clockRunning })
                }
              >
                {match.breakKind ? (match.breakRunning ? 'Pause' : 'Start') : match.clockRunning ? 'Pause' : 'Start'}
              </button>
              <button
                className="btn small"
                onClick={() =>
                  match.breakKind
                    ? setMatch({ ...match, breakRemainingSec: match.breakRemainingSec + 1 })
                    : setMatch({
                        ...match,
                        clockRemainingSec: Math.min(quarterLengthSec(match), match.clockRemainingSec + 1),
                      })
                }
              >
                +1s
              </button>
              <button
                className="btn small"
                onClick={() =>
                  match.breakKind
                    ? setMatch({ ...match, breakRemainingSec: Math.max(0, match.breakRemainingSec - 1) })
                    : setMatch({ ...match, clockRemainingSec: Math.max(0, match.clockRemainingSec - 1) })
                }
              >
                −1s
              </button>
            </div>
            <div className="qtr">
              {([1, 2, 3, 4] as PeriodId[]).map((p) => (
                <button key={String(p)} className="btn small" onClick={() => setMatch(setPeriod(match, p))}>
                  Q{p}
                </button>
              ))}
              {match.mode === 'FINALS' ? (
                <button className="btn small" onClick={() => setMatch(setPeriod(match, 'PSO'))}>
                  PSO
                </button>
              ) : null}
            </div>
          </div>

          <div className="rail-shot-clock">
            <div className="rail-label">
              <span className="chip shot">Shot</span>
              <span className="muted">Tap targets — Fresh / Short / Start</span>
            </div>
            <div className={`clock shot rail-shot-digits ${shotSec <= 5 ? 'low' : ''}`}>{shotSec}</div>
            <div className="shot-rail-actions">
              <button
                className="btn clock-run shot-primary"
                onClick={() => {
                  if (match.shotClockRunning) {
                    setMatch({ ...match, shotClockRunning: false })
                    return
                  }
                  const remaining = match.shotClockRemainingSec ?? match.shotClockSec
                  setMatch({
                    ...match,
                    shotClockRemainingSec: remaining > 0 ? remaining : match.shotClockSec,
                    shotClockRunning: true,
                  })
                }}
              >
                {match.shotClockRunning ? 'Stop' : 'Start'}
              </button>
              <button
                className="btn shot-fresh"
                onClick={() =>
                  setMatch({
                    ...match,
                    shotClockRemainingSec: match.shotClockSec,
                    shotClockRunning: false,
                  })
                }
              >
                Fresh {match.shotClockSec}
              </button>
              <button
                className="btn shot-short"
                onClick={() =>
                  setMatch({
                    ...match,
                    shotClockRemainingSec: match.shotClockShortSec,
                    shotClockRunning: false,
                  })
                }
              >
                Short {match.shotClockShortSec}
              </button>
            </div>
            <label className="field possession-field">
              Possession
              <select
                value={match.possession || ''}
                onChange={(e) => setMatch({ ...match, possession: (e.target.value || null) as Side | null })}
              >
                <option value="">—</option>
                <option value="white">White</option>
                <option value="blue">Blue</option>
              </select>
            </label>
            <p className="muted shot-hint">G / EG / PG auto-reset shot clock to {match.shotClockSec}s and stop it.</p>
            <div className="rail-board-link">
              <span className="source-label">Board</span>
              <a href={boardUrl(window.location.origin)} target="_blank" rel="noreferrer">
                Open board
              </a>
            </div>
          </div>
        </aside>
      </div>

      {editForm ? (
        <EditModal
          event={editForm}
          onClose={() => setEdit(null)}
          onSave={(patch) => {
            const r = editEvent(match, editForm.id, patch)
            if (r.ok) setMatch(r.match)
            setEdit(null)
          }}
          onDelete={() => {
            setMatch(deleteEvent(match, editForm.id))
            setEdit(null)
          }}
        />
      ) : null}

      {showComments ? (
        <div className="modal-bg" onClick={() => setShowComments(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Comments / final result</h3>
            <label className="field">
              Final result
              <input value={match.finalResult} onChange={(e) => setMatch({ ...match, finalResult: e.target.value })} />
            </label>
            <label className="field">
              Comments
              <textarea value={match.comments} onChange={(e) => setMatch({ ...match, comments: e.target.value })} />
            </label>
            <button className="btn primary" onClick={() => setShowComments(false)}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EditModal({
  event,
  onClose,
  onSave,
  onDelete,
}: {
  event: LogEvent
  onClose: () => void
  onSave: (patch: Partial<LogEvent>) => void
  onDelete: () => void
}) {
  const [cap, setCap] = useState(event.cap)
  const [side, setSide] = useState(event.side)
  const [code, setCode] = useState(event.code)
  const [time, setTime] = useState(event.time)
  const [period, setPeriodId] = useState(event.period)
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit log event</h3>
        <div className="grid-2">
          <label className="field">Time<input value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="field">Cap<input value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          <label className="field">
            Side
            <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
              <option value="white">White</option>
              <option value="blue">Blue</option>
            </select>
          </label>
          <label className="field">
            Code
            <select value={code} onChange={(e) => setCode(e.target.value as EventCode)}>
              {LEGEND.map((l) => (
                <option key={l.code} value={l.code}>{l.code}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Period
            <select value={String(period)} onChange={(e) => setPeriodId((e.target.value === 'PSO' ? 'PSO' : Number(e.target.value)) as PeriodId)}>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
              <option value="PSO">PSO</option>
            </select>
          </label>
        </div>
        <div className="tools" style={{ marginTop: 12 }}>
          <button className="btn danger" onClick={onDelete}>Delete & recalc</button>
          <button
            className="btn primary"
            onClick={() =>
              onSave({
                cap,
                side,
                code,
                time,
                period,
                timeRemainingSec: parseTimeInput(time) ?? event.timeRemainingSec,
              })
            }
          >
            Save & recalc
          </button>
        </div>
      </div>
    </div>
  )
}
