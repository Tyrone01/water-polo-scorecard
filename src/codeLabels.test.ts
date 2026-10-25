import { describe, expect, it } from 'vitest'
import { CODE_BUTTON_LABEL } from './types'

describe('scoring button labels', () => {
  it('uses the words Tyrone locked for the poolside buttons', () => {
    expect(CODE_BUTTON_LABEL).toEqual({
      G: 'Goal',
      EG: 'Exclusion Goal',
      PG: 'Penalty Goal',
      E: 'Exclusion',
      P: 'Penalty',
      S: 'Suspension',
      TO: 'Time out',
      SU: 'Swim Up',
    })
  })
})
