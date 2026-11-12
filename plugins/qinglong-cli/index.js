// DSH 工具插件：封装官方 @whyour/qinglong-cli（ql）
//
// 两个必须处理的现实约束：
// 1) 官方 CLI 只接受 HTTPS 或「回环」HTTP，远端 http://host:5700 会被直接拒绝
//    （"远程认证需要 HTTPS；HTTP 仅允许回环地址"）→ 这里在 127.0.0.1 起双向转发（https 走 TLS）。
// 2) 新旧子命令的选项集不同（script update 吃 --query/--data，task list 只吃 --page/--size）
//    → 先跑 `ql <cmd> --help` 缓存选项集，再决定怎么拼参数。
//
// 配置：优先环境变量，其次配置文件；两者都能被侧边栏面板改写并即时生效（/qinglong/config）。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import tls from 'node:tls';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

export const name = 'dsh-qinglong-cli';
export const inject = ['tools'];

const VERSION = '0.1.0';
const DSH_DIR = process.env.DSH_HOME || join(homedir(), '.dsh');
const SETTINGS_FILE = process.env.QINGLONG_CLI_CONFIG || join(DSH_DIR, 'qinglong-cli.json');
// 兼容早期版本写过 ql-cli.json 的路径
const LEGACY_FILES = [join(DSH_DIR, 'ql-cli.json')];

// ---------- 配置（可变 + 持久化） ----------
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readFirstAvailable() {
  for (const f of [SETTINGS_FILE, ...LEGACY_FILES]) {
    const j = readJson(f);
    if (j) return j;
  }
  return {};
}

let fileCfg = readFirstAvailable();

function envLocked(key) {
  const map = { qlUrl: 'QL_URL', clientId: 'QL_CLIENT_ID', clientSecret: 'QL_CLIENT_SECRET', cliPath: 'QL_CLI_PATH' };
  return Boolean(process.env[map[key]]);
}

// 环境变量 > 配置文件 > 默认
function settings() {
  return {
    qlUrl: String(process.env.QL_URL || fileCfg.qlUrl || '').trim(),
    clientId: String(process.env.QL_CLIENT_ID || fileCfg.clientId || '').trim(),
    clientSecret: String(process.env.QL_CLIENT_SECRET || fileCfg.clientSecret || '').trim(),
    cliPath: String(process.env.QL_CLI_PATH || fileCfg.cliPath || join(HERE, 'vendor', 'ql.js')),
  };
}

function saveSettings(next) {
  const merged = {
    qlUrl: String(next.qlUrl ?? fileCfg.qlUrl ?? '').trim(),
    clientId: String(next.clientId ?? fileCfg.clientId ?? '').trim(),
    clientSecret: String(next.clientSecret ?? fileCfg.clientSecret ?? '').trim(),
    ...(next.cliPath || fileCfg.cliPath ? { cliPath: String(next.cliPath || fileCfg.cliPath) } : {}),
  };
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  fileCfg = merged;
  resetRuntime();
  return merged;
}

// ---------- 回环转发 ----------
let relay = null;
let token = { value: '', exp: 0 };

function resetRuntime() {
  relay = null;
  token = { value: '', exp: 0 };
}

function startRelay({ host, port, useTls = false }) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      const upstream = useTls
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });
      const kill = () => {
        client.destroy();
        upstream.destroy();
      };
      upstream.on(useTls ? 'secureConnect' : 'connect', () => {
        client.pipe(upstream);
        upstream.pipe(client);
      });
      client.on('error', kill);
      upstream.on('error', kill);
      client.on('close', kill);
      upstream.on('close', kill);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function ensureRelay() {
  if (relay) return relay;
  const { qlUrl } = settings();
  if (!qlUrl) {
    throw new Error('未配置青龙地址：在侧边栏「青龙」面板里填写，或设置环境变量 QL_URL');
  }
  const u = new URL(qlUrl);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
  if (loopback) {
    relay = { base: qlUrl.replace(/\/+$/, '') };
    return relay;
  }
  const useTls = u.protocol === 'https:';
  const port = Number(u.port || (useTls ? 443 : 80));
  const prefix = u.pathname.replace(/\/+$/, '');
  const r = await startRelay({ host: u.hostname, port, useTls });
  relay = { base: `http://127.0.0.1:${r.port}${prefix}`, server: r.server };
  return relay;
}

