/**
 * Vercel Serverless：將食緒紀錄寫入 Notion 資料庫
 * 環境變數：NOTION_API_KEY、NOTION_DATABASE_ID
 * 選填：NOTION_TITLE_PROPERTY（不設則自動偵測資料庫的 Title 欄）
 */

const NOTION_VERSION = '2022-06-28';
const { mbeiCodeFromScores, buildHatchSnapshot, buildCreatureCollectionFieldValue } = require('./notion-hatch');

const COL = {
  title: process.env.NOTION_TITLE_PROPERTY || null,
  date: process.env.NOTION_COL_DATE || '日期',
  time: process.env.NOTION_COL_TIME || '時間',
  mealType: process.env.NOTION_COL_MEAL_TYPE || '餐別',
  mood: process.env.NOTION_COL_MOOD || '爽度',
  bodyFeeling: process.env.NOTION_COL_BODY || '身體感受',
  merit: process.env.NOTION_COL_MERIT || '功德',
  meritTotal: process.env.NOTION_COL_MERIT_TOTAL || '功德總數',
  mb: process.env.NOTION_COL_MB || 'MB',
  np: process.env.NOTION_COL_NP || 'NP',
  hl: process.env.NOTION_COL_HL || 'HL',
  rv: process.env.NOTION_COL_RV || 'RV',
  context: process.env.NOTION_COL_CONTEXT || '情境',
  email: process.env.NOTION_COL_EMAIL || 'Email',
  nickname: process.env.NOTION_COL_NICKNAME || '暱稱',
  gender: process.env.NOTION_COL_GENDER || '性別',
  age: process.env.NOTION_COL_AGE || '年齡',
  fortune: process.env.NOTION_COL_FORTUNE || '詩籤',
  photo: process.env.NOTION_COL_PHOTO || '餐點照片',
  /** 單欄彙總：筆數、解鎖、當前、各輪孵化（建議只建這一欄） */
  creatureCollection: process.env.NOTION_COL_CREATURE_COLLECTION || '靈獸圖鑑',
  /** 選填：Notion 有建欄位才會寫入（拉桿五類分析用） */
  moodTier: process.env.NOTION_COL_MOOD_TIER || null,
  bodyTier: process.env.NOTION_COL_BODY_TIER || null,
  moodSlider: process.env.NOTION_COL_MOOD_SLIDER || null,
  bodyComfort: process.env.NOTION_COL_BODY_COMFORT || null,
};

const MOOD_TEXT_TO_NUM = {
  很糟: 1, 不太好: 2, 普通: 3, 還不錯: 4, 很爽: 5,
};

let cachedDbSchema = null; // { titleProp, types: { '餐別': 'select', ... } }

function rich(text) {
  const s = String(text ?? '').slice(0, 2000);
  if (!s) return [];
  return [{ type: 'text', text: { content: s } }];
}

function propTitle(text) {
  return { title: rich(text) };
}

function propRichText(text) {
  return { rich_text: rich(text) };
}

function propEmail(email) {
  const s = String(email ?? '').trim();
  if (!s) return null;
  return { email: s.slice(0, 200) };
}

function propUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return null;
  return { url: s };
}

function propNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return { number: Number(n) };
}

function propDate(dateStr) {
  if (!dateStr) return null;
  const d = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return { date: { start: d } };
}

function propSelect(name) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  return { select: { name: s.slice(0, 100) } };
}

function moodToNumber(mood) {
  if (typeof mood === 'number' && mood >= 1 && mood <= 5) return mood;
  if (MOOD_TEXT_TO_NUM[mood] != null) return MOOD_TEXT_TO_NUM[mood];
  return null;
}

function buildFortuneText(fortune) {
  if (!fortune) return '';
  const parts = [];
  if (fortune.main_title) parts.push(fortune.main_title);
  if (fortune.poem) parts.push(fortune.poem);
  if (fortune.explanation) parts.push(fortune.explanation);
  return parts.join('\n').slice(0, 2000);
}

/** 相容舊版只傳 email 字串 */
function normalizeUser(user) {
  if (!user) return { email: '', nickname: '', gender: '', age: '' };
  if (typeof user === 'string') {
    return { email: user.trim(), nickname: '', gender: '', age: '' };
  }
  return {
    email: String(user.email || '').trim(),
    nickname: String(user.nickname || '').trim(),
    gender: String(user.gender || '').trim(),
    age: user.age != null && user.age !== '' ? String(user.age) : '',
  };
}

