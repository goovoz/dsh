// 零依赖反代：浏览器只认 cookie；没有 cookie 就拿 launch token 让 DSH 自己铸一个
//
// Host 策略（PUBLIC_HOST 不再必填）：
//   上游 Host 统一改写为 INTERNAL_AUTHORITY（默认 dsh.internal），DSH 的 Host 围栏与
//   cookie authority 因此始终稳定；浏览器用任意地址访问都能用，来访 Host 记在 x-forwarded-host。
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'

const BACKEND = { host: '127.0.0.1', port: Number(process.env.DSH_WEB_PORT ?? 3080) }
const LISTEN = Number(process.env.DSH_GATEWAY_PORT ?? 8899)
const TOKEN_FILE = '/run/dsh/launch-token'
const AUTHORITY = (process.env.INTERNAL_AUTHORITY ?? process.env.PUBLIC_HOST ?? '').trim()

// 这些路径未登录时也直接透传（DSH 自己决定 401 还是公开静态）
const PASS_PREFIX = ['/assets/', '/plugins/', '/api/', '/favicon']
let firstHostReported = false

function launchToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' }
}

function rewriteHost(headers) {
  if (!AUTHORITY || !headers.host || headers.host === AUTHORITY) return headers
  headers['x-forwarded-host'] = headers.host
  headers.host = AUTHORITY
  return headers
}

const server = http.createServer((req, res) => {
  const incomingHost = req.headers.host ?? ''
  if (!firstHostReported && incomingHost) {
    firstHostReported = true
    console.log(`[gateway] 首次请求 Host=${incomingHost}`
      + (AUTHORITY && incomingHost !== AUTHORITY ? `（上游改写为 ${AUTHORITY}）` : ''))
  }

  const token = launchToken()
  const cookie = req.headers.cookie ?? ''
  const authed = /(^|;\s*)dsh-auth-/.test(cookie)
  let url
  try { url = new URL(req.url ?? '/', 'http://gateway.invalid') } catch { url = null }

  if (token && !authed && url && !url.searchParams.has('token')
      && !PASS_PREFIX.some(p => (url.pathname + '/').startsWith(p))) {
    res.writeHead(302, { location: '/?token=' + token, 'cache-control': 'no-store' })
    return res.end()
  }

  const upstream = http.request({
    host: BACKEND.host, port: BACKEND.port, method: req.method,
    path: req.url, headers: rewriteHost({ ...req.headers }),
  }, up => {
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
    + (AUTHORITY ? ` | 上游 Host 规整为 ${AUTHORITY}（浏览器用任意地址访问均可）` : ' | 原样透传 Host'))
})
