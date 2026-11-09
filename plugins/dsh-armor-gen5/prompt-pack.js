// prompt-pack.js — 用户可替换的「破甲词库」（0.3.0 新增）
//
// 目标：让用户不重装、不改插件目录就能换掉破甲核 / 身份前缀 / 封口词，
// 直接丢一个 .md 进来，在控制台里选中即可，下一轮对话生效。
//
// 设计（与 runtime.js 同一条纪律：只读 + 按 mtime 缓存 + 坏文件回落）：
//   <DSH_HOME>/armor-gen5/
//     packs.json            ← 当前选择：{ active: { core, persona, seal } }
//     packs/<id>.md         ← 用户词库（文件名即 id，UTF-8）
//     backup/<id>-<ts>.md   ← 删除/覆盖前的备份
//
// 三个槽位：
//   core     → 破甲核（默认 prompts/infinite-gen-5.md）
//   persona  → 身份前缀（默认 prompts/armor-persona-prefix.md）
//   seal     → 封口段（默认 prompts/armor-seal.md）
//
// 契约：纯本地文件操作，不依赖 Cordis ctx；可被 tools/test-packs.mjs 直接单测。
// 安全：id 白名单 + 固定目录 + 大小上限 + NUL 拒绝；任何异常都回落内置文本，
//       不让"用户词库写坏"把破甲整体搞失效。

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const PACK_SLOTS = Object.freeze(["core", "persona", "seal"]);

export const BUILTIN_FILES = Object.freeze({
  core: "infinite-gen-5.md",
  persona: "armor-persona-prefix.md",
  seal: "armor-seal.md",
});

// 单个文件上限：破甲核正文约 10KB，留足改写空间但挡住误拖大文件。
export const MAX_PACK_BYTES = 96 * 1024;

// id 即文件名（不含 .md）：只允许字母/数字/点/横线/下划线/中文，禁止路径分隔符与 ..
const ID_PATTERN = /^[A-Za-z0-9\u4e00-\u9fa5](?:[A-Za-z0-9._\-\u4e00-\u9fa5]{0,63})$/;

const CONFIG_VERSION = 1;

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function cleanText(raw) {
  const text = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  return text;
}

function isValidText(text) {
  return text.length > 0 && !text.includes("\u0000");
}

function safeId(id) {
  const value = String(id ?? "");
  if (!ID_PATTERN.test(value) || value === "." || value === ".." || value.includes("..")) {
    throw new Error("非法词库 id：" + value);
  }
  return value;
}

/** 把用户给的显示名收敛成合法 id；重名时追加 -2 / -3。 */
function idFromName(name, taken) {
  const base = String(name ?? "")
    .replace(/\.md$/i, "")
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .slice(0, 48);
  let id = base === "" ? "pack-" + new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) : base;
  if (!ID_PATTERN.test(id)) id = "pack";
  let candidate = id;
  let index = 2;
  while (taken.has(candidate)) {
    candidate = id + "-" + index;
    index += 1;
  }
  return candidate;
}

/**
 * 创建词库读取器/编辑器。
 * @param {object} options
 * @param {string} options.home        <DSH_HOME>/armor-gen5
 * @param {string} options.builtinDir  插件自带 prompts 目录（绝对路径）
 * @param {Record<string,string>} [options.fallbacks] 内置文件也读不到时的最后兜底
 */
