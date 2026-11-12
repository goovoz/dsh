// 前缀 + 中转路径自检：QL_URL 带子路径（反向代理场景）且主机不在回环白名单
// 覆盖 ensureRelay 的两段逻辑：非回环 → 起 relay；带前缀 → 前缀必须保留
import http from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLI = join(ROOT, 'vendor', 'ql.js');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures += 1;
};

const PREFIX = '/ql';
const calls = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  calls.push(u.pathname);
  const send = (o) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(o));
  };
  // 面板挂在反代子路径下：所有 /open/* 都在 PREFIX 之后
  if (!u.pathname.startsWith(PREFIX + '/open/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 404, message: 'outside prefix' }));
  }
  const p = u.pathname.slice(PREFIX.length);
  if (p === '/open/auth/token') {
    return send({ code: 200, data: { token: 'prefixed-token', expiration: Math.floor(Date.now() / 1000) + 3600 } });
  }
  if (p === '/open/crons') {
    return send({ code: 200, data: { data: [{ id: 42, name: 'prefixed-task', command: 'task b.py' }], total: 1 } });
  }
  if (p === '/open/scripts') return send({ code: 200, data: [{ title: 'b.py', type: 'file' }] });
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 404, message: 'not found' }));
});

// 127.0.0.2 在回环网段内，但不在插件的 loopback 白名单里 —— 正好压测 relay 分支
let port;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.2', resolve);
  });
  port = server.address().port;
} catch (e) {
  console.log(`SKIP  本机不支持 127.0.0.2 绑定（${e.code || e.message}），跳过前缀用例`);
  process.exit(0);
}

check('vendor/ql.js 存在', existsSync(CLI));
if (!existsSync(CLI)) {
  server.close();
  process.exit(1);
}

process.env.QL_URL = `http://127.0.0.2:${port}${PREFIX}`;
process.env.QL_CLIENT_ID = 'mock-client';
process.env.QL_CLIENT_SECRET = 'mock-secret';
process.env.QL_CLI_PATH = CLI;

const mod = await import(pathToFileURL(join(ROOT, 'index.js')).href);
const tools = new Map();
mod.apply({ tools: { register: (t) => tools.set(t.name, t) } });

const st = await tools.get('qlcli_status').execute({});
check('qlcli_status 经 relay 成功', st.ok === true, JSON.stringify(st).slice(0, 200));
check('via 是回环中转地址', String(st.via || '').startsWith('http://127.0.0.1:'), String(st.via));
check('中转地址保留了前缀', String(st.via || '').endsWith(PREFIX), String(st.via));

const list = await tools.get('qlcli').execute({ args: ['task', 'list'], query: { page: 1, size: 2 } });
check('task list 经 relay 成功', list.ok === true, JSON.stringify(list).slice(0, 160));

check('上游实际收到带前缀的请求', calls.some((c) => c === `${PREFIX}/open/auth/token`), calls.slice(0, 3).join(' , '));
check('上游没有收到裸 /open 请求', !calls.some((c) => c.startsWith('/open/')), calls.filter((c) => c.startsWith('/open/')).join(' , '));

server.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
