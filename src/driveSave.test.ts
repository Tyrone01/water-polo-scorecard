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
import {
  CLUB_GOOGLE_ACCOUNT,
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_LABEL,
  DEFAULT_DRIVE_FOLDER_URL,
  DEFAULT_GOOGLE_CLIENT_ID,
  DRIVE_SCORECARDS_PARENT_ID,
  MON_NIGHT_FOLDER_ID,
  MON_NIGHT_POOL_FOLDER_IDS,
  RETIRED_AJWP_POC_FOLDER_ID,
} from './types'

const alstonville = {
  folderId: '1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk',
  folderUrl: 'https://drive.google.com/drive/folders/1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk',
  label: 'Alstonville under Mon night (FNC)',
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
      { type: 'ajwp-drive-oauth-v1', accessToken: 'tok', expiresIn: 100, email: 'tyrone.mcgillick@gmail.com' },
      'https://board.fncwp.com',
    )).toEqual({ ok: true, accessToken: 'tok', expiresIn: 100, email: 'tyrone.mcgillick@gmail.com' })
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
  it('uses the Alstonville Mon night pool when nothing is configured', () => {
    expect(DEFAULT_DRIVE_FOLDER_ID).toBe(MON_NIGHT_POOL_FOLDER_IDS.alstonville)
    expect(DEFAULT_DRIVE_FOLDER_ID).toBe('1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk')
    expect(DEFAULT_DRIVE_FOLDER_LABEL).toBe('Alstonville under Mon night (FNC)')
    expect(DEFAULT_DRIVE_FOLDER_URL).toBe(alstonville.folderUrl)
    expect(CLUB_GOOGLE_ACCOUNT).toBe('tyrone.mcgillick@gmail.com')
    expect(DEFAULT_GOOGLE_CLIENT_ID).toBe('251564153707-4d57t4mdibcq9ulvehk7k0jrkgovbm3b.apps.googleusercontent.com')
    expect(resolveDriveTarget({})).toEqual(alstonville)
    expect(resolveDriveTarget({}).folderId).not.toBe(DRIVE_SCORECARDS_PARENT_ID)
    expect(resolveDriveTarget({}).folderId).not.toBe(MON_NIGHT_FOLDER_ID)
    expect(resolveDriveTarget({}).folderId).not.toBe(RETIRED_AJWP_POC_FOLDER_ID)
  })

  it('maps each FNC pool to its Mon night folder, and ?venue= when the game has no pool', () => {
    expect(resolveDriveTarget({}, { boardVenueId: 'alstonville' }).folderId).toBe('1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk')
    expect(resolveDriveTarget({}, { venue: 'Ballina Indoor Pool' })).toMatchObject({
      folderId: '1bW0_O_64h36zBaEyqkyxAtuasWf2ugqG',
      label: 'Ballina under Mon night (FNC)',
      isDefault: true,
    })
    expect(resolveDriveTarget({}, { venue: 'Lismore', boardVenueId: 'lismore' }).folderId).toBe('1Vc7PAAbOYFa51HPbWmmn5FWbNEiFzHqS')
    expect(resolveDriveTarget({}, { venueQuery: 'mullumbimby' }).folderId).toBe('1AKr2CS-t0j7fftQfu6A_4yVMGtjUbkg7')
    expect(resolveDriveTarget({}, { venue: 'Lismore', venueQuery: 'alstonville' }).folderId).toBe('1Vc7PAAbOYFa51HPbWmmn5FWbNEiFzHqS')
    expect(resolveDriveTarget({}, { venue: 'Somewhere else' }).folderId).toBe('1RrmsmFxqns-C_9ADhZaYQtUE4ElYiESk')
  })

  it('keeps a custom folder URL even when the game has a pool', () => {
    const id = 'abcdefghij1234567890'
    const url = `https://drive.google.com/drive/folders/${id}`
    const target = resolveDriveTarget({ driveFolderUrl: url, driveFolderId: id }, { boardVenueId: 'ballina' })
    expect(target.isDefault).toBe(false)
    expect(target.folderId).toBe(id)
    expect(target.label).toBe('Custom club folder')
  })

  it('does not keep the retired AJWP POC folder when the tablet still has it stored', () => {
    const target = resolveDriveTarget({
      driveFolderId: RETIRED_AJWP_POC_FOLDER_ID,
      driveFolderUrl: `https://drive.google.com/drive/folders/${RETIRED_AJWP_POC_FOLDER_ID}`,
    }, { boardVenueId: 'ballina' })
    expect(target.folderId).toBe('1bW0_O_64h36zBaEyqkyxAtuasWf2ugqG')
    expect(target.label).toBe('Ballina under Mon night (FNC)')
  })
})

