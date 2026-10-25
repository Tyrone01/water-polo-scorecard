import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoMatch } from './demo'
import { STORAGE_KEY } from './types'

const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}`
const CDP_PORT = 9333

/**
 * Real browser check: the served manifest must not lock landscape, and the
 * live scorer must fit a portrait phone without a rotate trick. Wide screens
 * and the TV board keep the layout they already had.
 */
describe('portrait scorer', () => {
  let vite: ChildProcess | null = null
  let chrome: ChildProcess | null = null
  let ws: WebSocket | null = null
  let sessionId = ''
  let send: (method: string, params?: Record<string, unknown>, session?: string) => Promise<any>

  beforeAll(async () => {
    vite = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Keep this test off the live pool TVs. Empty origin posts to this Vite server only.
          VITE_PUBLIC_BOARD_ORIGIN: '',
          BOARD_WRITE_OPEN: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      },
    )
    await waitForText(vite, /Local:/, 20000)

    chrome = spawn(
      'google-chrome',
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=/tmp/chrome-portrait-test-${process.pid}`,
        '--window-size=390,844',
        'about:blank',
      ],
      { stdio: 'ignore', detached: true },
    )
    let version: { webSocketDebuggerUrl: string } | null = null
    for (let i = 0; i < 50; i++) {
      try {
        version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json())
        break
      } catch {
        await delay(100)
      }
    }
    if (!version) throw new Error('Chrome did not open a debug port')
    ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws!.addEventListener('open', () => resolve())
      ws!.addEventListener('error', () => reject(new Error('Chrome socket failed')))
    })
    let next = 0
    const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data))
      if (!msg.id || !pending.has(msg.id)) return
      const waiter = pending.get(msg.id)!
      pending.delete(msg.id)
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)))
      else waiter.resolve(msg.result)
    })
    send = (method, params = {}, session) => {
      const id = ++next
      const payload: Record<string, unknown> = { id, method, params }
      if (session) payload.sessionId = session
      ws!.send(JSON.stringify(payload))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const attached = await send('Target.attachToTarget', { targetId, flatten: true })
    sessionId = attached.sessionId
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__orientLocks = [];
        window.__apiCalls = [];
        try {
          const orient = screen.orientation;
          if (orient && typeof orient.lock === 'function') {
            orient.lock = function (value) {
              window.__orientLocks.push(String(value));
              return Promise.resolve();
            };
          }
        } catch (err) {}
        const orig = window.fetch.bind(window);
        window.fetch = function (input, init) {
          try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (String(url).includes('/api/')) window.__apiCalls.push(String(url));
          } catch (err) {}
          return orig(input, init);
        };
      })();`,
    }, sessionId)
  }, 40000)

  afterAll(async () => {
    try { ws?.close() } catch { /* already closed */ }
    if (chrome?.pid) {
      try { process.kill(-chrome.pid, 'SIGKILL') } catch { chrome.kill('SIGKILL') }
    }
    if (vite?.pid) {
      try { process.kill(-vite.pid, 'SIGKILL') } catch { vite.kill('SIGKILL') }
    }
  })

  it('does not lock landscape, and the scorer fits 360, 390, and 1280', async () => {
    const fileManifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
    expect(fileManifest.orientation, 'manifest must not force an orientation').toBeUndefined()
    expect(JSON.stringify(fileManifest)).not.toMatch(/landscape|portrait/)

    const served = await fetch(`${BASE}/manifest.webmanifest`).then((r) => r.json())
    expect(served.orientation).toBeUndefined()

    const prestart = {
      ...demoMatch(),
      id: 'portrait-prestart',
      started: true,
      boardVenueId: 'portraitcheck',
    }
    await openMatch(360, 780, prestart)
    const at360 = await layoutFacts()
    expect(at360.portrait, '360px viewport stays portrait').toBe(true)
    expect(at360.transformed).toBe(false)
    expect(at360.orientLocks).toEqual([])
    assertScorerFits(at360, 360)
    await saveShot('scorer_portrait_360')

    await evalJson(`(() => {
      window.__mut = 0
      const root = document.getElementById('root')
      if (!root) return
      const obs = new MutationObserver(() => { window.__mut++ })
      obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
    })()`)
    const idleBefore = at360.apiCalls
    await delay(2000)
    const idle = await evalJson<{ api: number; mut: number }>('({ api: (window.__apiCalls || []).length, mut: window.__mut || 0 })')
    const idleNew = idle.api - idleBefore
    console.log(`portrait idle 2s: apiCalls=${idleNew} mutations=${idle.mut}`)
    expect(idleNew, `idle scorer made ${idleNew} extra /api/ calls`).toBeLessThanOrEqual(1)
    expect(idle.mut, `idle scorer mutated the DOM ${idle.mut} times`).toBeLessThanOrEqual(4)

    await openMatch(390, 844, prestart)
    const at390 = await layoutFacts()
    expect(at390.portrait).toBe(true)
    expect(at390.transformed).toBe(false)
    assertScorerFits(at390, 390)
    const clicked = await evalJson<{ sel: string; inside: boolean; tag: string }>(`(() => {
      const btn = document.querySelector('button.prestart-cap');
      if (!(btn instanceof HTMLElement)) return { sel: '', inside: false, tag: 'missing' };
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const sel = document.querySelector('.sel');
      const r = sel ? sel.getBoundingClientRect() : null;
      return {
        tag: btn.tagName,
        sel: sel ? (sel.textContent || '').trim() : '',
        inside: !!r && r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
      };
    })()`)
    if (!/WHITE|BLUE/.test(clicked.sel)) await delay(50)
    const clickedNow = /WHITE|BLUE/.test(clicked.sel)
      ? clicked
      : await evalJson<{ sel: string; inside: boolean; tag: string }>(`(() => {
          const sel = document.querySelector('.sel');
          const r = sel ? sel.getBoundingClientRect() : null;
          return {
            tag: 'reread',
            sel: sel ? (sel.textContent || '').trim() : '',
            inside: !!r && r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1,
          };
        })()`)
    expect(clickedNow.sel).toMatch(/WHITE|BLUE/)
    expect(clickedNow.sel).not.toMatch(/Tap a player/)
    expect(clickedNow.inside, 'player selector stays on screen after a tap').toBe(true)
    await saveShot('scorer_portrait_390')

    const playing = {
      ...demoMatch(),
      id: 'portrait-playing',
      started: true,
      clockStarted: true,
      boardVenueId: 'portraitcheck',
    }
    await openMatch(360, 780, playing)
    const roster = await layoutFacts()
    expect(roster.prestart).toBe(false)
    expect(roster.rosterRows).toBeGreaterThan(8)
    assertScorerFits(roster, 360)
    expect(roster.tableOverflow, 'in-game roster table spills sideways').toBe(false)
    expect(roster.nameCuts, 'in-game names are cut off').toBe(0)
    await saveShot('scorer_playing_360')

    await openMatch(1280, 800, prestart)
    const wide = await layoutFacts()
    expect(wide.portrait).toBe(false)
    expect(wide.mainColumns).toBe(2)
    expect(wide.railDirection).toBe('column')
    expect(wide.codeCount).toBe(8)
    expect(wide.codesOffScreen).toBe(0)
    expect(wide.pageOverflowX).toBe(false)
    expect(wide.transformed).toBe(false)
    await saveShot('scorer_wide_1280')

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)
    const boardApi = await fetch(`${BASE}/api/board/portraitcheck`)
    const boardApiBody = await boardApi.text()
    expect(boardApi.status, boardApiBody.slice(0, 300)).toBe(200)
    await send('Page.navigate', { url: `${BASE}/board/portraitcheck` }, sessionId)
    await waitFor(`document.querySelector('.board-main')`)
    const board = await evalJson<{
      columns: string
      overflow: boolean
      width: number
    }>(`(() => {
      const main = document.querySelector('.board-main');
      const cols = main ? getComputedStyle(main).gridTemplateColumns : '';
      return {
        columns: cols,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        width: window.innerWidth,
      };
    })()`)
    expect(board.width).toBe(1280)
    expect(board.overflow, 'TV board overflows at 1280').toBe(false)
    const tracks = board.columns.split(' ').filter(Boolean)
    expect(tracks.length, `TV board columns: ${board.columns}`).toBe(3)
    await saveShot('tv_board_1280')
  }, 90000)

  async function openMatch(width: number, height: number, match: ReturnType<typeof demoMatch>) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    }, sessionId)
    await send('Page.navigate', { url: `${BASE}/` }, sessionId)
    await waitFor(`document.body`)
    await evalJson(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(match))})`)
    await send('Page.reload', { ignoreCache: true }, sessionId)
    await waitFor(`document.querySelector('.scoring-layout')`)
    await delay(250)
  }

  async function layoutFacts() {
    return evalJson<{
      portrait: boolean
      transformed: boolean
      orientLocks: string[]
      apiCalls: number
      pageOverflowX: boolean
      mainColumns: number
      railDirection: string
      codeCount: number
      codesOffScreen: number
      codeTextClip: number
      prestart: boolean
      rosterRows: number
      tableOverflow: boolean
      nameCuts: number
      clocksInside: boolean
      selInside: boolean
    }>(`(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const inside = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
      };
      const codes = [...document.querySelectorAll('.code-btn')];
      const main = document.querySelector('.scoring-main');
      const rail = document.querySelector('.scoring-rail');
      const bodyT = getComputedStyle(document.body).transform;
      const htmlT = getComputedStyle(document.documentElement).transform;
      const plain = (t) => !t || t === 'none';
      let tableOverflow = false;
      document.querySelectorAll('.teams-duo .team-panel').forEach((panel) => {
        const table = panel.querySelector('table');
        if (table && table.scrollWidth > panel.clientWidth + 2) tableOverflow = true;
      });
      return {
        portrait: matchMedia('(orientation: portrait)').matches && vh > vw,
        transformed: !(plain(bodyT) && plain(htmlT)),
        orientLocks: window.__orientLocks || [],
        apiCalls: (window.__apiCalls || []).length,
        pageOverflowX: document.documentElement.scrollWidth > vw + 1,
        mainColumns: main ? getComputedStyle(main).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        railDirection: rail ? getComputedStyle(rail).flexDirection : '',
        codeCount: codes.length,
        codesOffScreen: codes.filter((el) => !inside(el)).length,
        codeTextClip: codes.filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2).length,
        prestart: !!document.querySelector('.prestart'),
        rosterRows: document.querySelectorAll('.prestart-cap, .team-table tbody tr').length,
        tableOverflow,
        nameCuts: [...document.querySelectorAll('.name-static, .prestart-name')].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
        clocksInside: inside(document.querySelector('.clock.game-rail')) && inside(document.querySelector('.clock.rail-shot-digits')),
        selInside: inside(document.querySelector('.sel')),
      };
    })()`)
  }

  function assertScorerFits(facts: Awaited<ReturnType<typeof layoutFacts>>, width: number) {
    expect(facts.pageOverflowX, `${width}px page scrolls sideways`).toBe(false)
    expect(facts.mainColumns, `${width}px scorer should stack`).toBe(1)
    expect(facts.railDirection).toBe('row')
    expect(facts.codeCount).toBe(8)
    expect(facts.codesOffScreen, `${facts.codesOffScreen} code buttons off screen at ${width}`).toBe(0)
    expect(facts.codeTextClip, `code label clipped at ${width}`).toBe(0)
    expect(facts.clocksInside, `clocks cut off at ${width}`).toBe(true)
    expect(facts.selInside, `player line cut off at ${width}`).toBe(true)
    expect(facts.rosterRows).toBeGreaterThan(8)
    expect(facts.orientLocks).toEqual([])
  }

  async function saveShot(name: string) {
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
    const buf = Buffer.from(shot.data, 'base64')
    const dir = '/opt/cursor/artifacts/screenshots'
    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/${name}.png`, buf)
  }

  function evalJson<T>(expression: string): Promise<T> {
    return send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    }, sessionId).then((result) => {
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value as T
    })
  }

  async function waitFor(expression: string) {
    const start = Date.now()
    while (Date.now() - start < 8000) {
      const ok = await evalJson<boolean>(`Boolean(${expression})`)
      if (ok) return
      await delay(80)
    }
    throw new Error(`Timed out waiting for ${expression}`)
  }
})

function waitForText(child: ChildProcess, pattern: RegExp, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`Vite did not start:\n${buf}`)), ms)
    const onData = (chunk: Buffer) => {
      buf += chunk.toString()
      if (pattern.test(buf)) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Vite exited ${code}:\n${buf}`))
    })
  })
}
