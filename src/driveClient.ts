import { eventLogCsv, eventLogFilename, playerSummaryCsv, playerSummaryFilename } from './csv'
import { plainDriveError } from './driveErrors'
import { resolveDriveTarget } from './driveTarget'
import { getValidAccessToken, googleSessionEmail } from './googleAuth'
import { loadAdmin, saveAdmin } from './storage'
import type { DriveSave, Match } from './types'

const autoSaves = new Map<string, Promise<DriveSave>>()

export interface DriveUploadResult {
  files: { id: string; name: string; webViewLink?: string }[]
}

async function postUpload(body: {
  accessToken: string
  folderId: string
  files: { name: string; content: string; mimeType: string }[]
}): Promise<DriveUploadResult> {
  const res = await fetch('/api/drive/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data: { error?: string; files?: DriveUploadResult['files'] } = {}
  try {
    data = (await res.json()) as { error?: string; files?: DriveUploadResult['files'] }
  } catch {
    data = { error: 'Drive proxy returned a non-JSON response' }
  }
  if (!res.ok || !data.files) {
    throw new Error(data.error || `Drive upload failed (HTTP ${res.status})`)
  }
  return { files: data.files }
}

export async function saveMatchToDrive(match: Match): Promise<DriveSave> {
  const admin = loadAdmin()
  const target = resolveDriveTarget(admin)
  const base = { folderLabel: target.label, folderUrl: target.folderUrl }
  if (!target.folderId) {
    return { status: 'error', ...base, error: `No Drive folder on this tablet. Ask Tyrone to confirm ${target.label}.` }
  }
  try {
    const accessToken = await getValidAccessToken(admin.googleClientId)
    const result = await postUpload({
      accessToken,
      folderId: target.folderId,
      files: [
        { name: eventLogFilename(match), content: eventLogCsv(match), mimeType: 'text/csv' },
        { name: playerSummaryFilename(match), content: playerSummaryCsv(match), mimeType: 'text/csv' },
      ],
    })
    const log = result.files[0]
    const summary = result.files[1]
    if (!log?.id || !summary?.id) {
      return { status: 'error', ...base, error: 'Drive did not confirm both CSV files. Tap Retry.' }
    }
    const savedAt = new Date().toISOString()
    const email = googleSessionEmail()
    const accountEmail = email || admin.lastEmail
    saveAdmin({
      ...loadAdmin(),
      lastEmail: accountEmail || loadAdmin().lastEmail,
      lastSaveAt: savedAt,
      lastSaveLogUrl: log.webViewLink,
      lastSaveSummaryUrl: summary.webViewLink,
    })
    return {
      status: 'verified',
      ...base,
      logFileId: log.id,
      summaryFileId: summary.id,
      logUrl: log.webViewLink,
      summaryUrl: summary.webViewLink,
      savedAt,
      accountEmail,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Drive save failed'
    return {
      status: 'error',
      ...base,
      error: plainDriveError(raw, target.label),
      accountEmail: googleSessionEmail() || admin.lastEmail,
    }
  }
}

export function autoSaveMatchToDrive(match: Match): Promise<DriveSave> {
  const existing = autoSaves.get(match.id)
  if (existing) return existing
  const pending = saveMatchToDrive(match)
  autoSaves.set(match.id, pending)
  return pending
}

export function retrySaveMatchToDrive(match: Match): Promise<DriveSave> {
  autoSaves.delete(match.id)
  return autoSaveMatchToDrive(match)
}
