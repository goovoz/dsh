#!/usr/bin/env node
// ab_targeted.mjs — 针对指定探针 ID 跑 v10 vs N1 对比
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REFUSAL_MARKERS, FALLBACK_MARKERS, NON_REFUSAL_TAIL } from "../armor-rules.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_URL = "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const KEY = process.argv[2];
const IDS = (process.argv[3] || "").split(",").filter(Boolean);
if (!KEY || IDS.length === 0) { console.error("用法: node tools/ab_targeted.mjs <api_key> <id1,id2,..."); process.exit(1); }

function armorScore(text) {
  const folded = text.toLocaleLowerCase();
  const scan = (list) => {
    const found = [];
    for (const marker of list) {
      const key = marker.toLocaleLowerCase();
      let from = 0;
      for (;;) {
        const idx = folded.indexOf(key, from);
        if (idx === -1) break;
        const tail = folded.slice(idx + key.length, idx + key.length + 12);
        if (!NON_REFUSAL_TAIL.some((e) => tail.includes(e))) found.push(marker);
        from = idx + key.length;
      }
    }
    return found;
  };
  const refusal = scan(REFUSAL_MARKERS);
  const fallback = scan(FALLBACK_MARKERS);
  const words = refusal.concat(fallback).slice(0, 3);
  return { verdict: words.length ? (refusal.length ? "refusal" : "fallback") : "pass", words };
}

async function call(systemPrompt, userPrompt) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 16384,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const c = data.choices[0];
  return { text: c.message.content, finish: c.finish_reason };
}

const bank = readFileSync(join(ROOT, "tools", "prompt_bank.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim()).map(JSON.parse);
const v10 = readFileSync(join(ROOT, "prompts", "v10.md"), "utf8");
const n1 = readFileSync(join(ROOT, "prompts", "N1.md"), "utf8");

const out = { v10: [], N1: [] };
for (const p of bank.filter((q) => IDS.includes(q.id))) {
  for (const [name, sys] of [["v10", v10], ["N1", n1]]) {
    try {
      const r = await call(sys, p.prompt);
      const s = armorScore(r.text);
      out[name].push({ id: p.id, ...s, finish: r.finish, len: r.text.length, text: r.text });
      console.log(`  [${name}] ${p.id}: ${s.verdict} (${s.words.join(", ") || "-"}) finish=${r.finish} len=${r.text.length}`);
    } catch (e) { console.error(`  [${name}] ${p.id}: ERROR ${e.message}`); }
  }
}
const n1ById = new Map(out.N1.map((r) => [r.id, r]));
for (const r of out.v10) {
  const n = n1ById.get(r.id);
  if (n && n.verdict !== r.verdict) console.log(`DIFF ${r.id}: v10=${r.verdict} N1=${n.verdict}`);
}
const outDir = join(ROOT, "tools", "ab-results");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outFile = join(outDir, "targeted-" + ts + ".json");
const fsmod = await import("node:fs");
fsmod.writeFileSync(outFile, JSON.stringify({ out }, null, 2), "utf8");
console.log("detail: " + outFile);
