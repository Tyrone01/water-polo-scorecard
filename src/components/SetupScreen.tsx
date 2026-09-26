import { useEffect, useState } from 'react'
import { demoMatch } from '../demo'
import { parseDriveFolderId } from '../driveFolder'
import { boardIdForMatch, boardUrl, publishBoard } from '../boardPublish'
import { emptyPlayer, periodMinutes, quarterLengthSec, setupIssues, uid } from '../engine'
import { connectGoogle, googleSessionEmail, hasGoogleSession } from '../googleAuth'
import { importMetaPatch, importedTeamToTeam } from '../importApply'
import { expandPendingRounds, fetchRevSport, importFromPaste, type Result } from '../revsport/client'
import { gamesOnDate, pickRelevantDate, sydneyTodayISO } from '../revsport/dates'
import { clubIdFromUrl } from '../revsport/clubs'
import { isRevSportUrl, type ImportedGame, type ImportedGrade, type ImportedRound, type ImportResult } from '../revsport/parser'
import { loadAdmin, saveAdmin } from '../storage'
import { AGE_PERIOD_MINUTES, DEFAULT_HALF_TIME_BREAK_SEC, DEFAULT_QUARTER_BREAK_SEC, DEFAULT_SHOT_CLOCK_SEC, DEFAULT_SHOT_CLOCK_SHORT_SEC, MAX_FILL_INS, MAX_ON_CARD, PICK_FIXTURES_BY_TODAY, TEST_NUKE_GAME, type AdminSettings, type AgeGroup, type Match, type MatchMode, type Player, type Side, type Team } from '../types'

