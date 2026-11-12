// DSH 工具插件：封装官方 @whyour/qinglong-cli（ql）
//
// 两个必须处理的现实约束：
// 1) 官方 CLI 只接受 HTTPS 或「回环」HTTP，远端 http://host:5700 会被直接拒绝
//    （"远程认证需要 HTTPS；HTTP 仅允许回环地址"）→ 这里在 127.0.0.1 起 net 双向转发。
// 2) 新旧子命令的选项集不同（script update 吃 --query/--data，task list 只吃 --page/--size）
//    → 先跑 `ql <cmd> --help` 缓存选项集，再决定怎么拼参数。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

export const name = 'dsh-qinglong-cli';
export const inject = ['tools'];

// ---------- 配置 ----------
// 优先级：环境变量 > 配置文件（QINGLONG_CLI_CONFIG > $DSH_HOME/ql-cli.json > ~/.dsh/qinglong-cli.json）
function readConfig() {
  const candidates = [
    process.env.QINGLONG_CLI_CONFIG,
    process.env.DSH_HOME ? join(process.env.DSH_HOME, 'ql-cli.json') : null,
    join(homedir(), '.dsh', 'qinglong-cli.json'),
  ].filter(Boolean);
  for (const f of candidates) {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      /* 下一个 */
    }
  }
  return {};
}

const CFG = readConfig();
const QL_URL = String(process.env.QL_URL || CFG.qlUrl || '').trim();
const CLIENT_ID = String(process.env.QL_CLIENT_ID || CFG.clientId || '').trim();
const CLIENT_SECRET = String(process.env.QL_CLIENT_SECRET || CFG.clientSecret || '').trim();
const CLI_PATH = String(
  process.env.QL_CLI_PATH || CFG.cliPath || join(HERE, 'vendor', 'ql.js'),
);
const NODE_BIN = process.execPath;

// ---------- 回环转发 ----------
let relay = null;

function startRelay(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      const upstream = net.connect({ host, port }, () => {
        client.pipe(upstream);
        upstream.pipe(client);
      });
      const kill = () => {
        client.destroy();
        upstream.destroy();
      };
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
  if (!QL_URL) {
    throw new Error('未配置青龙地址：设置环境变量 QL_URL，或写 ~/.dsh/qinglong-cli.json 的 qlUrl');
  }
  const u = new URL(QL_URL);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
  if (loopback && u.protocol === 'http:') {
    relay = { base: QL_URL.replace(/\/+$/, '') };
    return relay;
  }
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const r = await startRelay(u.hostname, port);
  relay = { base: `http://127.0.0.1:${r.port}`, server: r.server };
  return relay;
}

// ---------- 应用 token ----------
let token = { value: '', exp: 0 };

async function ensureToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token.value && token.exp - 60 > now) return token.value;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('未配置应用凭据：设置 QL_CLIENT_ID / QL_CLIENT_SECRET，或写 ~/.dsh/qinglong-cli.json 的 clientId / clientSecret');
  }
  const { base } = await ensureRelay();
  const url = `${base}/open/auth/token?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;
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
  return execFileP(NODE_BIN, argv, {
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

async function optionSet(args) {
  const key = args.join(' ');
  if (helpCache.has(key)) return helpCache.get(key);
  const r = await runCli([CLI_PATH, ...args, '--help'], '', '', 20);
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
  const { base } = await ensureRelay();
  const at = await ensureToken();
  const secs = Math.min(Math.max(timeout, 5), 3600);
  const opts = await optionSet(args);

  const argv = [CLI_PATH, ...args, '--json'];
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

export function apply(ctx) {
  const tools = [
    tool(
      'qlcli',
      '执行官方青龙 CLI（@whyour/qinglong-cli）。args 是 ql 后面的子命令数组，例如 ["task","list"]、["script","get"]；query/data 会按该子命令实际支持的选项自动转成 --query JSON 或 --page/--size 这类位置式选项。先用 qlcli_help 查参数、qlcli_routes 查全量路由。',
      {
        type: 'object',
        properties: {
          args: {
            type: 'array',
            items: { type: 'string' },
            description: '子命令数组，例如 ["task","log-files","12"]',
          },
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
        properties: {
          command: { type: 'array', items: { type: 'string' }, description: '子命令数组' },
        },
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
}
