import { useEffect, useMemo, useState } from 'react'
import { FNC_VENUES, buildMatchFromFixture, type VenueGameFixture, type VenueNight } from '../demo'
import { quarterLengthSec, uid } from '../engine'
import {
  FNC_GAMES_HUB,
  loadLiveMatch,
  syncFncLive,
  venueSlug,
  type LiveGame,
  type LiveVenue,
  type SyncSnapshot,
} from '../revsport/sync'
import type { Match } from '../types'

interface Props {
  onStart: (match: Match) => void
  onAdvanced: () => void
  /** When returning from a finished game, land on this venue's game list. */
  initialVenueId?: string | null
}

function formatNightDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[dt.getUTCDay()]} ${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${m[1]}`
}

function startBuiltMatch(built: Match, onStart: (m: Match) => void) {
  onStart({
    ...built,
    id: uid(),
    started: true,
    clockRemainingSec: quarterLengthSec(built),
    shotClockRemainingSec: built.shotClockSec,
    currentPeriod: 1,
    clockRunning: false,
    shotClockRunning: false,
    breakRemainingSec: 0,
    breakRunning: false,
    breakKind: null,
  })
}

export function VenueNightScreen({ onStart, onAdvanced, initialVenueId }: Props) {
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [useDemo, setUseDemo] = useState(false)
  const [venueId, setVenueId] = useState<string | null>(initialVenueId ?? null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startMsg, setStartMsg] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError(null)
    setUseDemo(false)
    try {
      const next = await syncFncLive(FNC_GAMES_HUB)
      setSnap(next)
      if (next.error || !next.venues.length) {
        setLoadError(next.error || 'No fixtures found on FNC.')
      } else if (next.venues.length === 1 && !venueId) {
        setVenueId(next.venues[0].id)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Sync failed')
      setSnap(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const liveVenues: LiveVenue[] = snap?.venues || []
  const demoMode = useDemo || (!loading && !!loadError && !liveVenues.length)

  const venue: LiveVenue | VenueNight | null = useMemo(() => {
    if (demoMode) return FNC_VENUES.find((v) => v.id === venueId) ?? null
    return liveVenues.find((v) => v.id === venueId) ?? null
  }, [demoMode, venueId, liveVenues])

  const eventLabel = demoMode
    ? 'Demo fixtures (offline)'
    : snap?.eventName || 'Far North Coast Water Polo'

  async function startLiveGame(game: LiveGame) {
    setStartingId(game.id)
    setStartMsg('Loading teams and venue from FNC…')
    const { match, error, warnings } = await loadLiveMatch(game)
    setStartingId(null)
    if (!match || error) {
      setStartMsg(error || 'Could not load this game')
      return
    }
    if (warnings.length) setStartMsg(warnings.join('\n'))
    else setStartMsg('')
    startBuiltMatch(match, onStart)
  }

  function startDemoGame(v: VenueNight, game: VenueGameFixture) {
    startBuiltMatch(buildMatchFromFixture(v, game), onStart)
  }

  const venueList = demoMode ? FNC_VENUES : liveVenues

  return (
    <div className="venue-night">
      <header className="venue-chrome">
        <img src="/logo-fnc.jpg" alt="Far North Coast Water Polo" className="fnc-logo" />
        <div className="venue-chrome-text">
          <h1>FNC Water Polo Scorecard</h1>
          <p className="muted">
            {eventLabel}
            {!demoMode && snap ? (
              <>
                <br />
                Live from FNC · {snap.games.length} game{snap.games.length === 1 ? '' : 's'}
              </>
            ) : null}
          </p>
        </div>
      </header>

      {loading ? (
        <section className="card venue-pick">
          <h2>Loading FNC fixtures…</h2>
          <p className="muted">Pulling competitions, games and venues from fncwaterpolo.org.au</p>
        </section>
      ) : null}

      {!loading && loadError && !demoMode ? (
        <section className="card venue-pick">
          <h2>Could not sync live fixtures</h2>
          <p className="muted">{loadError}</p>
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 12, gap: 8 }}>
            <button type="button" className="btn primary" onClick={() => void refresh()}>
              Retry
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setUseDemo(true)
                setVenueId(null)
              }}
            >
              Use demo venues
            </button>
            <button type="button" className="btn" onClick={onAdvanced}>
              Advanced setup
            </button>
          </div>
        </section>
      ) : null}

      {!loading && (demoMode || liveVenues.length > 0) && !venue ? (
        <section className="card venue-pick">
          <h2>Tonight at which pool?</h2>
          {demoMode ? <p className="muted">Demo data — not live FNC.</p> : null}
          {snap?.warnings?.length && !demoMode ? (
            <p className="muted">{snap.warnings.slice(0, 2).join(' ')}</p>
          ) : null}
          <div className="venue-grid">
            {venueList.map((v) => (
              <button key={v.id} type="button" className="venue-card" onClick={() => setVenueId(v.id)}>
                <strong>{v.shortName}</strong>
                <span className="muted">{v.name}</span>
                <span className="venue-count">{v.games.length} games</span>
              </button>
            ))}
          </div>
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 16, gap: 8 }}>
            {!demoMode ? (
              <button type="button" className="btn" onClick={() => void refresh()}>
                Refresh fixtures
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void refresh()}>
                Back to live FNC
              </button>
            )}
            <button type="button" className="btn" onClick={onAdvanced}>
              Advanced setup
            </button>
          </div>
        </section>
      ) : null}

      {!loading && venue ? (
        <section className="card venue-games">
          <div className="venue-games-head">
            <button type="button" className="btn small" onClick={() => setVenueId(null)}>
              ← Venues
            </button>
            <div>
              <h2>{venue.shortName}</h2>
              <p className="muted">{venue.name}</p>
            </div>
          </div>
          {startMsg ? <p className="muted">{startMsg}</p> : null}
          <div className="game-night-list">
            {demoMode
              ? [...(venue as VenueNight).games]
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="game-night-row"
                      onClick={() => startDemoGame(venue as VenueNight, g)}
                    >
                      <span className="game-time">{g.startTime}</span>
                      <span className="game-meta">
                        <strong>
                          {g.whiteName} <span className="vs">vs</span> {g.blueName}
                        </strong>
                        <span className="muted">
                          {g.grade} · {g.stage} · {g.ageGroup} · {g.mode}
                        </span>
                      </span>
                      <span className="game-go">Score →</span>
                    </button>
                  ))
              : [...(venue as LiveVenue).games]
                  .sort((a, b) => {
                    const da = `${a.date || ''} ${a.time || ''}`
                    const db = `${b.date || ''} ${b.time || ''}`
                    return da.localeCompare(db)
                  })
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="game-night-row"
                      disabled={startingId === g.id}
                      onClick={() => void startLiveGame(g)}
                    >
                      <span className="game-time">{g.time || '—'}</span>
                      <span className="game-meta">
                        <strong>
                          {g.home} <span className="vs">vs</span> {g.away}
                        </strong>
                        <span className="muted">
                          {[g.grade, g.round, g.date ? formatNightDate(g.date) : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="game-go">{startingId === g.id ? '…' : 'Score →'}</span>
                    </button>
                  ))}
          </div>
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 12, gap: 8 }}>
            {!demoMode ? (
              <button type="button" className="btn" onClick={() => void refresh()}>
                Refresh fixtures
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onAdvanced}>
              Advanced setup
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** Resolve a venue id from a match.venue string for return navigation. */
export function venueIdFromMatchVenue(venue: string | undefined | null): string | null {
  if (!venue) return null
  const live = venueSlug(venue)
  if (live) return live
  return null
}
