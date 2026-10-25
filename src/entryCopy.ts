import type { EventCode, LogEvent } from './types'

const ENTRY_NAMES: Record<EventCode, string> = {
  G: 'goal',
  EG: 'exclusion goal',
  PG: 'penalty goal',
  E: 'exclusion',
  P: 'penalty',
  S: 'suspension',
  TO: 'timeout',
  SU: 'swim-up',
}

/** One line a table official can read on a phone. */
export function describeEntry(event: LogEvent): string {
  const side = event.side === 'white' ? 'White' : 'Blue'
  const cap = event.cap ? ` cap ${event.cap}` : ''
  const when = event.time ? `, at ${event.time}` : ''
  return `${side}${cap}, ${ENTRY_NAMES[event.code] || event.code}${when}`
}

export function removalConfirmCopy(
  before: { white: number; blue: number },
  after: { white: number; blue: number },
  event: LogEvent,
): { title: string; body: string } {
  return {
    title: 'Remove this entry?',
    body: `${describeEntry(event)}. The score goes from ${before.white}–${before.blue} to ${after.white}–${after.blue}. The pool TV updates. The clock keeps going.`,
  }
}
