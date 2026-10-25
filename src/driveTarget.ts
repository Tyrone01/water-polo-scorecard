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

/** FNC pool for this game. Match venue wins over ?venue=. Unknown stays null. */
export function poolForVenueHint(hint?: DriveVenueHint): FncBoardVenueId | null {
  if (hint?.boardVenueId || hint?.venue) {
    const id = boardIdForMatch({ venue: hint.venue || '', boardVenueId: hint.boardVenueId })
    if (isFncBoardVenueId(id)) return id
  }
  if (hint?.venueQuery) return poolFromText(hint.venueQuery)
  return null
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

/**
 * Where this tablet's CSVs go.
 * A Setup folder that is not the baked Alstonville default (and not the retired
 * AJWP POC id) wins. Otherwise Save uses the game's pool under Mon night.
 * No pool match falls back to Alstonville.
 */
export function resolveDriveTarget(
  admin: { driveFolderUrl?: string; driveFolderId?: string },
  hint?: DriveVenueHint,
): DriveTarget {
  const fromUrl = parseDriveFolderId(admin.driveFolderUrl || '')
  const storedId = admin.driveFolderId && isDriveFolderId(admin.driveFolderId) ? admin.driveFolderId.trim() : ''
  const explicit = fromUrl || storedId
  const custom = !!explicit && explicit !== DEFAULT_DRIVE_FOLDER_ID && explicit !== RETIRED_AJWP_POC_FOLDER_ID
  if (custom && explicit) {
    const rawUrl = (admin.driveFolderUrl || '').trim()
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
