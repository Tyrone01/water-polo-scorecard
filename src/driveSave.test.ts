import { describe, expect, it } from 'vitest'
import { plainDriveError, blockedOriginMessage } from './driveErrors'
import { resolveDriveTarget } from './driveTarget'
import { driveSavePanelModel } from './driveSavePanel'
import {
  driveOAuthPlan,
  isAllowedDriveOAuthCaller,
  isBakedOauthOrigin,
  isDriveOauthPath,
  isGoogleClientId,
  readDriveOAuthMessage,
} from './googleOrigins'
import { DEFAULT_DRIVE_FOLDER_ID, DEFAULT_DRIVE_FOLDER_URL, DEFAULT_GOOGLE_CLIENT_ID } from './types'

const poc = {
  folderId: DEFAULT_DRIVE_FOLDER_ID,
  folderUrl: DEFAULT_DRIVE_FOLDER_URL,
  label: 'AJWP POC Scorecards',
  isDefault: true,
}

describe('baked Google origins', () => {
  it('signs in directly on the two production hosts and localhost:5173', () => {
    expect(driveOAuthPlan('https://board.fncwp.com')).toBe('direct')
    expect(driveOAuthPlan('https://water-polo-scorecard.tyrone-mcgillick.workers.dev')).toBe('direct')
    expect(driveOAuthPlan('http://localhost:5173')).toBe('direct')
    expect(driveOAuthPlan('http://127.0.0.1:5173')).toBe('direct')
    expect(isBakedOauthOrigin('https://board.fncwp.com')).toBe(true)
  })

  it('relays preview hostnames and other localhost ports through board.fncwp.com', () => {
    const preview = 'https://abc.water-polo-scorecard.tyrone-mcgillick.workers.dev'
    expect(driveOAuthPlan(preview)).toBe('relay')
    expect(isAllowedDriveOAuthCaller(preview)).toBe(true)
    expect(driveOAuthPlan('http://localhost:5174')).toBe('relay')
  })

  it('refuses to hand a token to some other site', () => {
    expect(driveOAuthPlan('https://evil.example')).toBe('blocked')
    expect(isAllowedDriveOAuthCaller('https://evil.example')).toBe(false)
    expect(isAllowedDriveOAuthCaller('https://notwater-polo-scorecard.tyrone-mcgillick.workers.dev')).toBe(false)
    expect(readDriveOAuthMessage({ type: 'ajwp-drive-oauth-v1', accessToken: 'tok' }, 'https://evil.example')).toBeNull()
  })

  it('reads a token only from the stable host', () => {
    expect(readDriveOAuthMessage(
      { type: 'ajwp-drive-oauth-v1', accessToken: 'tok', expiresIn: 100, email: 'admin@ajwp.com.au' },
      'https://board.fncwp.com',
    )).toEqual({ ok: true, accessToken: 'tok', expiresIn: 100, email: 'admin@ajwp.com.au' })
    expect(readDriveOAuthMessage(
      { type: 'ajwp-drive-oauth-v1', error: 'nope' },
      'https://board.fncwp.com',
    )).toEqual({ ok: false, error: 'nope' })
  })

  it('recognises the sign-in path and the bundled client id', () => {
    expect(isDriveOauthPath('/drive-oauth')).toBe(true)
    expect(isDriveOauthPath('/drive-oauth/')).toBe(true)
    expect(isDriveOauthPath('/score')).toBe(false)
    expect(isGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID)).toBe(true)
    expect(isGoogleClientId('not-a-client')).toBe(false)
  })
})

describe('drive folder target', () => {
  it('uses the AJWP POC folder when nothing is configured', () => {
    expect(resolveDriveTarget({})).toEqual(poc)
  })

  it('keeps a custom folder URL', () => {
    const id = 'abcdefghij1234567890'
    const url = `https://drive.google.com/drive/folders/${id}`
    const target = resolveDriveTarget({ driveFolderUrl: url, driveFolderId: id })
    expect(target.isDefault).toBe(false)
    expect(target.folderId).toBe(id)
    expect(target.label).toBe('Custom club folder')
  })
})

describe('plain Drive errors', () => {
  it('turns a missing folder into poolside words', () => {
    const text = plainDriveError(`File not found: ${DEFAULT_DRIVE_FOLDER_ID}`, 'AJWP POC Scorecards')
    expect(text).toContain('AJWP POC Scorecards')
    expect(text).toContain('Editor')
    expect(text).toContain('Tyrone')
    expect(text).not.toContain('Setup →')
  })

  it('names the stable hosts when the page origin is rejected', () => {
    expect(plainDriveError('Error 400: origin_mismatch', 'AJWP POC Scorecards')).toBe(blockedOriginMessage())
    expect(blockedOriginMessage()).toContain('https://board.fncwp.com')
  })

  it('tells a closed Google window to tap again', () => {
    expect(plainDriveError('popup_closed_by_user', 'AJWP POC Scorecards')).toContain('Tap Save to Drive again')
  })
})

describe('end-of-game Save to Drive panel', () => {
  it('shows one Save to Drive tap and keeps Clear locked', () => {
    const model = driveSavePanelModel({
      save: { status: 'idle' },
      connected: false,
      target: poc,
    })
    expect(model.heading).toBe('Game over — save the scorecard')
    expect(model.primaryLabel).toBe('Save to Drive')
    expect(model.primaryDisabled).toBe(false)
    expect(model.clearEnabled).toBe(false)
    expect(model.tone).toBe('idle')
    expect(model.folderLine).toContain('AJWP POC Scorecards')
    expect(model.accountLine).toContain('admin@ajwp.com.au')
    expect(model.folderNote).toContain('Tyrone')
    expect(model.detail.toLowerCase()).not.toContain('auto-saving')
  })

  it('shows Saving, then Saved with Clear unlocked, and Retry after a failure', () => {
    const saving = driveSavePanelModel({
      save: { status: 'saving' },
      email: 'admin@ajwp.com.au',
      connected: true,
      target: poc,
    })
    expect(saving.tone).toBe('saving')
    expect(saving.primaryLabel).toBe('Saving…')
    expect(saving.primaryDisabled).toBe(true)
    expect(saving.clearEnabled).toBe(false)

    const saved = driveSavePanelModel({
      save: {
        status: 'verified',
        logUrl: 'https://drive.google.com/file/d/log/view',
        summaryUrl: 'https://drive.google.com/file/d/sum/view',
        accountEmail: 'admin@ajwp.com.au',
        folderLabel: 'AJWP POC Scorecards',
        folderUrl: DEFAULT_DRIVE_FOLDER_URL,
      },
      email: 'admin@ajwp.com.au',
      connected: true,
      target: poc,
    })
    expect(saved.tone).toBe('saved')
    expect(saved.clearEnabled).toBe(true)
    expect(saved.showSaveAgain).toBe(true)
    expect(saved.primaryLabel).toBeNull()
    expect(saved.logUrl).toContain('/log/')

    const failed = driveSavePanelModel({
      save: { status: 'error', error: 'Signed in, but no.' },
      connected: true,
      email: 'admin@ajwp.com.au',
      target: poc,
    })
    expect(failed.tone).toBe('error')
    expect(failed.primaryLabel).toBe('Retry save')
    expect(failed.clearEnabled).toBe(false)
    expect(failed.showSkipClear).toBe(true)
    expect(failed.detail).toBe('Signed in, but no.')
  })
})
