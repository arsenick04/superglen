#!/usr/bin/env node
/**
 * Strict validator for the Tantangan Pintar question bank: `npm run check:quiz`.
 *
 * Reads src/data/quiz/{items,images,berhitung,inggris,mandarin,hewan,membaca}.json and checks the schema and the content
 * (arithmetic, answer present, no duplicate choices, ...). Exit code 1 on any ERROR; WARNINGs (too few questions, unbalanced
 * answer positions, missing files) do not fail. `--quiet` prints only problems.
 *
 *   ERROR   bad schema, duplicate ids, not exactly 3 choices, answer not among the choices, unknown item keys,
 *           count/sum/equation whose answer text is not the arithmetic result, duplicate choices, level outside 1..3,
 *           prompt longer than 60 characters
 *   WARNING fewer than 20 questions in a category, answer letters unbalanced, missing/empty category file
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.QUIZ_DIR ? path.resolve(process.env.QUIZ_DIR) : path.join(ROOT, 'src', 'data', 'quiz');
const QUIET = process.argv.includes('--quiet');
const CATEGORIES = ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca'];
const MIN_PER_CATEGORY = 20;
const MAX_PROMPT = 60;
const IDS = ['a', 'b', 'c'];

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(name) {
  const file = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(file)) return { missing: true };
  try {
    return { data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    err(`${name}.json`, `not valid JSON (${e.message})`);
    return { broken: true };
  }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isInt = (v) => Number.isInteger(v);

// ---- items.json ------------------------------------------------------------------------------------------------------
const items = {};
{
  const r = readJson('items');
  if (r.missing) err('items.json', 'file is missing');
  else if (r.data !== undefined) {
    if (!isObj(r.data)) err('items.json', 'must be an object keyed by item key');
    else {
      for (const [key, it] of Object.entries(r.data)) {
        const w = `items.json:${key}`;
        if (!isObj(it)) {
          err(w, 'item must be an object');
          continue;
        }
        if (it.id !== key) err(w, `id "${it.id}" must equal the key`);
        if (!isStr(it.label)) err(w, 'label must be a non-empty string');
        if (!isStr(it.emoji)) err(w, 'emoji must be a non-empty string');
        for (const f of ['en', 'zh', 'pinyin']) if (it[f] !== undefined && !isStr(it[f])) err(w, `${f} must be a non-empty string when present`);
        if (it.zh !== undefined && it.pinyin === undefined) warn(w, 'has zh but no pinyin');
        items[key] = it;
      }
    }
  }
}

// ---- images.json (optional) -------------------------------------------------------------------------------------------
{
  const r = readJson('images');
  if (r.data !== undefined) {
    if (!Array.isArray(r.data) || !r.data.every((k) => typeof k === 'string')) err('images.json', 'must be an array of item keys');
    else {
      for (const k of r.data) {
        if (!items[k]) err(`images.json:${k}`, 'unknown item key');
        if (!fs.existsSync(path.join(ROOT, 'public', 'img', 'quiz', `${k}.webp`))) warn(`images.json:${k}`, `public/img/quiz/${k}.webp not found`);
      }
    }
  }
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------
function checkItem(w, key, what) {
  if (!isStr(key)) err(w, `${what}: item key must be a string`);
  else if (!items[key]) err(w, `${what}: unknown item key "${key}"`);
}

function answerText(q) {
  const c = Array.isArray(q.choices) ? q.choices.find((x) => isObj(x) && x.id === q.answer) : undefined;
  return c ? c.text : undefined;
}

function checkArithmetic(w, q, expected, what) {
  const t = answerText(q);
  if (t === undefined) {
    err(w, `${what}: the right choice has no "text" (it must be the number ${expected})`);
    return;
  }
  if (String(t).trim() !== String(expected)) err(w, `${what}: answer text "${t}" but the result is ${expected}`);
}

function checkDisplay(w, q) {
  const d = q.display;
  if (!isObj(d) || !isStr(d.kind)) {
    err(w, 'display must be an object with a "kind"');
    return;
  }
  switch (d.kind) {
    case 'count':
      checkItem(w, d.item, 'display.item');
      if (!isInt(d.count) || d.count < 1 || d.count > 12) err(w, `display.count must be an integer 1..12 (got ${d.count})`);
      else checkArithmetic(w, q, d.count, 'count');
      break;
    case 'sum':
      for (const side of ['a', 'b']) {
        if (!isObj(d[side])) err(w, `display.${side} must be {item, count}`);
        else {
          checkItem(w, d[side].item, `display.${side}.item`);
          if (!isInt(d[side].count) || d[side].count < 0) err(w, `display.${side}.count must be a non-negative integer`);
        }
      }
      if (isObj(d.a) && isObj(d.b) && isInt(d.a.count) && isInt(d.b.count)) checkArithmetic(w, q, d.a.count + d.b.count, 'sum');
      break;
    case 'equation': {
      if (!isStr(d.text)) {
        err(w, 'display.text must be a string');
        break;
      }
      const m = d.text.match(/^\s*(\d+)\s*([+\-−–xX×*])\s*(\d+)\s*(?:=\s*\??\s*)?$/);
      if (!m) {
        err(w, `equation text "${d.text}" cannot be parsed (expected like "3 + 2" or "3 + 2 = ?")`);
        break;
      }
      const a = Number(m[1]);
      const b = Number(m[3]);
      const op = m[2];
      const res = op === '+' ? a + b : '-−–'.includes(op) ? a - b : a * b;
      checkArithmetic(w, q, res, 'equation');
      break;
    }
    case 'picture':
    case 'silhouette':
      checkItem(w, d.item, 'display.item');
      break;
    case 'sound':
      checkItem(w, d.item, 'display.item');
      if (!isStr(d.sound_id)) err(w, 'display.sound_id must be a string');
      break;
    case 'text':
      if (!isStr(d.text)) err(w, 'display.text must be a string');
      break;
    case 'speak':
      if (!isStr(d.text)) err(w, 'display.text must be a string');
      if (d.lang !== 'en' && d.lang !== 'zh') err(w, 'display.lang must be "en" or "zh"');
      if (!isStr(d.speak_audio_id)) err(w, 'display.speak_audio_id must be a string');
      if (d.lang === 'zh' && !isStr(d.pinyin)) warn(w, 'zh word without pinyin');
      break;
    case 'none':
      break;
    default:
      err(w, `unknown display kind "${d.kind}"`);
  }
}

function checkChoices(w, q) {
  if (!Array.isArray(q.choices)) {
    err(w, 'choices must be an array');
    return;
  }
  if (q.choices.length !== 3) {
    err(w, `needs exactly 3 choices (has ${q.choices.length})`);
    return;
  }
  const seen = new Set();
  q.choices.forEach((c, i) => {
    if (!isObj(c)) {
      err(w, `choice ${i} must be an object`);
      return;
    }
    if (c.id !== IDS[i]) err(w, `choice ${i} must have id "${IDS[i]}" (has "${c.id}")`);
    if (c.item === undefined && c.text === undefined) err(w, `choice ${c.id} needs "item" or "text"`);
    if (c.item !== undefined) checkItem(w, c.item, `choice ${c.id}.item`);
    if (c.text !== undefined && !isStr(c.text)) err(w, `choice ${c.id}.text must be a non-empty string`);
    for (const f of ['lang', 'pinyin']) if (c[f] !== undefined && typeof c[f] !== 'string') err(w, `choice ${c.id}.${f} must be a string`);
    const sig = `${c.item ?? ''}|${c.text ?? ''}`;
    if (seen.has(sig)) err(w, `duplicate choice (${c.item ?? ''} ${c.text ?? ''})`);
    seen.add(sig);
  });
  if (!IDS.includes(q.answer)) err(w, `answer "${q.answer}" must be a, b or c`);
  else if (!q.choices.some((c) => isObj(c) && c.id === q.answer)) err(w, `answer "${q.answer}" is not among the choices`);
}

// ---- category files -----------------------------------------------------------------------------------------------------
const allIds = new Map();
const summary = [];
for (const cat of CATEGORIES) {
  const file = `${cat}.json`;
  const r = readJson(cat);
  if (r.missing) {
    warn(file, 'file is missing: the game uses its small built-in sample for this category');
    summary.push({ cat, n: 0 });
    continue;
  }
  if (r.data === undefined) continue;
  if (!Array.isArray(r.data)) {
    err(file, 'must be an array of questions');
    continue;
  }
  if (r.data.length === 0) warn(file, 'is empty: the game uses its small built-in sample for this category');
  const letters = { a: 0, b: 0, c: 0 };
  const levels = { 1: 0, 2: 0, 3: 0 };
  r.data.forEach((q, i) => {
    const w = `${file}:${isObj(q) && isStr(q.id) ? q.id : `#${i}`}`;
    if (!isObj(q)) {
      err(w, 'question must be an object');
      return;
    }
    if (!isStr(q.id)) err(w, 'id must be a non-empty string');
    else if (allIds.has(q.id)) err(w, `duplicate id (also in ${allIds.get(q.id)})`);
    else allIds.set(q.id, file);
    if (q.category !== cat) err(w, `category "${q.category}" must be "${cat}"`);
    if (![1, 2, 3].includes(q.level)) err(w, `level must be 1, 2 or 3 (got ${q.level})`);
    else levels[q.level]++;
    if (!isStr(q.prompt)) err(w, 'prompt must be a non-empty string');
    else if ([...q.prompt].length > MAX_PROMPT) err(w, `prompt is ${[...q.prompt].length} characters (max ${MAX_PROMPT})`);
    if (!isStr(q.audio_id)) err(w, 'audio_id must be a non-empty string');
    checkDisplay(w, q);
    checkChoices(w, q);
    if (letters[q.answer] !== undefined) letters[q.answer]++;
  });
  const n = r.data.length;
  summary.push({ cat, n, levels, letters });
  if (n > 0 && n < MIN_PER_CATEGORY) warn(file, `only ${n} questions (aim for at least ${MIN_PER_CATEGORY})`);
  if (n >= 9) {
    const shares = IDS.map((l) => letters[l] / n);
    if (Math.max(...shares) > 0.5 || Math.min(...shares) < 0.15) {
      warn(file, `answer positions unbalanced (a ${letters.a}, b ${letters.b}, c ${letters.c} of ${n})`);
    }
  }
  for (const lv of [1, 2, 3]) if (n >= 9 && levels[lv] < 3) warn(file, `only ${levels[lv]} question(s) at level ${lv}`);
}

// ---- report --------------------------------------------------------------------------------------------------------------------
if (!QUIET) {
  console.log(`Quiz bank: ${Object.keys(items).length} items`);
  for (const s of summary) {
    const lv = s.levels ? ` levels ${s.levels[1]}/${s.levels[2]}/${s.levels[3]}` : '';
    const ab = s.letters ? ` answers a${s.letters.a} b${s.letters.b} c${s.letters.c}` : '';
    console.log(`  ${s.cat.padEnd(10)} ${String(s.n).padStart(3)} questions${lv}${ab}`);
  }
}
for (const w of warnings) console.log(`WARNING ${w}`);
for (const e of errors) console.log(`ERROR   ${e}`);
console.log(errors.length ? `check:quiz FAILED: ${errors.length} error(s), ${warnings.length} warning(s)` : `check:quiz OK (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