describe('plain Drive errors', () => {
  it('turns a missing folder into poolside words', () => {
    const text = plainDriveError(`File not found: ${DEFAULT_DRIVE_FOLDER_ID}`, 'Alstonville under Mon night (FNC)')
    expect(text).toContain('Alstonville under Mon night (FNC)')
    expect(text).toContain('tyrone.mcgillick@gmail.com')
    expect(text).toContain('Editor')
    expect(text).toContain('Mon night')
    expect(text).not.toContain('AJWP POC')
    expect(text).not.toContain('Setup →')
  })

  it('tells a blocked sign-in to use the personal checklist account', () => {
    const text = plainDriveError('access_denied', 'Alstonville under Mon night (FNC)')
    expect(text).toContain('External testing')
    expect(text).toContain('tyrone.mcgillick@gmail.com')
    expect(text).not.toContain('refused')
    expect(text).not.toContain('admin@ajwp.com.au')
  })

  it('names the stable hosts when the page origin is rejected', () => {
    expect(plainDriveError('Error 400: origin_mismatch', 'Alstonville under Mon night (FNC)')).toBe(blockedOriginMessage())
    expect(blockedOriginMessage()).toContain('https://board.fncwp.com')
  })

  it('tells a closed Google window to tap again', () => {
    expect(plainDriveError('popup_closed_by_user', 'Alstonville under Mon night (FNC)')).toContain('Tap Save to Drive again')
  })
})

describe('end-of-game Save to Drive panel', () => {
  it('shows one Save to Drive tap and keeps Clear locked', () => {
    const model = driveSavePanelModel({
      save: { status: 'idle' },
      connected: false,
      target: alstonville,
    })
    expect(model.heading).toBe('Game over — save the scorecard')
    expect(model.primaryLabel).toBe('Save to Drive')
    expect(model.primaryDisabled).toBe(false)
    expect(model.clearEnabled).toBe(false)
    expect(model.tone).toBe('idle')
    expect(model.folderLine).toContain('Alstonville under Mon night (FNC)')
    expect(model.accountLine).toContain('tyrone.mcgillick@gmail.com')
    expect(model.folderNote).toContain('Mon night')
    expect(model.detail.toLowerCase()).not.toContain('auto-saving')
  })

  it('shows Saving, then Saved with Clear unlocked, and Retry after a failure', () => {
    const saving = driveSavePanelModel({
      save: { status: 'saving' },
      email: 'tyrone.mcgillick@gmail.com',
      connected: true,
      target: alstonville,
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
        accountEmail: 'tyrone.mcgillick@gmail.com',
        folderLabel: 'Alstonville under Mon night (FNC)',
        folderUrl: DEFAULT_DRIVE_FOLDER_URL,
      },
      email: 'tyrone.mcgillick@gmail.com',
      connected: true,
      target: alstonville,
    })
    expect(saved.tone).toBe('saved')
    expect(saved.clearEnabled).toBe(true)
    expect(saved.showSaveAgain).toBe(true)
    expect(saved.primaryLabel).toBeNull()
    expect(saved.logUrl).toContain('/log/')

    const failed = driveSavePanelModel({
      save: { status: 'error', error: 'Signed in, but no.' },
      connected: true,
      email: 'tyrone.mcgillick@gmail.com',
      target: alstonville,
    })
    expect(failed.tone).toBe('error')
    expect(failed.primaryLabel).toBe('Retry save')
    expect(failed.clearEnabled).toBe(false)
    expect(failed.showSkipClear).toBe(true)
    expect(failed.detail).toBe('Signed in, but no.')
  })
})