interface Props {
  initial: Match
  onStart: (match: Match) => void
  onReset: () => void
  onNuke: () => void
  onBackToVenues?: () => void
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatPickerDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${SHORT_MONTHS[dt.getUTCMonth()]}`
}

function uniqueGameDates(games: ImportedGame[]): string[] {
  return [...new Set(games.map((g) => g.date).filter((d): d is string => !!d))].sort()
}

function groupGamesByDate(games: ImportedGame[]): { date: string; games: ImportedGame[] }[] {
  const map = new Map<string, ImportedGame[]>()
  for (const g of games) {
    const key = g.date || ''
    const list = map.get(key)
    if (list) list.push(g)
    else map.set(key, [g])
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1
      if (!b) return -1
      return a.localeCompare(b)
    })
    .map(([date, list]) => ({ date, games: list }))
}

function pendingFrom(result: ImportResult & { pendingRoundUrls?: string[] }): string[] {
  if (result.pendingRoundUrls?.length) return result.pendingRoundUrls
  return result.roundUrls || result.rounds?.map((r) => r.url) || []
}

const FNC_GAMES_URL = 'https://www.fncwaterpolo.org.au/games'

export function SetupScreen({ initial, onStart, onReset, onNuke, onBackToVenues }: Props) {
  const [match, setMatch] = useState<Match>(initial)
  const [paste, setPaste] = useState('')
  const [target, setTarget] = useState<Side | 'both'>('both')
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [games, setGames] = useState<ImportedGame[]>([])
  const [grades, setGrades] = useState<ImportedGrade[]>([])
  const [pendingRoundUrls, setPendingRoundUrls] = useState<string[]>([])
  const [allDates, setAllDates] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(true)
  const [admin, setAdmin] = useState<AdminSettings>(() => loadAdmin())
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleMsg, setGoogleMsg] = useState('')
  const [googleConnected, setGoogleConnected] = useState(() => hasGoogleSession())
  const [clockOpen, setClockOpen] = useState(false)
  const [driveOpen, setDriveOpen] = useState(false)
  const [matchDetailsOpen, setMatchDetailsOpen] = useState(false)

  const issues = setupIssues(match)

  function persistAdmin(next: AdminSettings) {
    saveAdmin(next)
    setAdmin(next)
  }

  function persistClockDefaults(next: Match) {
    persistAdmin({
      ...loadAdmin(),
      ageGroup: next.ageGroup,
      periodMinutes: next.periodMinutes,
      shotClockSec: next.shotClockSec,
      shotClockShortSec: next.shotClockShortSec,
      quarterBreakSec: next.quarterBreakSec,
      halfTimeBreakSec: next.halfTimeBreakSec,
      mode: next.mode,
    })
  }

  useEffect(() => {
    persistClockDefaults(match)
    // Clock defaults live in admin storage so wipe / next game keeps them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.ageGroup, match.periodMinutes, match.shotClockSec, match.shotClockShortSec, match.quarterBreakSec, match.halfTimeBreakSec, match.mode])

  useEffect(() => {
    publishBoard(match)
  }, [match])

  function patch(p: Partial<Match>) {
    setMatch((m) => {
      const next = { ...m, ...p }
      if (p.ageGroup && p.ageGroup !== m.ageGroup) {
        next.periodMinutes = periodMinutes(p.ageGroup)
        next.clockRemainingSec = Math.max(1, next.periodMinutes) * 60
      }
      return next
    })
  }

  function setTeam(side: Side, team: Team) {
    setMatch((m) => (side === 'white' ? { ...m, white: team } : { ...m, blue: team }))
  }

  function applyResult(result: ImportResult, sourceUrl?: string) {
    const teams = result.teams.map(importedTeamToTeam)
    const side = target === 'both' && teams.length === 1 ? 'white' : target
    setMatch((m) => {
      let next = { ...m, ...importMetaPatch(m, result) }
      if (sourceUrl) next.sourceUrl = sourceUrl
      if (side === 'both' && teams.length >= 2) {
        next = { ...next, white: teams[0], blue: teams[1] }
      } else if (side === 'both' && teams.length === 1) {
        next = { ...next, white: teams[0] }
      } else if (side === 'white' && teams[0]) {
        next = { ...next, white: teams[0] }
      } else if (side === 'blue' && teams[0]) {
        next = { ...next, blue: teams[0] }
      }
      return next
    })
    const extra = result.teams.flatMap((t) =>
      t.players.length > MAX_ON_CARD
        ? [`${t.name}: ${t.players.length} listed — first ${MAX_ON_CARD} on the card, extras on the bench.`]
        : [],
    )
    const vs = result.teams.map((t) => `${t.name} (${t.players.length})`).join(' vs ')
    setMsg([...result.warnings, ...extra, vs ? `Imported ${vs}` : ''].filter(Boolean).join('\n'))
  }

  function showFixtureGames(result: Result) {
    const list = result.games || []
    setGames(list)
    setPendingRoundUrls(pendingFrom(result))
    setAllDates(false)
    setPickerOpen(true)
    setMatch((m) => ({ ...m, ...importMetaPatch(m, result) }))
    const dates = uniqueGameDates(list)
    const today = sydneyTodayISO()
    const focus = dates.length ? pickRelevantDate(dates, today) : undefined
    const n = PICK_FIXTURES_BY_TODAY && focus ? gamesOnDate(list, focus).length : list.length
    const head = !PICK_FIXTURES_BY_TODAY
      ? dates.length === 1
        ? formatPickerDate(dates[0])
        : dates.length
          ? `${dates.length} dates`
          : 'Games'
      : focus
        ? formatPickerDate(focus)
        : 'Games'
    setMsg(
      `${head} · ${n} game${n === 1 ? '' : 's'} in ${result.competition || 'this grade'}. Tap one to load teams and players.`,
    )
  }

  function fixturesHadNoGames(result: Result) {
    const pending = pendingFrom(result)
    setGames([])
    setPendingRoundUrls(pending)
    setAllDates(false)
    const hadRounds = (result.rounds?.length || result.roundUrls?.length || pending.length) > 0
    setMsg(
      hadRounds
        ? 'Fixtures listing had rounds but no games on this page. Try Show all dates or Paste HTML from a round page.'
        : result.warnings.join('\n') || 'No games parsed from this fixtures page.',
    )
  }

  async function onFetch(sourceUrl = url) {
    setBusy(true)
    setMsg('')
    setGames([])
    setGrades([])
    setPendingRoundUrls([])
    setAllDates(false)
    setPickerOpen(true)
    const result = await fetchRevSport(sourceUrl)
    setBusy(false)
    if (result.fetchError) {
      setMsg(result.fetchError)
      return
    }
    if ((result.grades?.length || 0) > 0 && !(result.games?.length)) {
      setGrades(result.grades || [])
      setMsg(`${result.grades!.length} grade${result.grades!.length === 1 ? '' : 's'}. Tap one to load games.`)
      return
    }
    if (result.source === 'fixtures' && (result.games?.length || 0) > 0) {
      showFixtureGames(result)
      return
    }
    if (result.source === 'fixtures') {
      fixturesHadNoGames(result)
      return
    }
    applyResult(result, sourceUrl)
  }

  async function pickGrade(grade: ImportedGrade) {
    patch({ sourceUrl: grade.url })
    setBusy(true)
    setMsg(`Loading ${grade.label}…`)
    setGames([])
    setPendingRoundUrls([])
    const result = await fetchRevSport(grade.url)
    setBusy(false)
    if (result.fetchError) {
      setMsg(result.fetchError)
      return
    }
    if (result.source === 'fixtures' && (result.games?.length || 0) > 0) {
      setGrades([])
      showFixtureGames(result)
      return
    }
    fixturesHadNoGames(result)
  }

  function loadFncFixtures() {
    patch({ sourceUrl: FNC_GAMES_URL })
    void onFetch(FNC_GAMES_URL)
  }

  async function onShowAllDates() {
    setBusy(true)
    setMsg('Loading other dates…')
    let next = games
    if (pendingRoundUrls.length) {
      const expanded = await expandPendingRounds({
        source: 'fixtures',
        teams: [],
        warnings: [],
        games,
        pendingRoundUrls,
      })
      next = expanded.games || []
      setGames(next)
      setPendingRoundUrls(expanded.pendingRoundUrls || [])
    }
    setAllDates(true)
    setBusy(false)
    setMsg(`${next.length} game${next.length === 1 ? '' : 's'} across all dates. Tap one to load teams and players.`)
  }

  async function pickGame(game: ImportedGame) {
    setBusy(true)
    setMsg(`Loading ${game.home} vs ${game.away}…`)
    const result = await fetchRevSport(game.detailsUrl)
    setBusy(false)
    if (result.fetchError) {
      setMsg(result.fetchError)
      return
    }
    if (!result.date && game.date) result.date = game.date
    if (!result.startTime && game.time) result.startTime = game.time
    if (!result.venue && game.venue) result.venue = game.venue
    if (!result.referees && game.referees) result.referees = game.referees
    applyResult(result, game.detailsUrl)
    setPickerOpen(false)
  }

  async function onPaste() {
    const result = importFromPaste(paste)
    if (result.source === 'fixtures' && (result.games?.length || 0) > 0) {
      showFixtureGames(result)
      return
    }
    if (result.source === 'fixtures' && (result.rounds?.length || result.roundUrls?.length)) {
      const today = sydneyTodayISO()
      const rounds: ImportedRound[] = result.rounds?.length
        ? result.rounds
        : (result.roundUrls || []).map((u) => ({ url: u, label: u }))
      const dates = rounds.map((r) => r.date).filter((d): d is string => !!d)
      const relevant = dates.length ? pickRelevantDate(dates, today) : undefined
      const chosen = (relevant && rounds.find((r) => r.date === relevant)) || rounds[0]
      const fetchUrl = chosen?.url || (isRevSportUrl(url) ? url : '')
      if (!fetchUrl) {
        fixturesHadNoGames(result)
        return
      }
      setBusy(true)
      setMsg('Loading the relevant round…')
      const fetched = await fetchRevSport(fetchUrl)
      setBusy(false)
      if (fetched.fetchError) {
        setMsg(fetched.fetchError)
        return
      }
      if (fetched.source === 'fixtures' && (fetched.games?.length || 0) > 0) {
        showFixtureGames(fetched)
        return
      }
      fixturesHadNoGames({ ...result, ...fetched, roundUrls: result.roundUrls, rounds: result.rounds })
      return
    }
    if (!result.teams.length) {
      setMsg(result.warnings.join('\n') || 'Nothing parsed')
      return
    }
    applyResult(result)
  }

  function start() {
    if (issues.length) {
      setMsg(issues.join('\n'))
      return
    }
    onStart({
      ...match,
      started: true,
      clockRemainingSec: quarterLengthSec(match),
      shotClockRemainingSec: match.shotClockSec,
      currentPeriod: 1,
      clockRunning: false,
      breakRemainingSec: 0,
      breakRunning: false,
      breakKind: null,
      id: match.id || uid(),
    })
  }

  function updateFolderUrl(raw: string) {
    const id = parseDriveFolderId(raw)
    persistAdmin({
      ...loadAdmin(),
      driveFolderUrl: raw,
      driveFolderId: id || loadAdmin().driveFolderId,
    })
  }

  async function onConnectGoogle() {
    const clientId = admin.googleClientId.trim()
    if (!clientId) {
      setGoogleMsg(
        `Connect Google needs a Google Cloud OAuth Web client ID with JS origins for http://localhost:5173 and ${window.location.origin}.`,
      )
      return
    }
    setGoogleBusy(true)
    setGoogleMsg('')
    try {
      await connectGoogle(clientId)
      const email = googleSessionEmail()
      persistAdmin({ ...loadAdmin(), lastEmail: email || loadAdmin().lastEmail })
      setGoogleConnected(true)
      setGoogleMsg(email ? `Connected as ${email}` : 'Connected')
    } catch (err) {
      setGoogleConnected(hasGoogleSession())
      setGoogleMsg(err instanceof Error ? err.message : 'Google connect failed')
    } finally {
      setGoogleBusy(false)
    }
  }

  const folderId = parseDriveFolderId(admin.driveFolderUrl) || admin.driveFolderId
  const lastSave = admin.lastSaveAt
    ? `last save ${new Date(admin.lastSaveAt).toLocaleString()}`
    : 'no save yet'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const url = match.sourceUrl
  const importedSummary = [match.eventName, match.grade, match.stage, match.date, match.startTime, match.venue]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="setup">
      <header className="venue-chrome setup-chrome">
        <img src="/logo-fnc.jpg" alt="Far North Coast Water Polo" className="fnc-logo" />
        <div className="venue-chrome-text">
          <h1>FNC Water Polo — Advanced setup</h1>
          <p className="muted">
            Far North Coast Water Polo only. White left, Blue right. Referee-signalled events
            (G / EG / PG / E / P / S / TO / SU). Prefer Tonight at venue on the home screen for game nights.
          </p>
        </div>
      </header>
      {onBackToVenues ? (
        <div className="tools" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn" onClick={onBackToVenues}>← Tonight at venue</button>
        </div>
      ) : null}

      <div className="card source-card">
        <h2>Import roster / fixtures</h2>
        <p className="muted">
          Loads Far North Coast Water Polo grades and games from the association listing. Paste HTML is under the fallback if fetch fails.
        </p>
        <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <select value={target} onChange={(e) => setTarget(e.target.value as Side | 'both')} className="btn">
            <option value="both">Fill White + Blue</option>
            <option value="white">Fill White only</option>
            <option value="blue">Fill Blue only</option>
          </select>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              const src = url && clubIdFromUrl(url) === 'FNC' ? url : FNC_GAMES_URL
              if (!url || clubIdFromUrl(url) !== 'FNC') patch({ sourceUrl: FNC_GAMES_URL })
              void onFetch(src)
            }}
          >
            {busy ? 'Fetching…' : 'Load FNC fixtures'}
          </button>
          <button className="btn" disabled={busy} type="button" onClick={() => loadFncFixtures()}>
            Refresh listing
          </button>
        </div>
        {grades.length ? (
          <div className="game-list">
            <div className="game-date-head">Grades</div>
            {grades.map((g) => (
              <button
                key={g.url}
                type="button"
                className="btn game-pick"
                disabled={busy}
                onClick={() => void pickGrade(g)}
              >
                <strong>{g.label}</strong>
              </button>
            ))}
          </div>
        ) : null}
        {games.length || pendingRoundUrls.length ? (
          pickerOpen ? (
            <>
              <div className="tools" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="btn small"
                  type="button"
                  onClick={() => setPickerOpen(false)}
                >
                  Minimise games
                </button>
              </div>
              <GamePicker
                games={games}
                pendingRoundUrls={pendingRoundUrls}
                allDates={allDates}
                busy={busy}
                onPick={(g) => void pickGame(g)}
                onShowAll={() => void onShowAllDates()}
                onShowNearest={() => {
                  setAllDates(false)
                  setMsg('Showing the nearest date only. Tap Show all dates for the rest.')
                }}
              />
            </>
          ) : (
            <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
              <button className="btn" type="button" onClick={() => setPickerOpen(true)}>
                Show games
              </button>
            </div>
          )
        ) : null}
        {importedSummary ? <p className="imported-summary">{importedSummary}</p> : null}
        {msg ? <pre className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{msg}</pre> : null}
        <details className="paste-fallback" style={{ marginTop: 10 }}>
          <summary className="muted">Paste game / roster HTML</summary>
          <label className="field" style={{ marginTop: 8 }}>
            Source URL
            <input
              placeholder="https://www.fncwaterpolo.org.au/games/…"
              value={url}
              onChange={(e) => {
                patch({ sourceUrl: e.target.value })
              }}
            />
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <textarea
              placeholder="If fetch fails, paste the association page HTML or a list: Name (#4)"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </label>
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <button className="btn" disabled={busy} onClick={() => void onPaste()}>Parse pasted table</button>
          </div>
        </details>
      </div>

      <details className="card match-details" open={clockOpen} onToggle={(e) => setClockOpen(e.currentTarget.open)}>
        <summary>
          Clock · {match.ageGroup} · {match.periodMinutes} min · shot {match.shotClockSec}/{match.shotClockShortSec} · {match.mode} · breaks {match.quarterBreakSec}/{match.halfTimeBreakSec}
        </summary>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <label className="field">
            Age group (period length)
            <select
              value={match.ageGroup}
              onChange={(e) => patch({ ageGroup: e.target.value as AgeGroup })}
            >
              {(Object.keys(AGE_PERIOD_MINUTES) as AgeGroup[]).map((a) => (
                <option key={a} value={a}>
                  {a} — 4 × {AGE_PERIOD_MINUTES[a]} min running time
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mode
            <select value={match.mode} onChange={(e) => patch({ mode: e.target.value as MatchMode })}>
              <option value="ROUND">ROUND — 0 timeouts (FNC rounds)</option>
              <option value="FINALS">MEDAL / FINALS — 2 timeouts per team, 1 min, possession only</option>
            </select>
          </label>
          <label className="field">
            Quarter length (minutes)
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={match.periodMinutes}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1)
                patch({ periodMinutes: n, clockRemainingSec: n * 60 })
              }}
            />
          </label>
          <label className="field">
            Shot clock (seconds)
            <input
              type="number"
              min={5}
              max={60}
              step={1}
              value={match.shotClockSec}
              onChange={(e) => {
                const n = Math.max(5, Number(e.target.value) || DEFAULT_SHOT_CLOCK_SEC)
                patch({ shotClockSec: n, shotClockRemainingSec: n })
              }}
            />
          </label>
          <label className="field">
            Short shot clock (after shot / rebound)
            <input
              type="number"
              min={5}
              max={60}
              step={1}
              value={match.shotClockShortSec}
              onChange={(e) => {
                const n = Math.max(5, Number(e.target.value) || DEFAULT_SHOT_CLOCK_SHORT_SEC)
                patch({ shotClockShortSec: n })
              }}
            />
          </label>
          <label className="field">
            Quarter break (Q1–Q2 and Q3–Q4), seconds
            <input
              type="number"
              min={0}
              max={600}
              step={1}
              placeholder={String(DEFAULT_QUARTER_BREAK_SEC)}
              value={match.quarterBreakSec}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value) || 0)
                patch({ quarterBreakSec: n })
              }}
            />
          </label>
          <label className="field">
            Half-time break (Q2–Q3), seconds
            <input
              type="number"
              min={0}
              max={600}
              step={1}
              placeholder={String(DEFAULT_HALF_TIME_BREAK_SEC)}
              value={match.halfTimeBreakSec}
              onChange={(e) => {
                const n = Math.max(0, Number(e.target.value) || 0)
                patch({ halfTimeBreakSec: n })
              }}
            />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Age group prefills quarter length. Shot clock defaults 28 / 18 (WA 2025). Quarter
          break and half-time here are the defaults for the next game too. 0 skips that break.
        </p>
      </details>

      <details className="card match-details" open={driveOpen} onToggle={(e) => setDriveOpen(e.currentTarget.open)}>
        <summary>Club Drive (admin)</summary>
        <p className="muted" style={{ marginTop: 8 }}>
          When a match ends, the sheet auto-saves the event log and player summary CSVs into this folder
          (kept as text/csv, not Google Sheets). Clear for next game stays locked until both files verify.
        </p>
        <label className="field">
          Drive folder URL
          <input
            value={admin.driveFolderUrl}
            onChange={(e) => updateFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            autoComplete="off"
          />
        </label>
        {folderId ? (
          <p className="muted">Folder id {folderId}</p>
        ) : (
          <p className="muted">Paste a folder URL containing /folders/FILEID, or a bare Drive id.</p>
        )}
        <label className="field">
          Google OAuth client ID (Web)
          <input
            value={admin.googleClientId}
            onChange={(e) => persistAdmin({ ...loadAdmin(), googleClientId: e.target.value })}
            placeholder="….apps.googleusercontent.com"
            autoComplete="off"
          />
        </label>
        {!admin.googleClientId.trim() ? (
          <p className="muted">
            Connect Google needs a Google Cloud OAuth <strong>Web</strong> client ID with authorised JavaScript
            origins for <code>http://localhost:5173</code>
            {origin ? (
              <>
                {' '}
                and <code>{origin}</code>
              </>
            ) : (
              ' and the current preview origin'
            )}
            . Do not use a Desktop or iOS client. No client ID is bundled with this app.
          </p>
        ) : null}
        <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <button className="btn primary" type="button" disabled={googleBusy} onClick={() => void onConnectGoogle()}>
            {googleBusy ? 'Connecting…' : 'Connect Google'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Google: {googleConnected ? `connected${admin.lastEmail ? ` (${admin.lastEmail})` : ''}` : 'not connected'}
          {' · '}
          {admin.lastSaveLogUrl ? (
            <>
              {lastSave}{' '}
              <a href={admin.lastSaveLogUrl} target="_blank" rel="noreferrer">
                event log
              </a>
              {admin.lastSaveSummaryUrl ? (
                <>
                  {' · '}
                  <a href={admin.lastSaveSummaryUrl} target="_blank" rel="noreferrer">
                    summary
                  </a>
                </>
              ) : null}
            </>
          ) : (
            lastSave
          )}
        </p>
        {googleMsg ? <p className="muted" style={{ marginTop: 6 }}>{googleMsg}</p> : null}
      </details>

      <details className="card match-details" open={matchDetailsOpen} onToggle={(e) => setMatchDetailsOpen(e.currentTarget.open)}>
        <summary>Match details (filled from association import)</summary>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <label className="field">Event<input value={match.eventName} onChange={(e) => patch({ eventName: e.target.value })} /></label>
          <label className="field">Stage / round<input value={match.stage} onChange={(e) => patch({ stage: e.target.value })} /></label>
          <label className="field">Venue<input value={match.venue} onChange={(e) => patch({ venue: e.target.value })} /></label>
          <label className="field">Grade<input value={match.grade} onChange={(e) => patch({ grade: e.target.value })} /></label>
          <label className="field">Date<input type="date" value={match.date} onChange={(e) => patch({ date: e.target.value })} /></label>
          <label className="field">Start time<input value={match.startTime} onChange={(e) => patch({ startTime: e.target.value })} /></label>
          <label className="field">Referee 1<input value={match.officials.referee1} onChange={(e) => patch({ officials: { ...match.officials, referee1: e.target.value } })} /></label>
          <label className="field">Referee 2<input value={match.officials.referee2} onChange={(e) => patch({ officials: { ...match.officials, referee2: e.target.value } })} /></label>
          <label className="field">Table secretary<input value={match.officials.tableSecretary} onChange={(e) => patch({ officials: { ...match.officials, tableSecretary: e.target.value } })} /></label>
          <label className="field">Timekeeper<input value={match.officials.timekeeper} onChange={(e) => patch({ officials: { ...match.officials, timekeeper: e.target.value } })} /></label>
        </div>
      </details>

      <div className="grid-2">
        <TeamEditor label="White (left)" team={match.white} onChange={(t) => setTeam('white', t)} />
        <TeamEditor label="Blue (right)" team={match.blue} onChange={(t) => setTeam('blue', t)} />
      </div>

      <div className="scoreboard-url">
        <span className="muted">Scoreboard URL (fixed — leave this on the TV)</span>
        <a href={boardUrl(origin, boardIdForMatch(match))} target="_blank" rel="noreferrer">
          {boardUrl(origin, boardIdForMatch(match))}
        </a>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            void navigator.clipboard?.writeText(boardUrl(origin, boardIdForMatch(match)))
          }}
        >
          Copy
        </button>
      </div>

      <div className="tools">
        <button className="btn" onClick={() => { onReset(); setMatch(demoMatch()); setGames([]); setPendingRoundUrls([]); setAllDates(false) }}>Load FNC Alstonville demo</button>
        {TEST_NUKE_GAME ? (
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              if (window.confirm("TEST nuke: wipe this game and go back to setup? Nothing is saved to Drive.")) {
                onNuke()
                setGames([])
                setPendingRoundUrls([])
                setAllDates(false)
              }
            }}
          >
            TEST: nuke game
          </button>
        ) : null}
        <button className="btn primary" onClick={start}>Start scoring</button>
      </div>
      {issues.length ? <p className="muted">{issues.join(' · ')}</p> : null}
    </div>
  )
}

