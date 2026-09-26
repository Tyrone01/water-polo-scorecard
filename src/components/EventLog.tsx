import { Fragment } from 'react'
import type { LogEvent } from '../types'

interface Props {
  events: LogEvent[]
  onEdit: (event: LogEvent) => void
}

export function EventLog({ events, onEdit }: Props) {
  let lastPeriod: LogEvent['period'] | null = null
  return (
    <section className="log">
      <h3>Chronological log · score only on goals · White–Blue</h3>
      <div className="log-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Cap</th>
              <th>W/B</th>
              <th>Code</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const divider = lastPeriod !== null && lastPeriod !== e.period
              lastPeriod = e.period
              return (
                <Fragment key={e.id}>
                  {divider ? (
                    <tr key={e.id + '-div'}>
                      <td colSpan={5} style={{ background: '#1a3a55', fontWeight: 800, fontSize: 11 }}>
                        — end of period, next {e.period} —
                      </td>
                    </tr>
                  ) : null}
                  <tr key={e.id} onClick={() => onEdit(e)} style={{ cursor: 'pointer' }} title="Tap to edit or delete">
                    <td>{e.time}<div className="muted">Q{e.period}</div></td>
                    <td>{e.cap || '—'}</td>
                    <td className={`wb ${e.side === 'white' ? 'W' : 'B'}`}>{e.side === 'white' ? 'W' : 'B'}</td>
                    <td><span className={`code-pill ${e.code}`}>{e.code}</span></td>
                    <td className="score-cell">{e.score || ''}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
