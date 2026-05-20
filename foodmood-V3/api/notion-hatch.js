/**
 * 孵化狀態共用邏輯（排行榜彙整、寫入 Notion 快照欄位）
 */

const HATCH_RECORDS_REQUIRED = 10;

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
  if (completed < 1) return null;
  const batch = sorted.slice((completed - 1) * HATCH_RECORDS_REQUIRED, completed * HATCH_RECORDS_REQUIRED);
  return dominantCodeFromBatch(batch);
}

/** @param {Array<{ date: string, code: string }>} userRows 含即將寫入的一筆 */
function buildHatchSnapshot(userRows) {
  const recordCount = userRows.length;
  const hatched = recordCount >= HATCH_RECORDS_REQUIRED;
  const code = hatched ? hatchedCodeFromUserRows(userRows) : null;
  return {
    recordCount,
    hatched,
    creatureCode: code,
    creatureName: code ? (MBEI_NAMES[code] || code) : '',
    hatchRecordsRequired: HATCH_RECORDS_REQUIRED,
  };
}

module.exports = {
  HATCH_RECORDS_REQUIRED,
  MBEI_NAMES,
  mbeiCodeFromScores,
  buildHatchSnapshot,
  hatchedCodeFromUserRows,
};
