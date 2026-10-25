import { describe, expect, it } from 'vitest'
import { handleBoardRequest } from './boardApi'

describe('board API', () => {
  it('returns a busy response when the scoreboard store rejects a write', async () => {
    const res = await handleBoardRequest(
      new Request('https://board.test/api/board/alstonville', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: 1, updatedAt: 1 }),
      }),
      {
        SCOREBOARD: {
          get: async () => null,
          put: async () => {
            throw new Error('KV PUT failed: 429 Too Many Requests')
          },
        },
      },
    )
    expect(res?.status).toBe(503)
    const body = (await res?.json()) as { error?: string }
    expect(body.error).toMatch(/busy/i)
  })
})
