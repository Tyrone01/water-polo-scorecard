import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { csvFilenameStamp, eventLogFilename, playerSummaryFilename } from './csv'
import { demoMatch } from './demo'
import { parseDriveFolderId } from './driveFolder'
import { emptyTeam, endQuarter, newMatch } from './engine'
import { clearMatch, defaultAdmin, loadAdmin, loadMatch, saveAdmin, saveMatch } from './storage'
import { ADMIN_STORAGE_KEY, DEFAULT_DRIVE_FOLDER_ID, DEFAULT_DRIVE_FOLDER_URL, STORAGE_KEY } from './types'

describe('parseDriveFolderId', () => {
  it('parses /folders/FILEID and a bare id', () => {
    const id = DEFAULT_DRIVE_FOLDER_ID
    expect(parseDriveFolderId(DEFAULT_DRIVE_FOLDER_URL)).toBe(id)
    expect(parseDriveFolderId(`${DEFAULT_DRIVE_FOLDER_URL}?usp=sharing`)).toBe(id)
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id)
    expect(parseDriveFolderId(id)).toBe(id)
  })

  it('rejects empty or junk input', () => {
    expect(parseDriveFolderId('')).toBeNull()
    expect(parseDriveFolderId('not a folder')).toBeNull()
    expect(parseDriveFolderId('https://drive.google.com/drive/my-drive')).toBeNull()
    expect(parseDriveFolderId('short')).toBeNull()
  })
})

describe('CSV filename helper', () => {
  it('uses stamp-style event-log and player-summary names', () => {
    const match = newMatch({
      eventName: 'Brisbane Metro Junior Competition 2026/27',
      date: '2026-08-27',
    })
    const stamp = csvFilenameStamp(match)
    expect(eventLogFilename(match)).toBe(`${stamp}-event-log.csv`)
    expect(playerSummaryFilename(match)).toBe(`${stamp}-player-summary.csv`)
    expect(stamp).toContain('2026-08-27')
    expect(stamp.startsWith('Brisbane-Metro-Junior')).toBe(true)
  })
})

describe('newMatch / clear path', () => {
  it('does not require driveSave verified in the engine (UI gates it)', () => {
    const fresh = newMatch()
    expect(fresh.driveSave?.status).toBe('idle')
    expect(fresh.ended).toBe(false)
    expect(fresh.events).toEqual([])

    const demo = demoMatch()
    const q4 = {
      ...demo,
      started: true,
      currentPeriod: 4 as const,
      driveSave: { status: 'idle' as const },
    }
    const { match } = endQuarter(q4)
    expect(match.ended).toBe(true)
    expect(match.driveSave?.status).toBe('idle')

    const next = newMatch({
      ageGroup: 'U14',
      periodMinutes: 7,
      shotClockSec: 28,
      shotClockShortSec: 18,
      mode: 'FINALS',
      white: emptyTeam('White'),
      blue: emptyTeam('Blue'),
    })
    expect(next.events).toEqual([])
    expect(next.ended).toBe(false)
    expect(next.started).toBe(false)
    expect(next.driveSave?.status).toBe('idle')
    expect(next.ageGroup).toBe('U14')
    expect(next.shotClockSec).toBe(28)
    expect(next.shotClockShortSec).toBe(18)
    expect(next.white.players).toEqual([])
    expect(next.blue.players).toEqual([])
  })
})

describe('admin storage wipe', () => {
  class MemoryStorage {
    private data = new Map<string, string>()
    get length() {
      return this.data.size
    }
    clear() {
      this.data.clear()
    }
    getItem(key: string) {
      return this.data.has(key) ? this.data.get(key)! : null
    }
    key(index: number) {
      return [...this.data.keys()][index] ?? null
    }
    removeItem(key: string) {
      this.data.delete(key)
    }
    setItem(key: string, value: string) {
      this.data.set(key, String(value))
    }
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clearMatch removes only the match key and keeps Drive admin settings', () => {
    const admin = {
      ...defaultAdmin(),
      googleClientId: 'example.apps.googleusercontent.com',
      lastEmail: 'admin@ajwp.com.au',
      ageGroup: 'U12' as const,
      periodMinutes: 6,
    }
    saveAdmin(admin)
    saveMatch(demoMatch())
    expect(loadMatch()).toBeTruthy()
    clearMatch()
    expect(loadMatch()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(ADMIN_STORAGE_KEY)).toBeTruthy()
    const kept = loadAdmin()
    expect(kept.googleClientId).toBe('example.apps.googleusercontent.com')
    expect(kept.lastEmail).toBe('admin@ajwp.com.au')
    expect(kept.driveFolderId).toBe(DEFAULT_DRIVE_FOLDER_ID)
    expect(kept.driveFolderUrl).toBe(DEFAULT_DRIVE_FOLDER_URL)
    expect(kept.ageGroup).toBe('U12')
    expect(kept.periodMinutes).toBe(6)
    expect(kept.shotClockSec).toBe(28)
  })
})
