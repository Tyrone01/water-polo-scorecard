import { describe, expect, it } from 'vitest'
import { describeEntry, removalConfirmCopy } from './entryCopy'
import type { LogEvent } from './types'

const goal: LogEvent = {
  id: 'e1',
  period: 1,
  time: '5:22',
  timeRemainingSec: 322,
  cap: '4',
  side: 'white',
  code: 'G',
  score: '1–0',
}

describe('removal copy', () => {
  it('names the entry in plain English and shows the score change', () => {
    expect(describeEntry(goal)).toBe('White cap 4, goal, at 5:22')
    const copy = removalConfirmCopy({ white: 1, blue: 0 }, { white: 0, blue: 0 }, goal)
    expect(copy.title).toBe('Remove this entry?')
    expect(copy.body).toContain('White cap 4, goal, at 5:22')
    expect(copy.body).toContain('1–0')
    expect(copy.body).toContain('0–0')
    expect(copy.body).toContain('clock keeps going')
  })
})
