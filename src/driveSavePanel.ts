import type { DriveTarget } from './driveTarget'
import { CLUB_GOOGLE_ACCOUNT, type DriveSave } from './types'

export interface DriveSavePanelModel {
  tone: 'idle' | 'saving' | 'saved' | 'error'
  heading: string
  accountLine: string
  folderLine: string
  folderUrl: string
  folderNote: string
  detail: string
  primaryLabel: string | null
  primaryDisabled: boolean
  clearEnabled: boolean
  clearHint: string
  showSkipClear: boolean
  showSaveAgain: boolean
  logUrl?: string
  summaryUrl?: string
}

export function driveSavePanelModel(input: {
  save?: DriveSave
  email?: string
  connected: boolean
  target: DriveTarget
}): DriveSavePanelModel {
  const { save, connected, target } = input
  const status = save?.status ?? 'idle'
  const email = (input.email || '').trim()
  const folderLabel = status === 'verified' && save?.folderLabel ? save.folderLabel : target.label
  const folderUrl = status === 'verified' && save?.folderUrl ? save.folderUrl : target.folderUrl
  const showDefaultNote = target.isDefault && status !== 'verified'

  let accountLine: string
  if (status === 'saving' && !email) accountLine = 'Google account: opening sign-in…'
  else if (email && (connected || status === 'verified')) accountLine = `Google account: ${email}`
  else if (email) accountLine = `Google account: sign in again (last time ${email}). Checklist account is ${CLUB_GOOGLE_ACCOUNT}.`
  else accountLine = `Google account: you'll sign in on this tap. Checklist account is ${CLUB_GOOGLE_ACCOUNT}.`

  const folderNote = showDefaultNote
    ? `Mon night pool folder on ${CLUB_GOOGLE_ACCOUNT}'s Drive until an FNC Google tenant exists.`
    : status === 'verified'
      ? ''
      : 'Custom folder saved on this tablet.'

  if (status === 'verified') {
    return {
      tone: 'saved',
      heading: 'Saved to Drive',
      accountLine,
      folderLine: `Folder: ${folderLabel}`,
      folderUrl,
      folderNote,
      detail: 'Both files checked on Drive. Clear for the next game when the table is ready.',
      primaryLabel: null,
      primaryDisabled: false,
      clearEnabled: true,
      clearHint: '',
      showSkipClear: false,
      showSaveAgain: true,
      logUrl: save?.logUrl,
      summaryUrl: save?.summaryUrl,
    }
  }

  if (status === 'saving') {
    return {
      tone: 'saving',
      heading: 'Saving to Drive…',
      accountLine,
      folderLine: `Folder: ${folderLabel}`,
      folderUrl,
      folderNote,
      detail: 'Uploading the event log and the player summary.',
      primaryLabel: 'Saving…',
      primaryDisabled: true,
      clearEnabled: false,
      clearHint: 'Clear for the next game unlocks after Drive confirms both files.',
      showSkipClear: false,
      showSaveAgain: false,
    }
  }

  if (status === 'error') {
    return {
      tone: 'error',
      heading: "Couldn't save to Drive",
      accountLine,
      folderLine: `Folder: ${folderLabel}`,
      folderUrl,
      folderNote,
      detail: save?.error || 'Drive save failed.',
      primaryLabel: 'Retry save',
      primaryDisabled: false,
      clearEnabled: false,
      clearHint: 'Clear stays locked until both files are on Drive.',
      showSkipClear: true,
      showSaveAgain: false,
    }
  }

  return {
    tone: 'idle',
    heading: 'Game over — save the scorecard',
    accountLine,
    folderLine: `Folder: ${folderLabel}`,
    folderUrl,
    folderNote,
    detail: 'One tap uploads the event log and the player summary. Clear for the next game unlocks when Drive confirms both files.',
    primaryLabel: 'Save to Drive',
    primaryDisabled: false,
    clearEnabled: false,
    clearHint: 'Clear for the next game unlocks after Drive confirms both files.',
    showSkipClear: false,
    showSaveAgain: false,
  }
}
