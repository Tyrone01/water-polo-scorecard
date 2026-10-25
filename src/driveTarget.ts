import { isDriveFolderId, parseDriveFolderId } from './driveFolder'
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_LABEL,
  DEFAULT_DRIVE_FOLDER_URL,
} from './types'

export interface DriveTarget {
  folderId: string
  folderUrl: string
  label: string
  isDefault: boolean
}

/** Club folder for this tablet. Junk or blank settings fall back to the AJWP POC folder. */
export function resolveDriveTarget(admin: { driveFolderUrl?: string; driveFolderId?: string }): DriveTarget {
  const fromUrl = parseDriveFolderId(admin.driveFolderUrl || '')
  const storedId = admin.driveFolderId && isDriveFolderId(admin.driveFolderId) ? admin.driveFolderId.trim() : ''
  const folderId = fromUrl || storedId || DEFAULT_DRIVE_FOLDER_ID
  const isDefault = folderId === DEFAULT_DRIVE_FOLDER_ID
  const rawUrl = (admin.driveFolderUrl || '').trim()
  const folderUrl = isDefault
    ? DEFAULT_DRIVE_FOLDER_URL
    : rawUrl.startsWith('http') && fromUrl
      ? rawUrl
      : `https://drive.google.com/drive/folders/${folderId}`
  return {
    folderId,
    folderUrl,
    label: isDefault ? DEFAULT_DRIVE_FOLDER_LABEL : 'Custom club folder',
    isDefault,
  }
}