function GamePicker({
  games,
  pendingRoundUrls,
  allDates,
  busy,
  onPick,
  onShowAll,
  onShowNearest,
}: {
  games: ImportedGame[]
  pendingRoundUrls: string[]
  allDates: boolean
  busy: boolean
  onPick: (game: ImportedGame) => void
  onShowAll: () => void
  onShowNearest: () => void
}) {
  const today = sydneyTodayISO()
  const dates = uniqueGameDates(games)
  const focusDate = dates.length ? pickRelevantDate(dates, today) : undefined
  const filterToToday = PICK_FIXTURES_BY_TODAY && !allDates
  const shown = filterToToday && focusDate ? gamesOnDate(games, focusDate) : games
  const groups = allDates || !filterToToday ? groupGamesByDate(shown) : [{ date: focusDate || dates[0] || '', games: shown }]
  const canShowAll = !allDates && (pendingRoundUrls.length > 0 || dates.length > 1)
  return (
    <div className="game-list">
      {canShowAll ? (
        <button className="btn" type="button" disabled={busy} onClick={onShowAll}>
          {busy ? 'Loading dates…' : 'Show all dates'}
        </button>
      ) : null}
      {PICK_FIXTURES_BY_TODAY && allDates && (dates.length > 1 || pendingRoundUrls.length > 0) ? (
        <button className="btn" type="button" disabled={busy} onClick={onShowNearest}>
          Show {focusDate ? formatPickerDate(focusDate) : 'nearest date'} only
        </button>
      ) : null}
      {groups.filter((group) => group.games.length > 0).map((group) => (
        <div key={group.date || 'undated'} className="game-date-group">
          <div className="game-date-head">
            {group.date ? formatPickerDate(group.date) : 'Undated'} · {group.games.length} game
            {group.games.length === 1 ? '' : 's'}
          </div>
          {group.games.map((g) => (
            <button
              key={g.detailsUrl}
              type="button"
              className="btn game-pick"
              disabled={busy}
              onClick={() => onPick(g)}
            >
              <strong>
                {g.home} vs {g.away}
              </strong>
              <span className="muted">
                {[g.time, g.venue, g.subvenue, g.referees].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function TeamEditor({ label, team, onChange }: { label: string; team: Team; onChange: (t: Team) => void }) {
  function update(i: number, patch: Partial<Player>) {
    const players = team.players.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    onChange({ ...team, players })
  }
  function add(fillIn: boolean) {
    const used = new Set(team.players.map((p) => p.cap))
    let n = 1
    while (used.has(String(n))) n += 1
    const onCard = team.players.filter((p) => p.onCard).length < MAX_ON_CARD
    const p = emptyPlayer({
      cap: String(n),
      name: fillIn ? 'Fill-in' : '',
      isFillIn: fillIn,
      onCard: fillIn ? onCard && team.players.filter((x) => x.isFillIn && x.onCard).length < MAX_FILL_INS : onCard,
    })
    onChange({ ...team, players: [...team.players, p] })
  }
  function remove(i: number) {
    onChange({ ...team, players: team.players.filter((_, idx) => idx !== i) })
  }
  return (
    <div className="card">
      <h2>{label}</h2>
      <label className="field" style={{ margin: '8px 0' }}>
        Club / team name
        <input value={team.name} onChange={(e) => onChange({ ...team, name: e.target.value })} />
      </label>
      <table className="roster-edit">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Card</th>
            <th title="Fill-in">Fill-in</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {team.players.map((p, i) => (
            <tr key={p.id}>
              <td style={{ width: 56 }}>
                <input value={p.cap} onChange={(e) => update(i, { cap: e.target.value, capGuessed: false })} />
              </td>
              <td>
                <input value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                {p.capGuessed ? <div className="muted">cap guessed — check</div> : null}
              </td>
              <td>
                <input type="checkbox" checked={p.onCard} onChange={(e) => update(i, { onCard: e.target.checked, present: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" checked={p.isFillIn} onChange={(e) => update(i, { isFillIn: e.target.checked })} />
              </td>
              <td>
                <button className="btn small" onClick={() => remove(i)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        <button className="btn small" onClick={() => add(false)}>Add player</button>
        <button className="btn small" onClick={() => add(true)}>Add fill-in</button>
      </div>
      <p className="muted">
        {team.players.filter((p) => p.onCard).length}/{MAX_ON_CARD} on card ·{' '}
        {team.players.filter((p) => p.isFillIn && p.onCard).length}/{MAX_FILL_INS} fill-ins
      </p>
    </div>
  )
}