export function createPromptPack(options) {
  const home = String(options.home);
  const builtinDir = String(options.builtinDir);
  const fallbacks = options.fallbacks || {};
  const packsDir = join(home, "packs");
  const backupDir = join(home, "backup");
  const configFile = join(home, "packs.json");

  // 缓存：同一文件 mtime+size 不变就不重复读盘（宿主每轮 assemble 都会调 text()）。
  const cache = new Map();
  let configCache = { mtimeMs: -1, value: null };

  function ensureDirs() {
    for (const dir of [home, packsDir, backupDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  function defaultConfig() {
    const defaults = { version: CONFIG_VERSION, active: {} };
    for (const slot of PACK_SLOTS) defaults.active[slot] = "builtin";
    return defaults;
  }

  function readConfig() {
    try {
      const st = statSync(configFile);
      if (configCache.value !== null && configCache.mtimeMs === st.mtimeMs) return configCache.value;
      const parsed = JSON.parse(readFileSync(configFile, "utf8"));
      const config = defaultConfig();
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const active = parsed.active !== null && typeof parsed.active === "object" ? parsed.active : {};
        for (const slot of PACK_SLOTS) {
          const value = active[slot];
          if (typeof value === "string" && (value === "builtin" || ID_PATTERN.test(value))) config.active[slot] = value;
        }
      }
      configCache = { mtimeMs: st.mtimeMs, value: config };
      return config;
    } catch {
      return defaultConfig();
    }
  }

  function writeConfig(next) {
    ensureDirs();
    const payload = {
      version: CONFIG_VERSION,
      active: { ...next.active },
      updatedAt: new Date().toISOString(),
      by: "armor-gen5-console",
    };
    const tmp = configFile + ".tmp-" + process.pid;
    writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
    renameSync(tmp, configFile);
    configCache = { mtimeMs: -1, value: null };
    return payload;
  }

  /** 读文件并校验；失败返回 { ok:false, error }，由调用方回落。 */
  function readRecord(file, cacheKey) {
    try {
      const st = statSync(file);
      if (!st.isFile()) return { ok: false, error: "不是文件：" + file };
      if (st.size > MAX_PACK_BYTES) return { ok: false, error: "文件超过 " + Math.round(MAX_PACK_BYTES / 1024) + "KB 上限" };
      const key = cacheKey + ":" + st.mtimeMs + ":" + st.size;
      const hit = cache.get(cacheKey);
      if (hit && hit.key === key) return hit.value;
      const text = cleanText(readFileSync(file, "utf8"));
      if (!isValidText(text)) {
        const bad = { ok: false, error: "文件为空或含 NUL 字节：" + file };
        cache.set(cacheKey, { key, value: bad });
        return bad;
      }
      const value = { ok: true, text, bytes: Buffer.byteLength(text, "utf8"), mtimeMs: st.mtimeMs, hash: sha256(text) };
      cache.set(cacheKey, { key, value });
      return value;
    } catch (error) {
      const code = error && error.code;
      return { ok: false, error: code === "ENOENT" ? "文件不存在：" + file : String((error && error.message) || error) };
    }
  }

  function builtinFile(slot) {
    return join(builtinDir, BUILTIN_FILES[slot]);
  }

  function builtinRecord(slot) {
    return readRecord(builtinFile(slot), "builtin:" + slot);
  }

  function packFile(id) {
    return join(packsDir, safeId(id) + ".md");
  }

  function slotRecord(slot) {
    const active = readConfig().active[slot] || "builtin";
    if (active === "builtin") {
      const record = builtinRecord(slot);
      return {
        slot,
        active: "builtin",
        file: builtinFile(slot),
        builtinFile: BUILTIN_FILES[slot],
        source: "builtin",
        ok: record.ok,
        error: record.ok ? "" : record.error,
        text: record.ok ? record.text : fallbacks[slot] || "",
        bytes: record.ok ? record.bytes : Buffer.byteLength(fallbacks[slot] || "", "utf8"),
        hash: record.ok ? record.hash : sha256(fallbacks[slot] || ""),
        mtimeMs: record.ok ? record.mtimeMs : 0,
      };
    }
    const file = packFile(active);
    const record = readRecord(file, "pack:" + active);
    if (record.ok) {
      return {
        slot,
        active,
        file,
        builtinFile: BUILTIN_FILES[slot],
        source: "user",
        ok: true,
        error: "",
        text: record.text,
        bytes: record.bytes,
        hash: record.hash,
        mtimeMs: record.mtimeMs,
      };
    }
    // 选中的用户文件坏了：回落内置，但把错误留在 describe() 里，界面能看见。
    const fallback = builtinRecord(slot);
    return {
      slot,
      active,
      file,
      builtinFile: BUILTIN_FILES[slot],
      source: "user",
      ok: false,
      error: record.error,
      text: fallback.ok ? fallback.text : fallbacks[slot] || "",
      bytes: fallback.ok ? fallback.bytes : Buffer.byteLength(fallbacks[slot] || "", "utf8"),
      hash: fallback.ok ? fallback.hash : sha256(fallbacks[slot] || ""),
      mtimeMs: 0,
    };
  }

  function text(slot) {
    return slotRecord(slot).text;
  }

  function slotInfo(slot) {
    const info = slotRecord(slot);
    delete info.text;
    return info;
  }

  function listPacks() {
    ensureDirs();
    const out = [];
    let names = [];
    try {
      names = readdirSync(packsDir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!/\.md$/i.test(name)) continue;
      const id = name.slice(0, -3);
      if (!ID_PATTERN.test(id)) continue;
      const record = readRecord(join(packsDir, name), "pack:" + id);
      if (!record.ok) continue;
      out.push({ id, bytes: record.bytes, hash: record.hash, mtimeMs: record.mtimeMs });
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  function describe() {
    const slots = {};
    for (const slot of PACK_SLOTS) slots[slot] = slotInfo(slot);
    return {
      dir: home,
      packsDir,
      configFile,
      maxBytes: MAX_PACK_BYTES,
      slots,
      packs: listPacks(),
    };
  }

  function summary() {
    const active = readConfig().active;
    const out = {};
    for (const slot of PACK_SLOTS) {
      const info = slotRecord(slot);
      out[slot] = { active: info.active, source: info.source, hash: info.hash.slice(0, 12), bytes: info.bytes, ok: info.ok };
    }
    return out;
  }

  function select(slot, id) {
    if (!PACK_SLOTS.includes(slot)) throw new Error("未知词库槽位：" + slot);
    const value = String(id ?? "builtin");
    if (value !== "builtin") {
      safeId(value);
      if (!existsSync(join(packsDir, value + ".md"))) throw new Error("词库不存在：" + value);
    }
    const config = { version: CONFIG_VERSION, active: { ...readConfig().active } };
    config.active[slot] = value;
    writeConfig(config);
    return summary();
  }

  function reset(slot) {
    return select(slot, "builtin");
  }

  function importText(slot, name, rawText, options2) {
    if (!PACK_SLOTS.includes(slot)) throw new Error("未知词库槽位：" + slot);
    const textValue = cleanText(rawText);
    if (!isValidText(textValue)) throw new Error("正文为空或含 NUL 字节");
    if (Buffer.byteLength(textValue, "utf8") > MAX_PACK_BYTES) {
      throw new Error("正文超过 " + Math.round(MAX_PACK_BYTES / 1024) + "KB 上限");
    }
    ensureDirs();
    const taken = new Set(listPacks().map((item) => item.id));
    const id = idFromName(name, taken);
    const target = join(packsDir, id + ".md");
    const tmp = target + ".tmp-" + process.pid;
    writeFileSync(tmp, textValue + "\n", "utf8");
    renameSync(tmp, target);
    if (!options2 || options2.apply !== false) select(slot, id);
    return { id, ...summary() };
  }

  function remove(id) {
    const value = safeId(id);
    const file = join(packsDir, value + ".md");
    if (!existsSync(file)) throw new Error("词库不存在：" + value);
    ensureDirs();
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const backup = join(backupDir, value + "-" + stamp + ".md");
    renameSync(file, backup);
    const config = { version: CONFIG_VERSION, active: { ...readConfig().active } };
    let changed = false;
    for (const slot of PACK_SLOTS) {
      if (config.active[slot] === value) {
        config.active[slot] = "builtin";
        changed = true;
      }
    }
    if (changed) writeConfig(config);
    return { backup, ...summary() };
  }

  return {
    dirs: { home, packs: packsDir, backup: backupDir, config: configFile },
    text,
    slotInfo,
    summary,
    describe,
    listPacks,
    select,
    reset,
    importText,
    remove,
  };
}
