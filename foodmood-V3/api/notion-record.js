/**
 * Vercel Serverless：將食緒紀錄寫入 Notion 資料庫（結構化欄位）
 * 環境變數：
 *   NOTION_API_KEY
 *   NOTION_DATABASE_ID
 *   NOTION_TITLE_PROPERTY — 食物名稱欄（預設「標題」）
 */

const NOTION_VERSION = '2022-06-28';

/** 與 Notion 資料庫欄位名稱一致（可依實際欄位名用 env 覆寫） */
const COL = {
  title: process.env.NOTION_TITLE_PROPERTY || '標題',
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
  user: process.env.NOTION_COL_USER || 'USER 1',
  fortune: process.env.NOTION_COL_FORTUNE || '詩籤',
};

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

/** Select 欄位（餐別／爽度／身體感受若為 Select 類型時使用） */
function propSelect(name) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  return { select: { name: s.slice(0, 100) } };
}

function buildFortuneText(fortune) {
  if (!fortune) return '';
  const parts = [];
  if (fortune.main_title) parts.push(fortune.main_title);
  if (fortune.poem) parts.push(fortune.poem);
  if (fortune.explanation) parts.push(fortune.explanation);
  return parts.join('\n').slice(0, 2000);
}

function buildProperties(record, user, meritTotal) {
  const fortune = record.fortune || {};
  const scores = record.mbeiScores || fortune.mbei_scores || {};
  const merit = record.meritEarned ?? (fortune.merit_point?.match(/\+(\d+)/)
    ? parseInt(fortune.merit_point.match(/\+(\d+)/)[1], 10)
    : null);

  const title = (record.whatFood || record.foodEmoji || '未命名餐點').trim();
  const props = {
    [COL.title]: propTitle(title),
  };

  const setRich = (key, val) => {
    const p = propRichText(val);
    if (p) props[key] = p;
  };
  const setNum = (key, val) => {
    const p = propNumber(val);
    if (p) props[key] = p;
  };
  const setSelect = (key, val) => {
    const p = propSelect(val);
    if (p) props[key] = p;
  };
  const setDate = (key, val) => {
    const p = propDate(val);
    if (p) props[key] = p;
  };

  setDate(COL.date, record.date);
  setRich(COL.time, record.mealTime || record.time);
  // 若 Notion 欄位為「文字」用 rich_text；若為 Select 且 API 報錯，可改 env 或把欄位改成文字
  setSelect(COL.mealType, record.mealType);
  setSelect(COL.mood, record.mood);
  setSelect(COL.bodyFeeling, record.bodyFeeling);
  setNum(COL.merit, merit);
  if (meritTotal != null) setNum(COL.meritTotal, meritTotal);
  setNum(COL.mb, scores.MB);
  setNum(COL.np, scores.NP);
  setNum(COL.hl, scores.HL);
  setNum(COL.rv, scores.RV);
  setRich(COL.context, record.context);
  setRich(COL.user, user);
  setRich(COL.fortune, buildFortuneText(fortune));

  return props;
}

/** Select 失敗時改寫 rich_text（欄位若是文字類型） */
function fallbackRichTextProperties(record, user, meritTotal) {
  const fortune = record.fortune || {};
  const scores = record.mbeiScores || fortune.mbei_scores || {};
  const merit = record.meritEarned ?? null;
  const title = (record.whatFood || '未命名餐點').trim();

  const props = { [COL.title]: propTitle(title) };
  const add = (key, val, asNum = false) => {
    if (val == null || val === '') return;
    props[key] = asNum ? propNumber(val) : propRichText(val);
  };

  if (record.date) props[COL.date] = propDate(record.date);
  add(COL.time, record.mealTime || record.time);
  add(COL.mealType, record.mealType);
  add(COL.mood, record.mood);
  add(COL.bodyFeeling, record.bodyFeeling);
  add(COL.merit, merit, true);
  add(COL.meritTotal, meritTotal, true);
  add(COL.mb, scores.MB, true);
  add(COL.np, scores.NP, true);
  add(COL.hl, scores.HL, true);
  add(COL.rv, scores.RV, true);
  add(COL.context, record.context);
  add(COL.user, user);
  add(COL.fortune, buildFortuneText(fortune));

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

  const { record, user, meritTotal } = req.body || {};
  if (!record || !record.whatFood) {
    return res.status(400).json({ error: '缺少 record' });
  }

  const userLabel = user || '';
  let properties = buildProperties(record, userLabel, meritTotal);

  const body = {
    parent: { database_id: databaseId.trim() },
    properties,
  };

  try {
    let notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    let data = await notionRes.json().catch(() => ({}));

    // 欄位類型不符（例如餐別是文字卻送了 select）時改試 rich_text
    if (!notionRes.ok && (data.code === 'validation_error' || notionRes.status === 400)) {
      properties = fallbackRichTextProperties(record, userLabel, meritTotal);
      notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parent: { database_id: databaseId.trim() }, properties }),
      });
      data = await notionRes.json().catch(() => ({}));
    }

    if (!notionRes.ok) {
      console.error('Notion API error', data);
      return res.status(notionRes.status).json({
        error: data.message || 'Notion API 失敗',
        code: data.code,
      });
    }

    return res.status(200).json({ ok: true, pageId: data.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};
