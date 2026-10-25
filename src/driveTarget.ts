import { boardIdForMatch, isFncBoardVenueId, type FncBoardVenueId } from './boardPublish'
import { isDriveFolderId, parseDriveFolderId } from './driveFolder'
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_LABEL,
  MON_NIGHT_POOL_FOLDER_IDS,
  RETIRED_AJWP_POC_FOLDER_ID,
} from './types'

export interface DriveTarget {
  folderId: string
  folderUrl: string
  label: string
  isDefault: boolean
}

/** Game venue, explicit pool id, or the ?venue= query. Custom Setup folder is separate. */
export interface DriveVenueHint {
  venue?: string
  boardVenueId?: string
  venueQuery?: string | null
}

const POOL_LABEL: Record<FncBoardVenueId, string> = {
  alstonville: DEFAULT_DRIVE_FOLDER_LABEL,
  ballina: 'Ballina under Mon night (FNC)',
  lismore: 'Lismore under Mon night (FNC)',
  mullumbimby: 'Mullumbimby under Mon night (FNC)',
}

function folderUrlFor(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`
}

function poolFromText(raw: string): FncBoardVenueId | null {
  const text = raw.trim()
  if (!text) return null
  const lower = text.toLowerCase()
  if (isFncBoardVenueId(lower)) return lower
  const id = boardIdForMatch({ venue: text })
  return isFncBoardVenueId(id) ? id : null
}

/**
 * FNC pool for this game.
 * The pool the official picked for tonight wins over the fixture venue text:
 * `boardVenueId`, then `?venue=` / Tonight at venue, then the venue string.
 * Unknown stays null (caller falls back to Alstonville).
 */
export function poolForVenueHint(hint?: DriveVenueHint): FncBoardVenueId | null {
  const picked = poolFromText(hint?.boardVenueId || '')
  if (picked) return picked
  const fromQuery = poolFromText(hint?.venueQuery || '')
  if (fromQuery) return fromQuery
  return poolFromText(hint?.venue || '')
}

/** Write the pool picked tonight onto the match. A real FNC pool replaces a stale one. */
export function withNightPool<T extends { boardVenueId?: string }>(match: T, picked?: string | null): T {
  const pool = poolForVenueHint({ boardVenueId: picked || undefined })
  if (!pool || match.boardVenueId === pool) return match
  return { ...match, boardVenueId: pool }
}

/**
 * Keep a pool already picked tonight. If the match has none, take `picked`
 * (`?venue=` or Tonight at venue). A fixture venue string is not a pick.
 */
export function retainNightPool<T extends { boardVenueId?: string }>(match: T, picked?: string | null): T {
  if (poolForVenueHint({ boardVenueId: match.boardVenueId })) return match
  return withNightPool(match, picked)
}

export function venueHintFor(
  match: { venue?: string; boardVenueId?: string },
  search?: string,
): DriveVenueHint {
  const qs = search ?? (typeof location !== 'undefined' ? location.search : '')
  return {
    venue: match.venue,
    boardVenueId: match.boardVenueId,
    venueQuery: new URLSearchParams(qs || '').get('venue'),
  }
}

function builtInTarget(pool: FncBoardVenueId | null): DriveTarget {
  const id = pool ?? 'alstonville'
  const folderId = MON_NIGHT_POOL_FOLDER_IDS[id]
  return {
    folderId,
    folderUrl: folderUrlFor(folderId),
    label: POOL_LABEL[id],
    isDefault: true,
  }
}

type DriveAdminFolder = { driveFolderUrl?: string; driveFolderId?: string }

function explicitFolderId(admin: DriveAdminFolder): string {
  const fromUrl = parseDriveFolderId(admin.driveFolderUrl || '')
  const storedId = admin.driveFolderId && isDriveFolderId(admin.driveFolderId) ? admin.driveFolderId.trim() : ''
  return fromUrl || storedId || ''
}

/** A pasted folder that is not the baked Alstonville default and not the retired AJWP id. */
export function isCustomDriveFolder(admin: DriveAdminFolder): boolean {
  const explicit = explicitFolderId(admin)
  return !!explicit && explicit !== DEFAULT_DRIVE_FOLDER_ID && explicit !== RETIRED_AJWP_POC_FOLDER_ID
}

/**
 * Where this tablet's CSVs go.
 * A Setup folder that is not the baked Alstonville default (and not the retired
 * AJWP POC id) wins. Otherwise Save uses the pool picked for tonight, then the
 * fixture venue. No pool match falls back to Alstonville.
 */
export function resolveDriveTarget(admin: DriveAdminFolder, hint?: DriveVenueHint): DriveTarget {
  if (isCustomDriveFolder(admin)) {
    const explicit = explicitFolderId(admin)
    const rawUrl = (admin.driveFolderUrl || '').trim()
    const fromUrl = parseDriveFolderId(rawUrl)
    const folderUrl = rawUrl.startsWith('http') && fromUrl ? rawUrl : folderUrlFor(explicit)
    return {
      folderId: explicit,
      folderUrl,
      label: 'Custom club folder',
      isDefault: false,
    }
  }
  return builtInTarget(poolForVenueHint(hint))
}

/**
 * Value for the Setup folder box.
 * A custom paste is shown as typed. The baked Alstonville URL is not a choice —
 * show the night's pool folder so the box matches the Folder line.
 */
export function driveFolderFieldValue(admin: DriveAdminFolder, target: DriveTarget): string {
  if (isCustomDriveFolder(admin)) {
    const raw = (admin.driveFolderUrl || '').trim()
    return raw || target.folderUrl
  }
  return target.folderUrl
}
