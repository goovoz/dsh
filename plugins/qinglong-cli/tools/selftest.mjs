// 离线自检：起一个 mock 青龙，走真实 CLI 验证插件链路（不依赖外部环境）
import http from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLI = join(ROOT, 'vendor', 'ql.js');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures += 1;
};

// ---- mock 青龙 ----
const calls = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  calls.push(`${req.method} ${u.pathname}`);
  const send = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (u.pathname === '/open/auth/token') {
    return send({ code: 200, data: { token: 'mock-app-token', expiration: Math.floor(Date.now() / 1000) + 3600 } });
  }
  if (u.pathname === '/open/crons') {
    const auth = req.headers['authorization'] || '';
    if (!auth.includes('mock-app-token')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ code: 401, message: 'bad token' }));
    }
    return send({ code: 200, data: { data: [{ id: 7, name: 'mock-task', command: 'task a.py' }], total: 1 } });
  }
  if (u.pathname === '/open/scripts') return send({ code: 200, data: [{ title: 'a.py', type: 'file' }] });
  if (u.pathname === '/open/apps') return send({ code: 200, data: [] });
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 404, message: 'not found' }));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---- 环境（必须在 import 插件前设置）----
process.env.QL_URL = `http://127.0.0.1:${port}`;
process.env.QL_CLIENT_ID = 'mock-client';
process.env.QL_CLIENT_SECRET = 'mock-secret';
process.env.QL_CLI_PATH = CLI;

check('vendor/ql.js 存在', existsSync(CLI), CLI);
if (!existsSync(CLI)) {
  server.close();
  process.exit(1);
}

const mod = await import(join(ROOT, 'index.js'));
check('插件导出 name', mod.name === 'dsh-qinglong-cli', String(mod.name));
check('插件 inject 含 tools', Array.isArray(mod.inject) && mod.inject.includes('tools'));

const tools = new Map();
mod.apply({ tools: { register: (t) => tools.set(t.name, t) } });
check('注册 4 个工具', tools.size === 4, [...tools.keys()].join(','));

const run = async (n, a) => tools.get(n).execute(a);

const st = await run('qlcli_status', {});
check('qlcli_status 成功', st.ok === true, JSON.stringify(st).slice(0, 160));

const list = await run('qlcli', { args: ['task', 'list'], query: { page: 1, size: 2 } });
check('qlcli task list 成功', list.ok === true, JSON.stringify(list).slice(0, 160));
const taskRows = list.data && (list.data.data ?? list.data);
check('task list 走位置式选项', Array.isArray(taskRows), JSON.stringify(taskRows ?? null).slice(0, 120));

const scr = await run('qlcli', { args: ['script', 'list'], query: { path: '' } });
check('qlcli script list 成功', scr.ok === true, JSON.stringify(scr).slice(0, 160));

const help = await run('qlcli_help', { command: ['task', 'list'] });
check('qlcli_help 返回帮助文本', help.ok === true && String(help.data?.help || '').includes('task'));

const routes = await run('qlcli_routes', {});
check('qlcli_routes 返回路由表', routes.ok === true && Array.isArray(routes.data) && routes.data.length > 100, `${routes.data?.length ?? 0} 条`);

check('确实打到了 mock 的 token 接口', calls.some((c) => c.includes('/open/auth/token')));

server.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
