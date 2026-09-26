import { useCallback, useEffect, useState } from 'react'
import { SetupScreen } from './components/SetupScreen'
import { Scorecard } from './components/Scorecard'
import { VenueNightScreen, venueIdFromMatchVenue } from './components/VenueNightScreen'
import { demoMatch } from './demo'
import { emptyTeam, newMatch } from './engine'
import { clearMatch, loadAdmin, loadMatch, saveMatch } from './storage'
import { publishBoard } from './boardPublish'
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
  const [lastVenueId, setLastVenueId] = useState<string | null>(null)

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
    clearMatch()
    setMatchState(matchFromAdminDefaults())
    setScreen('venue')
  }

  function startLive(m: Match) {
    const id = venueIdFromMatchVenue(m.venue)
    if (id) setLastVenueId(id)
    setMatchState(m)
    setScreen('live')
    publishBoard(m)
  }

  if (screen === 'venue') {
    return (
      <div className="app">
        <VenueNightScreen
          initialVenueId={lastVenueId}
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
