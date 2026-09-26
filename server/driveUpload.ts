import { isDriveFolderId } from '../src/driveFolder'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

type UploadFile = { name?: unknown; content?: unknown; mimeType?: unknown }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function safeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim()
  return (base || 'scorecard.csv').slice(0, 180)
}

function driveMessage(payload: Record<string, unknown>, fallback: string): string {
  const err = payload.error
  if (err && typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  return fallback
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { error: 'Drive returned a non-JSON response' }
  }
}

async function uploadAndVerify(
  accessToken: string,
  folderId: string,
  file: { name: string; content: string; mimeType: string },
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const mimeType = file.mimeType || 'text/csv'
  const name = safeFilename(file.name)
  const boundary = 'wpq_boundary_' + Math.random().toString(36).slice(2)
  const metadata = JSON.stringify({
    name,
    parents: [folderId],
    mimeType,
  })
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${file.content}\r\n` +
    `--${boundary}--`

  const upload = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )
  const uploaded = await readJson(upload)
  if (!upload.ok || typeof uploaded.id !== 'string') {
    throw new Error(driveMessage(uploaded, 'Drive upload failed'))
  }

  const verify = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}?fields=id,name,webViewLink,md5Checksum&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const meta = await readJson(verify)
  if (!verify.ok || typeof meta.id !== 'string') {
    throw new Error(driveMessage(meta, 'Drive could not verify the uploaded file'))
  }
  return {
    id: meta.id,
    name: typeof meta.name === 'string' ? meta.name : name,
    webViewLink: typeof meta.webViewLink === 'string' ? meta.webViewLink : undefined,
  }
}

export async function handleDriveUploadRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only' })
  }

  let parsed: {
    accessToken?: unknown
    folderId?: unknown
    files?: unknown
  }
  try {
    parsed = (await request.json()) as typeof parsed
  } catch {
    return json(400, { error: 'JSON body required' })
  }

  const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken.trim() : ''
  const folderId = typeof parsed.folderId === 'string' ? parsed.folderId.trim() : ''
  if (!accessToken) return json(401, { error: 'Missing access token' })
  if (!isDriveFolderId(folderId)) return json(400, { error: 'Invalid Drive folder id' })
  if (!Array.isArray(parsed.files) || parsed.files.length < 2) {
    return json(400, { error: 'Two CSV files are required' })
  }

  const files: { name: string; content: string; mimeType: string }[] = []
  for (const raw of parsed.files as UploadFile[]) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.content !== 'string') {
      return json(400, { error: 'Each file needs name and content' })
    }
    files.push({
      name: raw.name,
      content: raw.content,
      mimeType: typeof raw.mimeType === 'string' && raw.mimeType.trim() ? raw.mimeType : 'text/csv',
    })
  }

  try {
    const uploaded = []
    for (const file of files) {
      uploaded.push(await uploadAndVerify(accessToken, folderId, file))
    }
    if (uploaded.length < 2 || uploaded.some((f) => !f.id)) {
      return json(502, { error: 'Drive did not verify both CSV files' })
    }
    return json(200, { files: uploaded })
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : 'Drive upload failed' })
  }
}
