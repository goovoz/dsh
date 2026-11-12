// 配置面板自检：HTTP 路由 + 保存即时生效 + 配置文件落盘（值不脱敏）
import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures += 1;
};

// ---- mock 青龙 ----
const ql = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (o) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(o));
  };
  if (u.pathname === '/open/auth/token') {
    return send({ code: 200, data: { token: 'tok-config-test', expiration: Math.floor(Date.now() / 1000) + 3600 } });
  }
  if (u.pathname === '/open/crons') return send({ code: 200, data: { data: [], total: 0 } });
  if (u.pathname === '/open/scripts') return send({ code: 200, data: [] });
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 404, message: 'nf' }));
});
await new Promise((r) => ql.listen(0, '127.0.0.1', r));
const qlUrl = `http://127.0.0.1:${ql.address().port}`;

// ---- 隔离的配置路径，且清掉会覆盖文件的环境变量 ----
const dir = mkdtempSync(join(tmpdir(), 'qlcfg-'));
const cfgFile = join(dir, 'ql-cli.json');
process.env.QINGLONG_CLI_CONFIG = cfgFile;
delete process.env.QL_URL;
delete process.env.QL_CLIENT_ID;
delete process.env.QL_CLIENT_SECRET;

// CLI bundle：优先仓库内 vendor，其次本机已解包的一份（开发机上没有 vendor 时）
const cliCandidates = [
  join(ROOT, 'vendor', 'ql.js'),
  join(homedir(), '.dsh', 'vendor', 'qinglong-cli', 'dist', 'npm', 'ql.js'),
];
const cliPath = cliCandidates.find((p) => existsSync(p));
check('找到可用的 CLI bundle', Boolean(cliPath), cliPath || cliCandidates.join(' | '));
if (!cliPath) {
  ql.close();
  process.exit(1);
}
process.env.QL_CLI_PATH = cliPath;

// ---- 用假 ctx 拿插件注册的 HTTP 路由 ----
const routes = new Map();
const tools = new Map();
const ctx = {
  tools: { register: (t) => tools.set(t.name, t) },
  get: (k) =>
    k === 'webServer'
      ? {
          register: ({ path, handler }) => {
            routes.set(path, handler);
            return () => {};
          },
        }
      : undefined,
  effect: (fn) => {
    fn();
    return () => {};
  },
  inject: () => {},
};

const mod = await import(pathToFileURL(join(ROOT, 'index.js')).href);
mod.apply(ctx);

check('注册了 4 个工具', tools.size === 4, [...tools.keys()].join(','));
check('注册了 2 条 HTTP 路由', routes.size === 2, [...routes.keys()].join(','));
check('路由包含 /qinglong/config', routes.has('/qinglong/config'));
check('路由包含 /qinglong/test', routes.has('/qinglong/test'));

const bridge = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const h = routes.get(u.pathname);
  if (!h) {
    res.writeHead(404);
    return res.end('{}');
  }
  h(req, res);
});
await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const B = `http://127.0.0.1:${bridge.address().port}`;

const getJson = async (p, init) => {
  const r = await fetch(B + p, init);
  return { status: r.status, body: await r.json() };
};
const postJson = (p, obj) =>
  getJson(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

// 1) 初始状态
let s = await getJson('/qinglong/config');
check('GET 初始：ready=false', s.body.ready === false, JSON.stringify({ ready: s.body.ready }));
check('GET 初始：返回配置文件路径', typeof s.body.settingsFile === 'string' && s.body.settingsFile === cfgFile, s.body.settingsFile);

// 2) 保存
let p = await postJson('/qinglong/config', { qlUrl, clientId: 'cfg-id', clientSecret: 'cfg-secret-123' });
check('POST 保存成功', p.body.saved === true, JSON.stringify(p.body).slice(0, 160));
check('POST 保存后 probe 连通', p.body.probe && p.body.probe.ok === true, JSON.stringify(p.body.probe));

// 3) 真实值回显（不脱敏）
s = await getJson('/qinglong/config');
check('GET 回显 qlUrl 为真实值', s.body.settings.qlUrl === qlUrl, s.body.settings.qlUrl);
check('GET 回显 clientId 为真实值', s.body.settings.clientId === 'cfg-id', s.body.settings.clientId);
check('GET 回显 clientSecret 为真实值（未脱敏）', s.body.settings.clientSecret === 'cfg-secret-123', s.body.settings.clientSecret);
check('GET ready=true', s.body.ready === true);

// 4) 落盘与权限
const raw = JSON.parse(readFileSync(cfgFile, 'utf8'));
check('文件内容 = 提交值', raw.qlUrl === qlUrl && raw.clientId === 'cfg-id' && raw.clientSecret === 'cfg-secret-123');
const mode = statSync(cfgFile).mode & 0o777;
if (process.platform === 'win32') {
  console.log('SKIP  配置文件权限 0600（Windows 无 POSIX 权限位，实际 mode=0o' + mode.toString(8) + '）');
} else {
  check('配置文件权限 0600', mode === 0o600, '0o' + mode.toString(8));
}

// 5) 保存后即时生效：工具能直接用新配置
const st = await tools.get('qlcli_status').execute({});
check('保存后 qlcli_status 立即可用', st.ok === true, JSON.stringify(st).slice(0, 160));

// 6) test 路由（此时地址仍是 mock 根）
const t = await getJson('/qinglong/test', { method: 'POST' });
check('POST /qinglong/test 连通', t.body && t.body.ok === true, JSON.stringify(t.body).slice(0, 140));

// 7) 改地址后立即切换（不重启）
const dir2 = mkdtempSync(join(tmpdir(), 'qlcfg2-'));
p = await postJson('/qinglong/config', { qlUrl: qlUrl + '/ql', clientId: 'cfg-id', clientSecret: 'cfg-secret-123' });
check('第二次保存返回 saved', p.body.saved === true);
s = await getJson('/qinglong/config');
check('第二次保存后地址已更新', s.body.settings.qlUrl === qlUrl + '/ql', s.body.settings.qlUrl);

// 8) 环境变量优先时标记 locked
process.env.QL_CLIENT_ID = 'env-id';
const locked = await getJson('/qinglong/config');
check('环境变量存在时 locked.clientId=true', locked.body.locked.clientId === true);
delete process.env.QL_CLIENT_ID;

bridge.close();
ql.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
