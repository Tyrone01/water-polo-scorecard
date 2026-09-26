import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleBoardRequest } from './server/boardApi'
import { handleDriveUploadRequest } from './server/driveUpload'
import { handleRevSportRequest } from './server/revsportProxy'

async function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method !== 'POST' && req.method !== 'PUT') return undefined
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', resolve)
    req.on('error', reject)
  })
  return new Uint8Array(Buffer.concat(chunks))
}

function nodeToRequest(req: IncomingMessage, fullUrl: string, body?: Uint8Array): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else headers.set(key, value)
  }
  const method = req.method || 'GET'
  return new Request(fullUrl, {
    method,
    headers,
    body: body && (method === 'POST' || method === 'PUT') ? body : undefined,
  })
}

async function writeFetchResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((v, k) => {
    res.setHeader(k, v)
  })
  res.end(Buffer.from(await response.arrayBuffer()))
}

function apiProxy(): Plugin {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const rawUrl = req.url || ''
    const pathOnly = rawUrl.split('?')[0]
    if (pathOnly === '/api/drive/upload') {
      const body = await readBody(req)
      const request = nodeToRequest(req, 'http://vite.local/api/drive/upload', body)
      await writeFetchResponse(res, await handleDriveUploadRequest(request))
      return
    }
    if (pathOnly.startsWith('/api/board/')) {
      const body = await readBody(req)
      const request = nodeToRequest(req, 'http://vite.local' + rawUrl, body)
      const response = await handleBoardRequest(request)
      if (!response) {
        next()
        return
      }
      await writeFetchResponse(res, response)
      return
    }
    if (pathOnly !== '/api/revsport') {
      next()
      return
    }
    const request = nodeToRequest(req, 'http://vite.local' + rawUrl)
    await writeFetchResponse(res, await handleRevSportRequest(request))
    return
  }
  const attach = (server: ViteDevServer) => {
    server.middlewares.use(middleware)
  }
  return {
    name: 'revsport-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default defineConfig({
  plugins: [react(), apiProxy()],
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
