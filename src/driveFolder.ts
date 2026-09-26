const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/

export function isDriveFolderId(id: string): boolean {
  return DRIVE_ID_RE.test(id.trim())
}

/** Parse a Drive folder id from `/folders/FILEID` or a bare id. */
export function parseDriveFolderId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const fromFolders = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (fromFolders && isDriveFolderId(fromFolders[1])) return fromFolders[1]
  if (isDriveFolderId(raw) && !raw.includes('/') && !/\s/.test(raw)) return raw
  return null
}

