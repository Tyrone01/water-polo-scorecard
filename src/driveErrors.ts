import { BAKED_OAUTH_ORIGINS, OAUTH_STABLE_ORIGIN } from './googleOrigins'
import { CLUB_GOOGLE_ACCOUNT } from './types'

export function missingClientMessage(): string {
  return 'Google sign-in is not set up on this tablet. The scorecard should already have the club sign-in — ask Tyrone.'
}

export function blockedOriginMessage(): string {
  return `This page address is not allowed to sign in to Google. Open ${OAUTH_STABLE_ORIGIN} or https://water-polo-scorecard.tyrone-mcgillick.workers.dev and tap Save to Drive there.`
}

export function bakedOriginList(): string {
  return BAKED_OAUTH_ORIGINS.join(', ')
}

/** Poolside wording. Technical Google errors stay out of the banner. */
export function plainDriveError(raw: string, folderLabel: string): string {
  const msg = raw.trim() || 'Drive save failed'
  if (/failed to fetch|networkerror|network request failed|load failed|timeout/i.test(msg)) {
    return "Couldn't reach Google. Check the tablet's internet and tap Retry."
  }
  if (/origin_mismatch|redirect_uri_mismatch|idpiframe_initialization_failed|not a valid origin/i.test(msg)) {
    return blockedOriginMessage()
  }
  if (/access_denied|access blocked|unverified|not completed the google verification|org_internal/i.test(msg)) {
    return `Google blocked sign-in. This app is in External testing, so only a listed test user can continue. Sign in as ${CLUB_GOOGLE_ACCOUNT}. That personal Gmail is the checklist account until an FNC Google tenant exists.`
  }
  if (/popup_closed|popup_failed|cancelled|canceled|closed the popup/i.test(msg)) {
    return 'Google sign-in was closed. Tap Save to Drive again and finish the Google window.'
  }
  if (/did not open|popup blocker|allow popups/i.test(msg)) {
    return 'The Google window did not open. Allow popups for this site, then tap Save to Drive again.'
  }
  if (/file not found|notfound|insufficient permissions|insufficientfilepermissions|appnotauthorizedtofile|the user does not have sufficient permissions/i.test(msg)) {
    return `Signed in, but this Google account could not add files to ${folderLabel}. Share that folder with ${CLUB_GOOGLE_ACCOUNT} as Editor, then tap Retry. With no custom folder, Mon night saves use the pool folder on this personal Drive until an FNC Google tenant exists. This sign-in can only see files the app is allowed to use (drive.file), so an existing folder can look missing.`
  }
  if (/failed to load google identity|is not loaded/i.test(msg)) {
    return "Google sign-in didn't load. Check the tablet's internet and tap Save to Drive again."
  }
  return msg
}