async function loadDatabaseSchema(apiKey, databaseId) {
  if (cachedDbSchema) return cachedDbSchema;

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId.trim()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || '無法讀取 Notion 資料庫結構');
  }

  const types = {};
  let titleProp = COL.title;
  for (const [name, p] of Object.entries(data.properties || {})) {
    types[name] = p.type;
    if (p.type === 'title') titleProp = titleProp || name;
  }
  if (!titleProp) throw new Error('此資料庫沒有 Title 類型欄位，請在 Notion 新增一欄標題');

  cachedDbSchema = { titleProp, types };
  return cachedDbSchema;
}

/** 依 Notion 欄位實際類型寫入（避免 select / rich_text 搞錯） */
function propForColumn(colName, value, types, { preferNumber = false } = {}) {
  if (value == null || value === '') return null;
  const t = types[colName];
  if (!t) return propRichText(String(value));

  if (t === 'title') return propTitle(String(value));
  if (t === 'date') return propDate(String(value));
  if (t === 'number') {
    const n = preferNumber ? (typeof value === 'number' ? value : moodToNumber(value) ?? Number(value)) : Number(value);
    return Number.isNaN(n) ? null : propNumber(n);
  }
  if (t === 'select') return propSelect(String(value));
  if (t === 'multi_select') {
    const s = String(value).trim();
    return s ? { multi_select: [{ name: s.slice(0, 100) }] } : null;
  }
  if (t === 'email') return propEmail(String(value));
  if (t === 'checkbox') return { checkbox: !!value };
  if (t === 'url') return propUrl(String(value));
  if (t === 'files') {
    const s = String(value).trim();
    if (!s || !/^https?:\/\//i.test(s)) return null;
    return { files: [{ type: 'external', name: 'meal.jpg', external: { url: s } }] };
  }
  if (t === 'rich_text') return propRichText(String(value));
  return propRichText(String(value));
}

/** data URL 或既有 https 網址 → 可寫入 Notion 的公開 URL */
async function resolvePhotoUrl(record) {
  const candidates = [record.photoUrl, record.photoPreviewUrl, record.photoDataUrl].filter(Boolean);
  for (const raw of candidates) {
    const s = String(raw).trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  const dataUrl = candidates.find((s) => String(s).startsWith('data:'));
  if (!dataUrl) return null;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn('未設定 BLOB_READ_WRITE_TOKEN，略過餐點照片上傳');
    return null;
  }

  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  try {
    const { put } = require('@vercel/blob');
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const blob = await put(`meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, buffer, {
      access: 'public',
      token,
      contentType: mime,
    });
    return blob.url;
  } catch (err) {
    console.error('Blob upload failed', err);
    return null;
  }
}

function readPageRow(page, emailCol, dateCol, scoreCols) {
  const p = page.properties || {};
  const readNum = (prop) => (prop?.type === 'number' && prop.number != null ? Number(prop.number) : null);
  const readDate = (prop) => (prop?.type === 'date' && prop.date?.start ? prop.date.start : page.created_time || '');
  const scores = {
    MB: readNum(p[scoreCols.mb]),
    NP: readNum(p[scoreCols.np]),
    HL: readNum(p[scoreCols.hl]),
    RV: readNum(p[scoreCols.rv]),
  };
  return {
    date: readDate(p[dateCol]),
    code: mbeiCodeFromScores(scores),
  };
}

function emailFilter(email, emailCol, types) {
  const t = types[emailCol];
  if (t === 'email') return { property: emailCol, email: { equals: email } };
  return { property: emailCol, rich_text: { equals: email } };
}

async function queryUserRows(apiKey, databaseId, email, schema) {
  if (!email) return { rows: [], pageIds: [] };
  const rows = [];
  const pageIds = [];
  let cursor;
  const filter = { filter: emailFilter(email, COL.email, schema.types) };
  do {
    const body = { page_size: 100, ...filter };
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
    if (!res.ok) throw new Error(data.message || 'Notion 查詢使用者紀錄失敗');
    for (const page of data.results || []) {
      pageIds.push(page.id);
      rows.push(readPageRow(page, COL.email, COL.date, COL));
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return { rows, pageIds };
}

function hatchPropsFromSnapshot(snapshot, types) {
  const props = {};
  const colName = COL.creatureCollection;
  if (!types[colName]) return props;
  const value = buildCreatureCollectionFieldValue(snapshot);
  const p = propForColumn(colName, value, types);
  if (p) props[colName] = p;
  return props;
}

async function patchPageProperties(apiKey, pageId, properties) {
  if (!Object.keys(properties).length) return;
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.warn('[Notion patch hatch]', data.message || res.status);
}

async function syncHatchSnapshotToUserPages(apiKey, schema, snapshot, pageIds) {
  const props = hatchPropsFromSnapshot(snapshot, schema.types);
  if (!Object.keys(props).length) return;
  await Promise.all(pageIds.map((id) => patchPageProperties(apiKey, id, props)));
}

function buildProperties(record, user, meritTotal, schema, { includeDemographics = false, photoUrl = null, hatchSnapshot = null } = {}) {
  const fortune = record.fortune || {};
  const scores = record.mbeiScores || fortune.mbei_scores || {};
  const merit = record.meritEarned ?? (fortune.merit_point?.match(/\+(\d+)/)
    ? parseInt(fortune.merit_point.match(/\+(\d+)/)[1], 10)
    : null);
  const { titleProp, types } = schema;
  const profile = normalizeUser(user);

  const title = (record.whatFood || record.foodEmoji || '未命名餐點').trim();
  const props = {
    [titleProp]: propTitle(title),
  };

  const set = (colKey, val, opts) => {
    const colName = COL[colKey];
    if (!colName || !types[colName]) return;
    const p = propForColumn(colName, val, types, opts);
    if (p) props[colName] = p;
  };

  set('date', record.date);
  set('time', record.mealTime || record.time);
  set('mealType', record.mealType);
  set('mood', record.moodScore ?? record.mood, { preferNumber: true });
  set('bodyFeeling', record.bodyFeeling);
  if (record.moodTier != null) set('moodTier', record.moodTier);
  if (record.bodyTier != null) set('bodyTier', record.bodyTier);
  if (record.moodSlider != null) set('moodSlider', record.moodSlider);
  if (record.bodyComfort != null) set('bodyComfort', record.bodyComfort);
  set('merit', merit);
  set('meritTotal', meritTotal);
  set('mb', scores.MB);
  set('np', scores.NP);
  set('hl', scores.HL);
  set('rv', scores.RV);
  set('context', record.context);
  set('email', profile.email);
  set('nickname', profile.nickname);
  if (includeDemographics) {
    set('gender', profile.gender);
    set('age', profile.age, { preferNumber: true });
  }
  set('fortune', buildFortuneText(fortune));
  if (photoUrl) set('photo', photoUrl);
  if (hatchSnapshot) Object.assign(props, hatchPropsFromSnapshot(hatchSnapshot, types));

  return props;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey) return res.status(503).json({ error: '未設定 NOTION_API_KEY' });
  if (!databaseId) return res.status(503).json({ error: '未設定 NOTION_DATABASE_ID' });

  const { record, user, meritTotal, includeDemographics } = req.body || {};
  if (!record || !record.whatFood) {
    return res.status(400).json({ error: '缺少 record' });
  }

  try {
    const schema = await loadDatabaseSchema(apiKey, databaseId);
    const photoUrl = await resolvePhotoUrl(record);
    const profile = normalizeUser(user);
    const email = profile.email;

    let existingPageIds = [];
    let hatchSnapshot = null;
    if (email && schema.types[COL.email]) {
      const { rows: existingRows, pageIds } = await queryUserRows(apiKey, databaseId, email, schema);
      existingPageIds = pageIds;
      const scores = record.mbeiScores || record.fortune?.mbei_scores || {};
      const nextRows = [
        ...existingRows.map((r) => ({ date: r.date, code: r.code })),
        { date: record.date || new Date().toISOString().slice(0, 10), code: mbeiCodeFromScores(scores) },
      ];
      hatchSnapshot = buildHatchSnapshot(nextRows);
    }

    const properties = buildProperties(record, user, meritTotal, schema, {
      includeDemographics: !!includeDemographics,
      photoUrl,
      hatchSnapshot,
    });

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId.trim() },
        properties,
      }),
    });

    const data = await notionRes.json().catch(() => ({}));

    if (!notionRes.ok) {
      console.error('Notion API error', data);
      return res.status(notionRes.status).json({
        error: data.message || 'Notion API 失敗',
        code: data.code,
      });
    }

    if (hatchSnapshot && existingPageIds.length) {
      await syncHatchSnapshotToUserPages(apiKey, schema, hatchSnapshot, existingPageIds);
    }

    return res.status(200).json({
      ok: true,
      pageId: data.id,
      titleProperty: schema.titleProp,
      writtenColumns: Object.keys(properties),
      photoUrl: photoUrl || null,
      hatchSnapshot: hatchSnapshot || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};

module.exports.buildProperties = buildProperties;
module.exports.COL = COL;
