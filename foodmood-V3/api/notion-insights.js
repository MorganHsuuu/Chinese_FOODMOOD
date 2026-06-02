/**
 * 從 Notion 即時彙整「食緒資料洞察」頁所需資料。
 * GET /api/notion-insights
 */

const NOTION_VERSION = '2022-06-28';
const { MBEI_NAMES, mbeiCodeFromScores, buildHatchSnapshot } = require('./notion-hatch');

const COL = {
  title: process.env.NOTION_TITLE_PROPERTY || 'WhatFood',
  time: process.env.NOTION_COL_TIME || '時間',
  mealType: process.env.NOTION_COL_MEAL_TYPE || '餐別',
  mood: process.env.NOTION_COL_MOOD || '爽度',
  bodyFeeling: process.env.NOTION_COL_BODY || '身體感受',
  mb: process.env.NOTION_COL_MB || 'MB',
  np: process.env.NOTION_COL_NP || 'NP',
  hl: process.env.NOTION_COL_HL || 'HL',
  rv: process.env.NOTION_COL_RV || 'RV',
  email: process.env.NOTION_COL_EMAIL || 'Email',
  nickname: process.env.NOTION_COL_NICKNAME || '暱稱',
  date: process.env.NOTION_COL_DATE || '日期',
  context: process.env.NOTION_COL_CONTEXT || '情境',
  photo: process.env.NOTION_COL_PHOTO || '餐點照片',
};

function readNumber(prop) {
  if (!prop || prop.type !== 'number' || prop.number == null) return null;
  return Number(prop.number);
}

function readText(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return prop.title?.map((t) => t.plain_text).join('').trim() || '';
  if (prop.type === 'rich_text') return prop.rich_text?.map((t) => t.plain_text).join('').trim() || '';
  if (prop.type === 'email') return (prop.email || '').trim();
  if (prop.type === 'select') return prop.select?.name || '';
  if (prop.type === 'url') return (prop.url || '').trim();
  return '';
}

function readDate(prop, fallback = '') {
  if (!prop || prop.type !== 'date' || !prop.date?.start) return fallback;
  return prop.date.start;
}

function readNumberOrText(prop) {
  const n = readNumber(prop);
  if (n != null) return n;
  const text = readText(prop);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}

function readPhoto(prop) {
  const text = readText(prop);
  if (text) return cleanUrl(text);
  if (prop?.type === 'files') {
    const file = prop.files?.[0];
    return cleanUrl(file?.file?.url || file?.external?.url || '');
  }
  return '';
}