// ---------- 应用 token ----------
async function ensureToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token.value && token.exp - 60 > now) return token.value;
  const { clientId, clientSecret } = settings();
  if (!clientId || !clientSecret) {
    throw new Error('未配置应用凭据：在侧边栏「青龙」面板里填写 Client ID / Secret，或设置 QL_CLIENT_ID / QL_CLIENT_SECRET');
  }
  const { base } = await ensureRelay();
  const url = `${base}/open/auth/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  const data = json && json.data ? json.data : json;
  const value = data && (data.token || data.access_token);
  if (!value) throw new Error(`换 token 失败：${JSON.stringify(json).slice(0, 300)}`);
  token = { value, exp: Number(data.expiration || now + 3600) };
  return value;
}

// ---------- CLI 调用 ----------
function runCli(argv, base, at, timeout) {
  const env = { ...process.env, NO_COLOR: '1' };
  if (base) env.QL_URL = base;
  if (at) env.QL_ACCESS_TOKEN = at;
  return execFileP(process.execPath, argv, {
    env,
    timeout: (timeout + 10) * 1000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  }).then(
    (r) => ({ stdout: r.stdout, stderr: r.stderr, exitCode: 0 }),
    (e) => ({
      stdout: e.stdout || '',
      stderr: e.stderr || String(e.message || e),
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }),
  );
}

const helpCache = new Map();

async function optionSet(args, cliPath) {
  const key = args.join(' ');
  if (helpCache.has(key)) return helpCache.get(key);
  const r = await runCli([cliPath, ...args, '--help'], '', '', 20);
  const set = new Set();
  for (const m of String(r.stdout || '').matchAll(/--[a-z][a-z-]*/g)) set.add(m[0]);
  helpCache.set(key, set);
  return set;
}

function shape(stdout, exitCode, stderr, args, base) {
  let parsed = null;
  try {
    parsed = stdout.trim() ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  const ok = exitCode === 0 && (!parsed || parsed.code === undefined || parsed.code === 200);
  return {
    ok,
    exitCode,
    ...(parsed ? { data: parsed.data !== undefined ? parsed.data : parsed } : {}),
    ...(parsed && parsed.code !== undefined ? { code: parsed.code } : {}),
    ...(parsed && parsed.message ? { message: parsed.message } : {}),
    ...(parsed ? {} : { stdout: stdout.slice(0, 20000) }),
    ...(stderr ? { stderr: stderr.slice(0, 4000) } : {}),
    command: args.join(' '),
    via: base,
  };
}

async function ql(args, { query, data, timeout = 60 } = {}) {
  const { cliPath } = settings();
  if (!existsSync(cliPath)) throw new Error(`找不到 CLI bundle：${cliPath}（可用 QL_CLI_PATH 覆盖）`);
  const { base } = await ensureRelay();
  const at = await ensureToken();
  const secs = Math.min(Math.max(timeout, 5), 3600);
  const opts = await optionSet(args, cliPath);

  const argv = [cliPath, ...args, '--json'];
  if (query !== undefined && query !== null) {
    if (opts.has('--query')) {
      argv.push('--query', JSON.stringify(query));
    } else {
      for (const [k, v] of Object.entries(query)) argv.push(`--${k}`, String(v));
    }
  }
  if (data !== undefined && data !== null) {
    if (!opts.has('--data')) {
      throw new Error(`${args.join(' ')} 不支持 --data，可用选项：${[...opts].join(' ')}`);
    }
    argv.push('--data', typeof data === 'string' ? data : JSON.stringify(data));
  }
  if (opts.has('--timeout')) argv.push('--timeout', String(secs));

  const r = await runCli(argv, base, at, secs);
  return shape(r.stdout, r.exitCode, r.stderr, args, base);
}

// ---------- 工具 ----------
const out = {
  schema: { type: 'object', additionalProperties: true },
  render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
};

const tool = (tname, description, parameters, fn) => ({
  name: tname,
  description,
  parameters,
  output: out,
  execute: (args) => fn(args || {}),
});

// ---------- 配置/连通性 HTTP 路由（侧边栏面板用） ----------
let routesRegistered = false;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > limit) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function publicState() {
  const s = settings();
  return {
    ok: true,
    version: VERSION,
    settings: {
      qlUrl: s.qlUrl,
      clientId: s.clientId,
      clientSecret: s.clientSecret,
      cliPath: s.cliPath,
    },
    // 面板要显示真实值，所以不做脱敏；只标记哪些字段被环境变量锁定
    locked: {
      qlUrl: envLocked('qlUrl'),
      clientId: envLocked('clientId'),
      clientSecret: envLocked('clientSecret'),
      cliPath: envLocked('cliPath'),
    },
    settingsFile: SETTINGS_FILE,
    ready: Boolean(s.qlUrl && s.clientId && s.clientSecret),
  };
}

async function handleConfig(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return sendJson(res, 200, publicState());
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  try {
    const body = await readBody(req);
    const saved = saveSettings({
      qlUrl: body.qlUrl,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
    });
    const state = publicState();
    // 保存后立刻验一次，让面板能直接看到"生效 / 不生效"
    let probe = { ok: false, message: '未测试' };
    const t0 = Date.now();
    try {
      await ensureToken();
      const list = await ql(['task', 'list'], { query: { page: 1, size: 1 }, timeout: 20 });
      probe = list.ok
        ? { ok: true, message: '连接成功', ms: Date.now() - t0 }
        : { ok: false, message: list.message ||'连接失败', ms: Date.now() - t0 };
    } catch (e) {
      probe = { ok: false, message: String(e.message || e), ms: Date.now() - t0 };
    }
    return sendJson(res, 200, { ...state, saved: true, probe, applied: Boolean(saved.qlUrl) });
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: String(e.message || e) });
  }
}

async function handleTest(_req, res) {
  const t0 = Date.now();
  try {
    const { base } = await ensureRelay();
    await ensureToken();
    const list = await ql(['task', 'list'], { query: { page: 1, size: 1 }, timeout: 20 });
    return sendJson(res, 200, {
      ok: list.ok,
      ms: Date.now() - t0,
      via: base,
      total: list.data && list.data.total,
      message: list.ok ? '连接成功' : list.message || '连接失败',
    });
  } catch (e) {
    return sendJson(res, 200, { ok: false, ms: Date.now() - t0, message: String(e.message || e) });
  }
}

function registerRoutes(ctx) {
  let webServer;
  try {
    webServer = ctx.get('webServer');
  } catch {
    webServer = undefined;
  }
  if (!webServer || typeof webServer.register !== 'function') return false;
  if (routesRegistered) return true;
  routesRegistered = true;
  try {
    ctx.effect(() => webServer.register({ kind: 'exact', path: '/qinglong/config', handler: handleConfig }), 'qinglong-cli: config route');
    ctx.effect(() => webServer.register({ kind: 'exact', path: '/qinglong/test', handler: handleTest }), 'qinglong-cli: test route');
  } catch (e) {
    console.error('[qinglong-cli] 注册 HTTP 路由失败:', e && e.message);
    routesRegistered = false;
    return false;
  }
  return true;
}

export function apply(ctx) {
  const tools = [
    tool(
      'qlcli',
      '执行官方青龙 CLI（@whyour/qinglong-cli）。args 是 ql 后面的子命令数组，例如 ["task","list"]、["script","get"]；query/data 会按该子命令实际支持的选项自动转成 --query JSON 或 --page/--size 这类位置式选项。配置在侧边栏「青龙」面板里设置（qlUrl / clientId / clientSecret）。',
      {
        type: 'object',
        properties: {
          args: { type: 'array', items: { type: 'string' }, description: '子命令数组，例如 ["task","log-files","12"]' },
          query: { type: 'object', description: '查询参数' },
          data: { description: '请求体，对象或 JSON 字符串' },
          timeout: { type: 'number', description: '超时秒数，默认 60' },
        },
        required: ['args'],
        additionalProperties: false,
      },
      (a) => {
        if (!Array.isArray(a.args) || a.args.length === 0) throw new Error('args 不能为空');
        return ql(a.args.map(String), { query: a.query, data: a.data, timeout: a.timeout || 60 });
      },
    ),
    tool(
      'qlcli_help',
      '查看 CLI 帮助：不传 command 看总命令树，传 command 看子命令参数（如 ["task","list"]）。',
      {
        type: 'object',
        properties: { command: { type: 'array', items: { type: 'string' }, description: '子命令数组' } },
        additionalProperties: false,
      },
      (a) => ql([...(Array.isArray(a.command) ? a.command.map(String) : []), '--help']),
    ),
    tool(
      'qlcli_routes',
      '列出 CLI 覆盖的全部 OpenAPI 路由（约 148 条），用于确认某个操作对应哪个子命令。',
      { type: 'object', properties: {}, additionalProperties: false },
      () => ql(['api', 'routes']),
    ),
    tool(
      'qlcli_status',
      '检查 CLI 到青龙的认证与连通性（ql auth status），不传参。',
      { type: 'object', properties: {}, additionalProperties: false },
      () => ql(['auth', 'status']),
    ),
  ];
  for (const t of tools) ctx.tools.register(t);

  // HTTP 路由：webServer 可能晚于本插件就绪
  try {
    if (!registerRoutes(ctx) && typeof ctx.inject === 'function') {
      ctx.inject(['webServer'], () => {
        try {
          registerRoutes(ctx);
        } catch (e) {
          console.error('[qinglong-cli] 延迟注册 HTTP 路由失败:', e && e.message);
        }
      });
    }
  } catch (e) {
    console.error('[qinglong-cli] HTTP 路由注册异常:', e && e.message);
  }
}
