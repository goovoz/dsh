// 零依赖反代：浏览器只认 cookie；没有（或不是当前 authority 的）cookie 就拿 launch token 重新铸一个
//
// 两个关键点：
//   1) 上游 Host 统一改写为 INTERNAL_AUTHORITY（默认 dsh.internal），DSH 的 Host 围栏与 cookie authority 因此稳定；
//   2) 只有「名字对得上当前 authority」的 cookie 才算已登录 —— 旧部署留下的 dsh-auth-<旧哈希> 会被忽略并重新铸 cookie，
//      否则浏览器会一直卡在 401「authentication required」。
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const BACKEND = { host: '127.0.0.1', port: Number(process.env.DSH_WEB_PORT ?? 3080) }
const LISTEN = Number(process.env.DSH_GATEWAY_PORT ?? 8899)
const TOKEN_FILE = '/run/dsh/launch-token'
const AUTHORITY = (process.env.INTERNAL_AUTHORITY ?? process.env.PUBLIC_HOST ?? '').trim()
const RETRY_COOKIE = 'dsh-gw-retry'

// DSH 的 cookie 名 = dsh-auth-<base64url(sha256(authority))>，与 packages/client/connection 的实现一致
const COOKIE_NAME = AUTHORITY
  ? 'dsh-auth-' + Buffer.from(createHash('sha256').update(AUTHORITY).digest()).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
  : null

const PASS_PREFIX = ['/assets/', '/plugins/', '/api/', '/favicon']
let firstHostReported = false

function launchToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' }
}

function hasSessionCookie(req) {
  const header = req.headers.cookie ?? ''
  if (!COOKIE_NAME) return /(^|;\s*)dsh-auth-/.test(header)
  return new RegExp('(^|;\\s*)' + COOKIE_NAME + '=').test(header)
}

function recentRetry(req) {
  return new RegExp('(^|;\\s*)' + RETRY_COOKIE + '=').test(req.headers.cookie ?? '')
}

// DSH 的 API 围栏不只看 Host，还看 Origin/Referer：三者都要换成本地 authority，
// 否则浏览器发的 /api 请求会 403（插件激活失败、WebSocket 握手失败都是这个原因）。
function rewriteHost(headers) {
  if (!AUTHORITY) return headers
  if (headers.host && headers.host !== AUTHORITY) {
    headers['x-forwarded-host'] = headers.host
    headers.host = AUTHORITY
  }
  const origin = headers.origin
  if (origin && origin !== AUTHORITY) {
    headers['x-forwarded-origin'] = origin
    try {
      const parsed = new URL(origin)
      headers.origin = parsed.protocol + '//' + AUTHORITY
    } catch {}
  }
  const referer = headers.referer
  if (referer) {
    try {
      const parsed = new URL(referer)
      headers['x-forwarded-referer'] = referer
      headers.referer = parsed.protocol + '//' + AUTHORITY + parsed.pathname + parsed.search
    } catch {}
  }
  return headers
}

function redirectToToken(res) {
  const token = launchToken()
  if (!token) return false
  res.writeHead(302, {
    location: '/?token=' + token,
    'cache-control': 'no-store',
    'set-cookie': RETRY_COOKIE + '=1; Path=/; Max-Age=30; HttpOnly; SameSite=Lax',
  })
  res.end()
  return true
}

const server = http.createServer((req, res) => {
  const incomingHost = req.headers.host ?? ''
  if (!firstHostReported && incomingHost) {
    firstHostReported = true
    console.log(`[gateway] 首次请求 Host=${incomingHost}`
      + (AUTHORITY && incomingHost !== AUTHORITY ? `（上游改写为 ${AUTHORITY}）` : ''))
  }

  let url
  try { url = new URL(req.url ?? '/', 'http://gateway.invalid') } catch { url = null }
  const isPage = url !== null && !PASS_PREFIX.some(p => (url.pathname + '/').startsWith(p))
  const hasToken = url !== null && url.searchParams.has('token')

  if (isPage && !hasToken && !hasSessionCookie(req) && redirectToToken(res)) return

  const upstream = http.request({
    host: BACKEND.host, port: BACKEND.port, method: req.method,
    path: req.url, headers: rewriteHost({ ...req.headers }),
  }, up => {
    const unauthorised = up.statusCode === 401
    if (unauthorised && isPage && !hasToken && !recentRetry(req) && redirectToToken(res)) {
      up.resume()
      return
    }
    res.writeHead(up.statusCode ?? 502, up.headers)
    up.pipe(res)
  })
  upstream.on('error', err => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('backend unavailable: ' + err.message + '\n')
  })
  req.pipe(upstream)
})

server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(BACKEND.port, BACKEND.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i]
      let value = req.rawHeaders[i + 1]
      if (AUTHORITY && /^host$/i.test(name)) value = AUTHORITY
      if (AUTHORITY && /^origin$/i.test(name)) {
        try { value = new URL(value).protocol + '//' + AUTHORITY } catch {}
      }
      if (AUTHORITY && /^referer$/i.test(name)) {
        try { const u = new URL(value); value = u.protocol + '//' + AUTHORITY + u.pathname + u.search } catch {}
      }
      lines.push(`${name}: ${value}`)
    }
    upstream.write(lines.join('\r\n') + '\r\n\r\n')
    if (head?.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`[gateway] http://0.0.0.0:${LISTEN} -> ${BACKEND.host}:${BACKEND.port}`
    + (AUTHORITY ? ` | 上游 Host 规整为 ${AUTHORITY} | 期望 cookie ${COOKIE_NAME}` : ' | 原样透传 Host'))
})
