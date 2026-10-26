import { useEffect, useMemo, useState } from 'react'
import { FNC_VENUES, buildMatchFromFixture, type VenueGameFixture, type VenueNight } from '../demo'
import { quarterLengthSec, uid } from '../engine'
import {
  AJWP_FRIDAY_NIGHT,
  loadLiveMatch,
  syncAjwpFridayNight,
  syncVenueNightLive,
  venueSlug,
  type LiveGame,
  type LiveVenue,
  type SyncSnapshot,
} from '../revsport/sync'
import { boardIdForMatch, isFncBoardVenueId } from '../boardPublish'
import { pickVenueForPool, poolListNote } from '../poolMatch'
import type { Match } from '../types'

interface Props {
  onStart: (match: Match) => void
  /** Pool on screen, if one is open. Null on the pool list. */
  onAdvanced: (venueId: string | null) => void
  /** When returning from a finished game, land on this venue's game list. */
  initialVenueId?: string | null
  /** Landing-page Friday comp button. Separate from the FNC pool list. */
  night?: typeof AJWP_FRIDAY_NIGHT | null
  onLeaveNight?: () => void
}

function formatNightDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[dt.getUTCDay()]} ${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${m[1]}`
}

/** "FNC", "AJWP", or "FNC and AJWP", from the games that actually loaded. */
function liveSourceLabel(games: LiveGame[]): string {
  const sources = [...new Set(games.map((g) => g.source || 'FNC'))]
  return sources.length ? sources.join(' and ') : 'FNC'
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

export function VenueNightScreen({ onStart, onAdvanced, initialVenueId, night = null, onLeaveNight }: Props) {
  const friday = night === AJWP_FRIDAY_NIGHT
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [useDemo, setUseDemo] = useState(false)
  const [venueId, setVenueId] = useState<string | null>(initialVenueId ?? null)
  /** Set only after Option A opens a venue, or the official taps a card. */
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [listNote, setListNote] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startMsg, setStartMsg] = useState('')

  async function refresh(pickSingle = false, requestedOverride?: string | null) {
    const requested = friday ? null : (requestedOverride !== undefined ? requestedOverride : venueId)
    setLoading(true)
    setLoadError(null)
    setUseDemo(false)
    try {
      const next = friday ? await syncAjwpFridayNight() : await syncVenueNightLive()
      setSnap(next)
      if (next.error || !next.venues.length) {
        setOpenedId(null)
        setListNote(null)
        setLoadError(next.error || (friday ? 'No Friday games found.' : 'No fixtures found on FNC.'))
      } else {
        const pick = pickVenueForPool(next.venues, {
          requestedPoolId: requested,
          allowSoleVenue: friday || pickSingle || !requested,
        })
        if (pick.venue && (pick.reason === 'matched' || pick.reason === 'sole')) {
          setOpenedId(pick.venue.id)
          setVenueId(pick.venue.id)
          setListNote(null)
        } else {
          setOpenedId(null)
          if (requested && isFncBoardVenueId(requested)) {
            setVenueId(requested)
            setListNote(poolListNote(requested, pick.reason))
          } else if (pick.reason === 'ambiguous' || pick.reason === 'mixed') {
            setVenueId(null)
            setListNote(poolListNote('', pick.reason))
          } else {
            setVenueId(requested || null)
            setListNote(null)
          }
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Sync failed')
      setSnap(null)
      setOpenedId(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const nextVenue = friday ? null : (initialVenueId ?? null)
    setVenueId(nextVenue)
    setOpenedId(null)
    setListNote(null)
    void refresh(friday || !nextVenue, nextVenue)
    // friday switches the list (FNC pools vs Friday comp). initialVenueId is the pool to reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friday])

  const liveVenues: LiveVenue[] = snap?.venues || []
  const demoMode = !friday && (useDemo || (!loading && !!loadError && !liveVenues.length))

  const venue: LiveVenue | VenueNight | null = useMemo(() => {
    if (demoMode) return FNC_VENUES.find((v) => v.id === venueId) ?? null
    // A card tap, or an auto-open that already passed Option A.
    if (openedId) {
      const opened = liveVenues.find((v) => v.id === openedId)
      if (opened) return opened
    }
    if (!venueId) return null
    // ?venue=alstonville (or a longer slug). Open only when one venue name fits.
    return pickVenueForPool(liveVenues, { requestedPoolId: venueId, allowSoleVenue: false }).venue
  }, [demoMode, venueId, openedId, liveVenues])

  const eventLabel = demoMode
    ? 'Demo fixtures (offline)'
    : snap?.eventName || 'Far North Coast Water Polo'

  async function startLiveGame(game: LiveGame) {
    if (!venue) return
    setStartingId(game.id)
    setStartMsg(friday ? 'Loading teams…' : `Loading teams and venue from ${game.source || 'FNC'}…`)
    const { match, error, warnings } = await loadLiveMatch(game)
    setStartingId(null)
    if (!match || error) {
      setStartMsg(error || 'Could not load this game')
      return
    }
    if (warnings.length) {
      setStartMsg(
        (friday
          ? warnings.map((w) =>
              w
                .replace(/has no public player list on RevSport/gi, 'has no public player list')
                .replace(/This fixture has no RevSport team ids/g, 'This game has no team ids')
                .replace(/RevSport id/g, 'id')
                .replace(/RevSport/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim(),
            )
          : warnings
        ).join('\n'),
      )
    } else setStartMsg('')
    // Board id is the selected pool (alstonville etc.), not a long RevSport slug.
    // Prefer the selected venue's display name for the scorecard / TV meta line.
    const boardVenueId = boardIdForMatch({ venue: venue.name, boardVenueId: venue.id })
    startBuiltMatch(
      {
        ...match,
        boardVenueId,
        venue: venue.name || game.venueName || match.venue,
      },
      onStart,
    )
  }

  function startDemoGame(v: VenueNight, game: VenueGameFixture) {
    const boardVenueId = boardIdForMatch({ venue: v.name, boardVenueId: v.id })
    startBuiltMatch({ ...buildMatchFromFixture(v, game), boardVenueId }, onStart)
  }

  const venueList = demoMode ? FNC_VENUES : liveVenues

  return (
    <div className="venue-night">
      <header className="venue-chrome">
        <img src="/logo-fnc.jpg" alt="Far North Coast Water Polo" className="fnc-logo" />
        <div className="venue-chrome-text">
          <h1>{friday ? 'AJWP Friday night comp' : 'FNC Water Polo Scorecard'}</h1>
          <p className="muted">
            {friday ? 'Friday games' : eventLabel}
            {!demoMode && snap && !friday ? (
              <>
                <br />
                Live from {liveSourceLabel(snap.games)} · {snap.games.length} game{snap.games.length === 1 ? '' : 's'}
              </>
            ) : null}
            {friday && snap && !loadError ? (
              <>
                <br />
                {snap.games.length} game{snap.games.length === 1 ? '' : 's'}
              </>
            ) : null}
          </p>
        </div>
      </header>

      {loading ? (
        <section className="card venue-pick">
          <h2>{friday ? 'Loading Friday games…' : 'Loading fixtures…'}</h2>
          <p className="muted">{friday ? 'Pulling tonight’s games.' : 'Pulling competitions, games and venues from FNC and AJWP.'}</p>
        </section>
      ) : null}

      {!loading && loadError && !demoMode ? (
        <section className="card venue-pick">
          <h2>{friday ? 'Could not load Friday games' : 'Could not sync live fixtures'}</h2>
          <p className="muted">{loadError}</p>
          {friday && snap?.notice ? <p className="muted">{snap.notice}</p> : null}
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 12, gap: 8 }}>
            <button type="button" className="btn primary" onClick={() => void refresh()}>
              Retry
            </button>
            {friday ? (
              <button type="button" className="btn" onClick={onLeaveNight}>
                ← Pools
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUseDemo(true)
                  setVenueId(null)
                  setOpenedId(null)
                  setListNote(null)
                }}
              >
                Use demo venues
              </button>
            )}
            <button type="button" className="btn" onClick={() => onAdvanced(venueId)}>
              Advanced setup
            </button>
          </div>
        </section>
      ) : null}

      {!loading && (demoMode || liveVenues.length > 0) && !venue ? (
        <section className="card venue-pick">
          <h2>{friday ? 'Which pool on Friday?' : 'Tonight at which pool?'}</h2>
          {listNote && !demoMode ? <p className="muted">{listNote}</p> : null}
          {demoMode ? <p className="muted">Demo data — not live FNC.</p> : null}
          {snap?.notice && !demoMode ? <p className="muted" role="status">{snap.notice}</p> : null}
          {snap?.warnings?.length && !demoMode && !friday ? (
            <p className="muted">{snap.warnings.slice(0, 2).join(' ')}</p>
          ) : null}
          <div className="venue-grid">
            {venueList.map((v) => (
              <button
                key={v.id}
                type="button"
                className="venue-card"
                onClick={() => {
                  setListNote(null)
                  setOpenedId(v.id)
                  setVenueId(v.id)
                }}
              >
                <strong>{v.shortName}</strong>
                <span className="muted">{v.name}</span>
                <span className="venue-count">{v.games.length} games</span>
              </button>
            ))}
          </div>
          <div className="tools" style={{ justifyContent: 'flex-start', marginTop: 16, gap: 8 }}>
            {friday ? (
              <button type="button" className="btn" onClick={onLeaveNight}>
                ← Pools
              </button>
            ) : null}
            {!demoMode ? (
              <button type="button" className="btn" onClick={() => void refresh()}>
                Refresh fixtures
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void refresh()}>
                Back to live FNC
              </button>
            )}
            <button type="button" className="btn" onClick={() => onAdvanced(venueId)}>
              Advanced setup
            </button>
          </div>
        </section>
      ) : null}

      {!loading && venue ? (
        <section className="card venue-games">
          <div className="venue-games-head">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                if (friday && liveVenues.length <= 1) onLeaveNight?.()
                else {
                  setOpenedId(null)
                  setVenueId(null)
                  setListNote(null)
                }
              }}
            >
              {friday && liveVenues.length <= 1 ? '← Pools' : '← Venues'}
            </button>
            <div>
              <h2>{venue.shortName}</h2>
              <p className="muted">{venue.name}</p>
            </div>
          </div>
          {snap?.notice && !demoMode ? <p className="muted" role="status">{snap.notice}</p> : null}
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
                          {[g.source === 'AJWP' ? 'AJWP' : '', g.grade, g.round, g.date ? formatNightDate(g.date) : '']
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
            <button type="button" className="btn" onClick={() => onAdvanced(venueId)}>
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
  const boardId = boardIdForMatch({ venue })
  if (isFncBoardVenueId(boardId)) return boardId
  const live = venueSlug(venue)
  if (live) return live
  return null
}
