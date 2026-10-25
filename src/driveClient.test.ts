import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./googleAuth', () => ({
  getValidAccessToken: vi.fn(async () => 'token-1'),
  googleSessionEmail: vi.fn(() => 'tyrone.mcgillick@gmail.com'),
}))

import { autoSaveMatchToDrive, retrySaveMatchToDrive, saveMatchToDrive } from './driveClient'
import { newMatch } from './engine'
import { defaultAdmin, loadAdmin, saveAdmin } from './storage'
import { DEFAULT_DRIVE_FOLDER_ID } from './types'

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('saveMatchToDrive', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    saveAdmin(defaultAdmin())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uploads both CSVs into the Alstonville Mon night folder and verifies them', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { folderId: string; files: { mimeType: string }[] }
      expect(body.folderId).toBe('1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk')
      expect(body.folderId).toBe(DEFAULT_DRIVE_FOLDER_ID)
      expect(body.files).toHaveLength(2)
      expect(body.files.every((f) => f.mimeType === 'text/csv')).toBe(true)
      return jsonResponse({
        files: [
          { id: 'log1', name: 'event.csv', webViewLink: 'https://drive.google.com/file/d/log1/view' },
          { id: 'sum1', name: 'summary.csv', webViewLink: 'https://drive.google.com/file/d/sum1/view' },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const match = newMatch({ id: 'game-verified', venue: 'Alstonville Aquatic Centre', boardVenueId: 'alstonville' })
    const saved = await saveMatchToDrive(match)
    expect(saved.status).toBe('verified')
    expect(saved.logFileId).toBe('log1')
    expect(saved.summaryFileId).toBe('sum1')
    expect(saved.accountEmail).toBe('tyrone.mcgillick@gmail.com')
    expect(saved.folderLabel).toBe('Alstonville under Mon night (FNC)')
    expect(loadAdmin().lastEmail).toBe('tyrone.mcgillick@gmail.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uploads a Ballina game into the Ballina pool folder, not the parent Scorecards folder', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { folderId: string }
      expect(body.folderId).toBe('1bW0_O_64h36zBaEyqkyxAtuasWf2ugqG')
      expect(body.folderId).not.toBe('1PzhpHO6y89W3TdenqrEnL4Wz6mQ9Knok')
      return jsonResponse({
        files: [
          { id: 'logb', name: 'event.csv', webViewLink: 'https://drive.google.com/file/d/logb/view' },
          { id: 'sumb', name: 'summary.csv', webViewLink: 'https://drive.google.com/file/d/sumb/view' },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const saved = await saveMatchToDrive(newMatch({ id: 'game-ballina', venue: 'Ballina Indoor Pool', boardVenueId: 'ballina' }))
    expect(saved.status).toBe('verified')
    expect(saved.folderLabel).toBe('Ballina under Mon night (FNC)')
  })

  it('says the pool folder was not writable, in plain English', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: `File not found: ${DEFAULT_DRIVE_FOLDER_ID}` }, 502)))
    const saved = await saveMatchToDrive(newMatch({ id: 'game-missing-folder' }))
    expect(saved.status).toBe('error')
    expect(saved.error).toContain('Editor')
    expect(saved.error).toContain('Alstonville under Mon night (FNC)')
    expect(saved.error).toContain('tyrone.mcgillick@gmail.com')
    expect(saved.error).not.toContain('Paste it in Setup')
    expect(saved.error).not.toContain('AJWP POC')
  })

  it('uploads a custom folder when the tablet has one', async () => {
    const id = 'abcdefghij1234567890'
    saveAdmin({
      ...defaultAdmin(),
      driveFolderUrl: `https://drive.google.com/drive/folders/${id}`,
      driveFolderId: id,
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { folderId: string }
      expect(body.folderId).toBe(id)
      return jsonResponse({
        files: [
          { id: 'log2', name: 'event.csv', webViewLink: 'https://drive.google.com/file/d/log2/view' },
          { id: 'sum2', name: 'summary.csv', webViewLink: 'https://drive.google.com/file/d/sum2/view' },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const saved = await saveMatchToDrive(newMatch({ id: 'game-custom', venue: 'Lismore', boardVenueId: 'lismore' }))
    expect(saved.status).toBe('verified')
    expect(saved.folderLabel).toBe('Custom club folder')
  })

  it('dedupes an in-flight save and lets Retry upload again', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      return jsonResponse({
        files: [
          { id: `log${calls}`, name: 'event.csv' },
          { id: `sum${calls}`, name: 'summary.csv' },
        ],
      })
    }))
    const match = newMatch({ id: 'game-dedupe' })
    const [first, second] = await Promise.all([autoSaveMatchToDrive(match), autoSaveMatchToDrive(match)])
    expect(first.status).toBe('verified')
    expect(second).toBe(first)
    expect(calls).toBe(1)
    const again = await retrySaveMatchToDrive(match)
    expect(again.status).toBe('verified')
    expect(again.logFileId).toBe('log2')
    expect(calls).toBe(2)
  })
})
