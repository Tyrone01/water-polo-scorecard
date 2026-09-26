import { isOutForRemainder, playerGoalTotal } from '../engine'
import type { Player, Side, Team } from '../types'

interface Props {
  side: Side
  team: Team
  selectedId?: string
  /** Compact live scoring: hide rename / present / strike / bench chrome. */
  compact?: boolean
  onSelect: (player: Player) => void
  onRename: (playerId: string, name: string) => void
  onStrike: (playerId: string) => void
  onUnstrike: (playerId: string) => void
  onPresent: (playerId: string, present: boolean) => void
  onToggleCard: (playerId: string, onCard: boolean) => void
}

export function TeamPanel({
  side,
  team,
  selectedId,
  compact = false,
  onSelect,
  onRename,
  onStrike,
  onUnstrike,
  onPresent,
  onToggleCard,
}: Props) {
  const card = team.players.filter((p) => p.onCard || p.struckOff)
  const bench = team.players.filter((p) => !p.onCard && !p.struckOff)
  const q = [0, 0, 0, 0, 0]
  for (const p of team.players) {
    q[0] += p.goalsQ1
    q[1] += p.goalsQ2
    q[2] += p.goalsQ3
    q[3] += p.goalsQ4
    q[4] += p.goalsPen
  }
  return (
    <section className={`team-panel ${side} ${compact ? 'compact' : ''}`}>
      <div className="team-head">
        <div>
          {side === 'white' ? 'WHITE' : 'BLUE'} · {team.name}
        </div>
        <div>
          Q {q[0]}-{q[1]}-{q[2]}-{q[3]}
          {q[4] ? ` P${q[4]}` : ''} · {q[0] + q[1] + q[2] + q[3] + q[4]}
        </div>
      </div>
      <table className="team-table">
        <thead>
          <tr>
            <th>Cap</th>
            <th>Player</th>
            <th>Majors</th>
            {!compact ? (
              <>
                <th>Q1</th>
                <th>Q2</th>
                <th>Q3</th>
                <th>Q4</th>
                <th>P</th>
              </>
            ) : null}
            <th>Tot</th>
          </tr>
        </thead>
        <tbody>
          {card.map((p) => {
            const out = isOutForRemainder(p)
            return (
              <tr
                key={p.id}
                className={`${selectedId === p.id ? 'selected' : ''} ${out || p.struckOff ? 'out' : ''}`}
                onClick={() => onSelect(p)}
              >
                <td>
                  <div className="cap">{p.cap}</div>
                </td>
                <td>
                  {compact ? (
                    <span className="name-static">{p.name}</span>
                  ) : (
                    <>
                      <input
                        className="name-input"
                        value={p.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onRename(p.id, e.target.value)}
                      />
                      <div className="row-actions">
                        <label>
                          <input
                            type="checkbox"
                            checked={p.present}
                            onChange={(e) => onPresent(p.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          />{' '}
                          present
                        </label>
                        {p.isFillIn ? <span> fill-in</span> : null}
                        <button
                          className="btn small"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (p.struckOff) onUnstrike(p.id)
                            else onStrike(p.id)
                          }}
                        >
                          {p.struckOff ? 'Unstrike' : 'Strike'}
                        </button>
                      </div>
                    </>
                  )}
                </td>
                <td>
                  <div className="fouls">
                    {[0, 1, 2].map((i) => {
                      const f = p.fouls[i]
                      return (
                        <div key={i} className={`foul ${f?.code || ''}`} title={f ? `${f.code} Q${f.period} ${f.time}` : ''}>
                          {f ? (f.code === 'line' ? '' : `${f.code}${f.period === 'PSO' ? '' : f.period}`) : ''}
                        </div>
                      )
                    })}
                  </div>
                </td>
                {!compact ? (
                  <>
                    <td>{p.goalsQ1 || ''}</td>
                    <td>{p.goalsQ2 || ''}</td>
                    <td>{p.goalsQ3 || ''}</td>
                    <td>{p.goalsQ4 || ''}</td>
                    <td>{p.goalsPen || ''}</td>
                  </>
                ) : null}
                <td>
                  <strong>{playerGoalTotal(p) || ''}</strong>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!compact && bench.length ? (
        <div style={{ padding: 8 }}>
          <div className="muted">Bench / extras — tick onto the card (max 10)</div>
          {bench.map((p) => (
            <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 40 }}>
              <input type="checkbox" checked={false} onChange={() => onToggleCard(p.id, true)} />
              #{p.cap} {p.name} {p.isFillIn ? '(fill-in)' : ''}
            </label>
          ))}
        </div>
      ) : null}
    </section>
  )
}