function cleanUrl(url) {
  const s = String(url || '').trim();
  const idx = s.lastIndexOf('https://');
  return idx > 0 ? s.slice(idx) : s;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowMinutes(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return Math.max(0, Math.min(1439, h * 60 + m));
}

function topPairs(values, limit = 8) {
  const counts = new Map();
  values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

async function queryAllPages(apiKey, databaseId) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId.trim()}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Notion 查詢失敗');
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

// 測試／佔位用的食痕，不應汙染分析頁統計（象限、四軸、餐次、影像壁等）
// 僅排除明確的測試字串；保留「未命名餐食」等仍帶有效心情/身體資料的紀錄
const TEST_FOOD_RE = /^(test\d*|測試\d*|tset|123+|abc|aaa+|xxx+|placeholder|demo)$/i;
function isTestRow(row) {
  const food = String(row?.food || '').trim();
  return TEST_FOOD_RE.test(food);
}

function parseRow(page) {
  const p = page.properties || {};
  const scores = {
    MB: readNumber(p[COL.mb]),
    NP: readNumber(p[COL.np]),
    HL: readNumber(p[COL.hl]),
    RV: readNumber(p[COL.rv]),
  };
  return {
    email: readText(p[COL.email]),
    nickname: readText(p[COL.nickname]),
    food: readText(p[COL.title]) || '未命名餐食',
    mealType: readText(p[COL.mealType]),
    time: readText(p[COL.time]),
    mood: readNumberOrText(p[COL.mood]),
    bodyFeeling: readNumberOrText(p[COL.bodyFeeling]),
    context: readText(p[COL.context]),
    photo: readPhoto(p[COL.photo]),
    date: readDate(p[COL.date], page.created_time || ''),
    code: mbeiCodeFromScores(scores),
    scores,
  };
}

function pickAxisPhotos(rows, scoreKey, lowLabel, highLabel, limit = 8) {
  const withPhotos = rows.filter((r) => r.photo && toNum(r.scores?.[scoreKey]) != null);
  const lows = [...withPhotos].sort((a, b) => toNum(a.scores[scoreKey]) - toNum(b.scores[scoreKey])).slice(0, Math.ceil(limit / 2));
  const highs = [...withPhotos].sort((a, b) => toNum(b.scores[scoreKey]) - toNum(a.scores[scoreKey])).slice(0, Math.floor(limit / 2));
  return [...lows, ...highs].map((r, idx, arr) => {
    const score = toNum(r.scores[scoreKey]) || 0;
    const pos = Math.max(10, Math.min(84, 47 + score * 0.74));
    return {
      food: r.food,
      note: score < 0 ? lowLabel : highLabel,
      pos,
      row: idx % 2,
      url: r.photo,
      meal: r.mealType,
      time: r.time,
      order: arr.length - idx,
    };
  });
}

function buildMoodBodyQuadrant(rows) {
  const candidates = rows
    .filter((r) => toNum(r.mood) != null && toNum(r.bodyFeeling) != null)
    .map((r) => ({
      ...r,
      moodN: toNum(r.mood),
      bodyN: toNum(r.bodyFeeling),
    }));
  const buckets = [
    { pred: (r) => r.moodN >= 4 && r.bodyN >= 4, take: 4 },
    { pred: (r) => r.moodN >= 4 && r.bodyN <= 2, take: 4 },
    { pred: (r) => r.moodN <= 2 && r.bodyN >= 4, take: 3 },
    { pred: (r) => r.moodN <= 2 && r.bodyN <= 2, take: 3 },
  ];
  const picked = [];
  for (const bucket of buckets) {
    const seen = new Set();
    for (const row of candidates.filter(bucket.pred)) {
      if (seen.has(row.food)) continue;
      seen.add(row.food);
      picked.push(row);
      if (seen.size >= bucket.take) break;
    }
  }
  return picked.map((r, idx) => {
    const jitter = ((idx % 3) - 1) * 3;
    return {
      food: r.food,
      x: Math.max(14, Math.min(88, 14 + ((r.moodN - 1) / 4) * 72 + jitter)),
      y: Math.max(14, Math.min(86, 86 - ((r.bodyN - 1) / 4) * 72 - jitter)),
      count: rows.filter((row) => row.food === r.food).length,
      mood: r.moodN,
      body: r.bodyN,
      meal: r.mealType || '未記餐次',
      time: r.time || '--:--',
      story: r.context || `${r.mealType || '某一餐'}留下了心情 ${r.moodN}、身體 ${r.bodyN} 的食緒痕跡。`,
    };
  });
}

function summarizeRows(rows) {
  const dated = rows.map((r) => String(r.date || '').slice(0, 10)).filter(Boolean).sort();
  const users = new Set(rows.map((r) => normalizeEmail(r.email) || `nick:${r.nickname}`).filter((x) => x && x !== 'nick:'));
  const byUser = {};
  for (const row of rows) {
    const key = normalizeEmail(row.email) || `nick:${row.nickname}`;
    if (!key || key === 'nick:') continue;
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(row);
  }

  const roleFoods = {};
  rows.forEach((row) => {
    if (!roleFoods[row.code]) roleFoods[row.code] = [];
    roleFoods[row.code].push(row.food);
  });

  const roleCounts = {};
  Object.values(byUser).forEach((userRows) => {
    const snap = buildHatchSnapshot(userRows.map((r) => ({ date: r.date, code: r.code })));
    (snap.hatchedCreatures || []).forEach((h) => {
      roleCounts[h.code] = (roleCounts[h.code] || 0) + 1;
    });
  });

  const roleData = Object.entries(roleCounts)
    .map(([code, count]) => ({
      code,
      name: MBEI_NAMES[code] || code,
      count,
      foods: topPairs(roleFoods[code] || [], 8),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const avg = (key) => {
    const nums = rows.map((r) => toNum(r.scores?.[key])).filter((n) => n != null);
    return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;
  };

  return {
    totalRows: rows.length,
    userCount: users.size,
    dateRange: [dated[0] || '', dated[dated.length - 1] || ''],
    axisAvgs: { MB: avg('MB'), NP: avg('NP'), HL: avg('HL'), RV: avg('RV') },
    roleData,
    mealCounts: topPairs(rows.map((r) => r.mealType || '未填'), 8),
    topFoods: topPairs(rows.map((r) => r.food), 12),
    photos: rows.filter((r) => r.photo && r.code === 'BNHR').slice(0, 8).map((r) => ({
      food: r.food,
      meal: r.mealType || '',
      nick: '匿名修行者',
      url: r.photo,
    })),
    moodBodyQuadrant: buildMoodBodyQuadrant(rows),
    axisPhotos: {
      np: pickAxisPhotos(rows, 'NP', '加工煉痕', '原型野息'),
      hl: pickAxisPhotos(rows, 'HL', '輕盈靈息', '負擔煞痕'),
      mb: pickAxisPhotos(rows, 'MB', '心情魂緒', '身體魄需'),
    },
    timeDots: Object.fromEntries(
      ['早餐', '午餐', '晚餐', '點心', '宵夜'].map((meal) => [
        meal,
        rows.filter((r) => r.mealType === meal).map((r) => rowMinutes(r.time)).filter((n) => n != null).slice(0, 18),
      ]),
    ),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey) return res.status(503).json({ error: '未設定 NOTION_API_KEY' });
  if (!databaseId) return res.status(503).json({ error: '未設定 NOTION_DATABASE_ID' });

  try {
    const pages = await queryAllPages(apiKey, databaseId);
    const rows = pages.map(parseRow).filter((r) => !isTestRow(r));
    return res.status(200).json({ ok: true, ...summarizeRows(rows) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};

module.exports.summarizeRows = summarizeRows;
module.exports.parseRow = parseRow;
