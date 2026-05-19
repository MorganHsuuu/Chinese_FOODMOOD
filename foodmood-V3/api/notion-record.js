/**
 * Vercel Serverless：將食緒紀錄寫入 Notion 資料庫
 * 環境變數：NOTION_API_KEY、NOTION_DATABASE_ID
 * 選填：NOTION_TITLE_PROPERTY（不設則自動偵測資料庫的 Title 欄）
 */

const NOTION_VERSION = '2022-06-28';

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
  if (t === 'rich_text' || t === 'url' || t === 'email') return propRichText(String(value));
  return propRichText(String(value));
}

function buildProperties(record, user, meritTotal, schema, { includeDemographics = false } = {}) {
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
    const p = propForColumn(colName, val, types, opts);
    if (p) props[colName] = p;
  };

  set('date', record.date);
  set('time', record.mealTime || record.time);
  set('mealType', record.mealType);
  set('mood', record.mood, { preferNumber: true });
  set('bodyFeeling', record.bodyFeeling);
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
    const properties = buildProperties(record, user, meritTotal, schema, {
      includeDemographics: !!includeDemographics,
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

    return res.status(200).json({
      ok: true,
      pageId: data.id,
      titleProperty: schema.titleProp,
      writtenColumns: Object.keys(properties),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};

module.exports.buildProperties = buildProperties;
module.exports.COL = COL;
