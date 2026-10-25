import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoMatch } from './demo'
import { applyEvent, isOutForRemainder } from './engine'
import { clearMatch, loadMatch, saveMatch } from './storage'
import { STORAGE_KEY } from './types'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  clear() {
    this.data.clear()
  }
}

describe('match save', () => {
  afterEach(() => {
    clearMatch()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('loads a player that was saved without a fouls list', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const raw = JSON.parse(JSON.stringify(demoMatch())) as { white: { players: Array<Record<string, unknown>> } }
    delete raw.white.players[0].fouls
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const loaded = loadMatch()
    expect(loaded?.white.players[0].fouls).toEqual([])
    expect(isOutForRemainder(loaded!.white.players[0])).toBe(false)
  })

  it('writes a new entry straight away and coalesces clock ticks', () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', new MemoryStorage())
    const m = { ...demoMatch(), started: true, clockRunning: true, clockRemainingSec: 100 }
    saveMatch(m)
    const first = localStorage.getItem(STORAGE_KEY)
    expect(first).toBeTruthy()
    saveMatch({ ...m, clockRemainingSec: 99.75 })
    saveMatch({ ...m, clockRemainingSec: 99.5 })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(first)
    vi.advanceTimersByTime(1000)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).clockRemainingSec).toBe(99.5)

    const scored = applyEvent(m, { side: 'white', cap: '4', code: 'G', timeRemainingSec: 90 }).match
    saveMatch(scored)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).events).toHaveLength(1)
  })

  it('does not write a clock tick back after the game is cleared', () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', new MemoryStorage())
    const m = { ...demoMatch(), started: true, clockRunning: true, clockRemainingSec: 100 }
    saveMatch(m)
    saveMatch({ ...m, clockRemainingSec: 50 })
    clearMatch()
    vi.advanceTimersByTime(2000)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
