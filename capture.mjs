// 从 dsh 的启动日志里抓 launch token（43 字符 base64url），给 gateway 做自动登录
import fs from 'node:fs'

const TOKEN_FILE = '/run/dsh/launch-token'
let buf = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  process.stdout.write(chunk)
  buf = (buf + chunk).slice(-16384)
  const m = buf.match(/[?&]token=([A-Za-z0-9_-]{43})/)
  if (!m) return
  let cur = ''
  try { cur = fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch {}
  if (cur === m[1]) return
  fs.writeFileSync(TOKEN_FILE, m[1] + '\n', { mode: 0o600 })
  console.log('\n[entrypoint] token captured: http://' + (process.env.PUBLIC_HOST ?? '127.0.0.1:8899') + '/?token=' + m[1] + '\n')
})
process.stdin.on('end', () => process.exit(0))
