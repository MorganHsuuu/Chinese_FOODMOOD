/**
 * 從 Notion 資料庫彙整功德排行榜
 * GET /api/notion-leaderboard?email=（選填，標記「這是你」）
 *
 * 個人榜：功德 + 最近一輪孵化靈獸（每 10 筆紀錄）
 * 角色榜：各靈獸有多少修行者（已孵化至少一輪）
 */

const NOTION_VERSION = '2022-06-28';
const HATCH_RECORDS_REQUIRED = 10;

const COL = {
  merit: process.env.NOTION_COL_MERIT || '功德',
  meritTotal: process.env.NOTION_COL_MERIT_TOTAL || '功德總數',
  mb: process.env.NOTION_COL_MB || 'MB',
  np: process.env.NOTION_COL_NP || 'NP',
  hl: process.env.NOTION_COL_HL || 'HL',
  rv: process.env.NOTION_COL_RV || 'RV',
  email: process.env.NOTION_COL_EMAIL || 'Email',
  nickname: process.env.NOTION_COL_NICKNAME || '暱稱',
  date: process.env.NOTION_COL_DATE || '日期',
};

const MBEI_AXES = [
  { key: 'MB', neg: 'B', pos: 'M' },
  { key: 'NP', neg: 'P', pos: 'N' },
  { key: 'HL', neg: 'L', pos: 'H' },
  { key: 'RV', neg: 'R', pos: 'V' },
];

const MBEI_NAMES = {
  MNHR: '玄武', MNHV: '麒麟', MNLR: '白澤', MNLV: '九尾',
  MPHR: '金烏', MPHV: '饕餮', MPLR: '織女', MPLV: '夢貘',
  BNHR: '當康', BNHV: '朱厭', BNLR: '夔', BNLV: '夫諸',
  BPHR: '混沌', BPHV: '魃', BPLR: '精衛', BPLV: '影',
};

function clampMbei(n) {
  return Math.max(-50, Math.min(50, Math.round(Number(n) || 0)));
}

function mbeiCodeFromScores(scores) {
  if (!scores) return 'MPLR';
  const code = MBEI_AXES.map(({ key, neg, pos }) => (clampMbei(scores[key]) >= 0 ? pos : neg)).join('');
  return MBEI_NAMES[code] ? code : 'MPLR';
}

function dominantCodeFromBatch(batch) {
  if (!batch.length) return null;
  const freq = {};
  batch.forEach((row) => {
    const c = row.code || 'MPLR';
    freq[c] = (freq[c] || 0) + 1;
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'MPLR';
}

function hatchedCodeFromUserRows(userRows) {
  const sorted = [...userRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const completed = Math.floor(sorted.length / HATCH_RECORDS_REQUIRED);
  if (completed < 1) return dominantCodeFromBatch(sorted) || null;
  const batch = sorted.slice((completed - 1) * HATCH_RECORDS_REQUIRED, completed * HATCH_RECORDS_REQUIRED);
  return dominantCodeFromBatch(batch);
}

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
  return '';
}

function readDate(prop) {
  if (!prop || prop.type !== 'date' || !prop.date?.start) return '';
  return prop.date.start;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
    merit: readNumber(p[COL.merit]) || 0,
    meritTotal: readNumber(p[COL.meritTotal]),
    date: readDate(p[COL.date]) || page.created_time || '',
    code: mbeiCodeFromScores(scores),
  };
}

function buildLeaderboards(rows, currentEmail) {
  const current = normalizeEmail(currentEmail);
  const byUser = {};

  for (const row of rows) {
    const key = normalizeEmail(row.email) || `nick:${row.nickname}`;
    if (!key || key === 'nick:') continue;
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(row);
  }

  const personalMap = {};

  for (const [key, userRows] of Object.entries(byUser)) {
    const email = normalizeEmail(userRows[0]?.email);
    const hatchedCode = hatchedCodeFromUserRows(userRows);
    const recordCount = userRows.length;
    let points = 0;
    let latestMeritTotal = null;
    for (const row of userRows) {
      if (row.meritTotal != null) latestMeritTotal = Math.max(latestMeritTotal ?? row.meritTotal, row.meritTotal);
      else points += row.merit;
    }
    if (latestMeritTotal != null) points = latestMeritTotal;

    const hatched = recordCount >= HATCH_RECORDS_REQUIRED;
    personalMap[key] = {
      email,
      name: userRows.find((r) => r.nickname)?.nickname || email.split('@')[0] || '修行者',
      points,
      code: hatched ? (hatchedCode || userRows[userRows.length - 1]?.code || 'MPLR') : null,
      recordCount,
      hatched,
    };
  }

  const personal = Object.values(personalMap)
    .map((u) => ({
      ...u,
      isUser: current && (u.email === current || (!u.email && current)),
      scoreLabel: '累積功德',
    }))
    .sort((a, b) => b.points - a.points)
    .map((u, idx) => ({ ...u, rank: idx + 1 }));

  const characterMap = {};
  for (const u of Object.values(personalMap)) {
    if (!u.hatched || !u.code) continue;
    if (!characterMap[u.code]) {
      characterMap[u.code] = {
        code: u.code,
        name: MBEI_NAMES[u.code] || u.code,
        userCount: 0,
        points: 0,
      };
    }
    characterMap[u.code].userCount += 1;
    characterMap[u.code].points += u.points;
  }

  const mbei = Object.values(characterMap)
    .sort((a, b) => b.userCount - a.userCount || b.points - a.points)
    .map((u, idx) => ({
      ...u,
      rank: idx + 1,
      scoreLabel: '修行者人數',
    }));

  return { personal, mbei };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey) return res.status(503).json({ error: '未設定 NOTION_API_KEY' });
  if (!databaseId) return res.status(503).json({ error: '未設定 NOTION_DATABASE_ID' });

  const currentEmail = req.query?.email || '';

  try {
    const pages = await queryAllPages(apiKey, databaseId);
    const rows = pages.map(parseRow);
    const { personal, mbei } = buildLeaderboards(rows, currentEmail);

    return res.status(200).json({
      ok: true,
      personal,
      mbei,
      totalRecords: rows.length,
      hatchRecordsRequired: HATCH_RECORDS_REQUIRED,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};
