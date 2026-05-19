/**
 * 從 Notion 資料庫彙整功德排行榜
 * GET /api/notion-leaderboard?email=（選填，標記「這是你」）
 */

const NOTION_VERSION = '2022-06-28';

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
  MNHR: '青鸞', MNHV: '窮奇', MNLR: '白澤', MNLV: '魍魎',
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
  const personalMap = {};

  for (const row of rows) {
    const key = normalizeEmail(row.email) || `nick:${row.nickname}`;
    if (!key || key === 'nick:') continue;

    if (!personalMap[key]) {
      personalMap[key] = {
        email: normalizeEmail(row.email),
        name: row.nickname || row.email.split('@')[0] || '修行者',
        points: 0,
        code: row.code,
        recordCount: 0,
      };
    }
    const u = personalMap[key];
    u.recordCount += 1;
    if (row.nickname) u.name = row.nickname;
    if (row.meritTotal != null) {
      u.points = Math.max(u.points, row.meritTotal);
    } else {
      u.points += row.merit;
    }
    if (row.date >= (u._latestDate || '')) {
      u._latestDate = row.date;
      u.code = row.code;
    }
  }

  const personal = Object.values(personalMap)
    .map((u) => {
      const { _latestDate, ...rest } = u;
      return {
        ...rest,
        isUser: current && (rest.email === current || (!rest.email && current)),
        scoreLabel: '累積功德',
      };
    })
    .sort((a, b) => b.points - a.points)
    .map((u, idx) => ({ ...u, rank: idx + 1 }));

  const mbeiMap = {};
  for (const row of rows) {
    const code = row.code || 'MPLR';
    if (!mbeiMap[code]) {
      mbeiMap[code] = { code, name: MBEI_NAMES[code] || code, points: 0, recordCount: 0 };
    }
    mbeiMap[code].points += row.merit > 0 ? row.merit : 1;
    mbeiMap[code].recordCount += 1;
  }

  const mbei = Object.values(mbeiMap)
    .sort((a, b) => b.points - a.points)
    .map((u, idx) => ({
      ...u,
      rank: idx + 1,
      scoreLabel: '累積功德',
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
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '伺服器錯誤' });
  }
};
