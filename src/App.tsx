import { useCallback, useEffect, useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Scorecard } from './components/Scorecard'
import { VenueNightScreen, venueIdFromMatchVenue } from './components/VenueNightScreen'
import { demoMatch } from './demo'
import { emptyTeam, newMatch } from './engine'
import { clearMatch, loadAdmin, loadMatch, saveMatch } from './storage'
import { boardIdForMatch, clearBoard, publishBoard } from './boardPublish'
import { mergeTeamById } from './importApply'
import { AJWP_FRIDAY_NIGHT } from './revsport/sync'
import type { Match } from './types'

type Screen = 'venue' | 'setup' | 'live'

function matchFromAdminDefaults(): Match {
  const admin = loadAdmin()
  return newMatch({
    ageGroup: admin.ageGroup,
    periodMinutes: admin.periodMinutes,
    shotClockSec: admin.shotClockSec,
    shotClockShortSec: admin.shotClockShortSec,
    quarterBreakSec: admin.quarterBreakSec,
    halfTimeBreakSec: admin.halfTimeBreakSec,
    mode: admin.mode,
    white: emptyTeam('White'),
    blue: emptyTeam('Blue'),
    eventName: 'Far North Coast Water Polo — Junior Competition 2026',
    venue: '',
  })
}

function initialScreen(): Screen {
  const m = loadMatch()
  if (m?.started) return 'live'
  return 'venue'
}

export function App() {
  const [match, setMatchState] = useState<Match | null>(() => loadMatch())
  const [screen, setScreen] = useState<Screen>(() => initialScreen())
  // Landing page (board.fncwp.com) sends scorers here as /score?venue=alstonville.
  const [lastVenueId, setLastVenueId] = useState<string | null>(() => {
    const v = new URLSearchParams(window.location.search).get('venue')
    return v && /^[a-z0-9_-]{2,48}$/i.test(v) ? v.toLowerCase() : null
  })
  const [night, setNight] = useState<'ajwp-friday' | null>(() =>
    new URLSearchParams(window.location.search).get('night') === AJWP_FRIDAY_NIGHT ? AJWP_FRIDAY_NIGHT : null,
  )

  function leaveNight() {
    const url = new URL(window.location.href)
    url.searchParams.delete('night')
    const qs = url.searchParams.toString()
    window.history.replaceState(null, '', url.pathname + (qs ? `?${qs}` : ''))
    setNight(null)
  }

  useEffect(() => {
    if (match) saveMatch(match)
  }, [match])

  useEffect(() => {
    if (screen === 'live' && match) publishBoard(match)
  }, [match, screen])

  const setMatch = useCallback((next: Match | ((prev: Match) => Match)) => {
    setMatchState((prev) => {
      const base = prev ?? demoMatch()
      return typeof next === 'function' ? next(base) : next
    })
  }, [])

  function onClearNext() {
    if (match) {
      const resolved = boardIdForMatch(match)
      const venueKey = match.boardVenueId || venueIdFromMatchVenue(match.venue) || resolved
      if (venueKey) setLastVenueId(venueKey)
      clearBoard(resolved)
    }
    clearMatch()
    setMatchState(matchFromAdminDefaults())
    setScreen('venue')
  }

  function startLive(m: Match) {
    const cur = match
    // A game picked again from the venue list (new id) while the current game is still open.
    const openGame =
      cur && cur.id !== m.id && cur.started && !cur.ended &&
      (cur.events.length > 0 || [...cur.white.players, ...cur.blue.players].some((p) => !p.revsportId))
    if (openGame && cur.revsport?.gameId && cur.revsport.gameId === m.revsport?.gameId) {
      // Same RevSport game: carry on scoring. Rosters refresh by RevSport team/player id only,
      // so goals, fouls, the clock and players typed in by hand are all kept.
      const resumed: Match = {
        ...cur,
        white: mergeTeamById(cur.white, m.white),
        blue: mergeTeamById(cur.blue, m.blue),
        boardVenueId: m.boardVenueId || cur.boardVenueId,
      }
      setMatchState(resumed)
      setScreen('live')
      publishBoard(resumed)
      return
    }
    if (
      openGame && cur.events.length > 0 &&
      !window.confirm(
        `${cur.white.name} vs ${cur.blue.name} is not finished. Start ${m.white.name} vs ${m.blue.name} and clear its scores?`,
      )
    ) {
      setScreen('live')
      return
    }
    const resolved = boardIdForMatch(m)
    const id = m.boardVenueId || venueIdFromMatchVenue(m.venue) || resolved
    if (id) setLastVenueId(id)
    setMatchState(m)
    setScreen('live')
    publishBoard(m)
  }

  if (screen === 'venue') {
    return (
      <div className="app">
        <VenueNightScreen
          initialVenueId={night ? null : lastVenueId}
          night={night}
          onLeaveNight={leaveNight}
          onStart={startLive}
          onAdvanced={() => {
            setMatchState((prev) => prev ?? demoMatch())
            setScreen('setup')
          }}
        />
      </div>
    )
  }

  if (!match || screen === 'setup') {
    return (
      <div className="app">
        <SetupScreen
          initial={match ?? demoMatch()}
          onStart={startLive}
          onReset={() => {
            clearMatch()
            setMatchState(demoMatch())
          }}
          onNuke={onClearNext}
          onBackToVenues={() => setScreen('venue')}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <Scorecard
        match={match}
        setMatch={setMatch}
        onSetup={() => setScreen('setup')}
        onClearNext={onClearNext}
        onVenues={() => setScreen('venue')}
      />
    </div>
  )
}
