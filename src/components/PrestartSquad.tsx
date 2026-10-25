import { prestartSquad } from '../prestartCaps'
import type { Player, Side, Team } from '../types'

interface Props {
  side: Side
  team: Team
  selectedId?: string
  onSelect: (player: Player) => void
}

/** Full squad in the roster area until the game clock starts. */
export function PrestartSquad({ side, team, selectedId, onSelect }: Props) {
  const squad = prestartSquad(team)
  return (
    <section className={`team-panel prestart ${side}`} aria-label={`${side === 'white' ? 'White' : 'Blue'} squad before the clock starts`}>
      <div className="team-head">
        <div>
          {side === 'white' ? 'WHITE' : 'BLUE'} · {team.name}
        </div>
      </div>
      <div className="prestart-caps">
        {squad.map((row) => {
          const player = row.playerId ? team.players.find((p) => p.id === row.playerId) : undefined
          const selected = player && selectedId === player.id
          if (!player) {
            return (
              <div key={row.cap} className="prestart-cap">
                <span className="cap">{row.cap}</span>
                <span className="prestart-name">{row.name}</span>
              </div>
            )
          }
          return (
            <button
              key={row.cap}
              type="button"
              className={`prestart-cap${selected ? ' selected' : ''}`}
              onClick={() => onSelect(player)}
            >
              <span className="cap">{row.cap}</span>
              <span className="prestart-name">{row.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
