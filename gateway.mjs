// 零依赖反代：浏览器只认 cookie；没有 cookie 就拿 launch token 让 DSH 自己铸一个
// 关键点：把上游 Host 规整为 PUBLIC_HOST，使 DSH 的 Host 围栏与 cookie authority 始终对得上，
//        这样即使使用者忘了把 PUBLIC_HOST 设成对外地址，从别的机器访问也不会 403。
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'

const BACKEND = { host: '127.0.0.1', port: Number(process.env.DSH_WEB_PORT ?? 3080) }
const LISTEN = Number(process.env.DSH_GATEWAY_PORT ?? 8899)
const TOKEN_FILE = '/run/dsh/launch-token'
const PUBLIC_HOST = (process.env.PUBLIC_HOST ?? '').trim()

// 这些路径未登录时也直接透传（DSH 自己决定 401 还是公开静态）
const PASS_PREFIX = ['/assets/', '/plugins/', '/api/', '/favicon']

function launchToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' }
}

function upstreamHeaders(req) {
  const headers = { ...req.headers }
  if (PUBLIC_HOST && headers.host && headers.host !== PUBLIC_HOST) {
    headers['x-forwarded-host'] = headers.host
    headers.host = PUBLIC_HOST
  }
  return headers
}

const server = http.createServer((req, res) => {
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
    path: req.url, headers: upstreamHeaders(req),
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
      if (PUBLIC_HOST && /^host$/i.test(name)) value = PUBLIC_HOST
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
    + (PUBLIC_HOST ? ` | 上游 Host 规整为 ${PUBLIC_HOST}` : ' | 原样透传 Host'))
})
