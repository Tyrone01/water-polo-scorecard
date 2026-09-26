import { handleBoardRequest } from './server/boardApi'
import { handleDriveUploadRequest } from './server/driveUpload'
import { handleRevSportRequest } from './server/revsportProxy'

export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/drive/upload') {
      return handleDriveUploadRequest(request)
    }
    const board = await handleBoardRequest(request)
    if (board) return board
    if (url.pathname === '/api/revsport') {
      return handleRevSportRequest(request)
    }
    return env.ASSETS.fetch(request)
  },
}
