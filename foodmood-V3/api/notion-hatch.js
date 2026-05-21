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

/** 僅在每滿 10 筆孵化完成時解鎖該輪 dominant 靈獸（非每筆紀錄） */
function unlockedCodesFromUserRows(userRows) {
  const codes = hatchedCreaturesFromUserRows(userRows).map((h) => h.code);
  return [...new Set(codes.filter((c) => MBEI_NAMES[c]))].sort();
}

/** 每一輪滿 10 筆孵化出的靈獸 */
function hatchedCreaturesFromUserRows(userRows) {
  const sorted = [...userRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const completed = Math.floor(sorted.length / HATCH_RECORDS_REQUIRED);
  const list = [];
  for (let i = 0; i < completed; i += 1) {
    const batch = sorted.slice(i * HATCH_RECORDS_REQUIRED, (i + 1) * HATCH_RECORDS_REQUIRED);
    const code = dominantCodeFromBatch(batch) || 'MPLR';
    list.push({
      cycle: i + 1,
      code,
      name: MBEI_NAMES[code] || code,
      label: `${MBEI_NAMES[code] || code} (${code})`,
    });
  }
  return list;
}

/**
 * 單欄「靈獸圖鑑」精簡格式（由左至右以 | 分隔）：
 * n:筆數|hatched:0/1|cycles:輪數|cur:當前代碼|u:解鎖代碼逗號分隔|h:輪數:代碼逗號分隔
 * 例：n:12|hatched:1|cycles:1|cur:MPLR|u:MNLR,MPLR|h:1:MPLR
 */
function serializeCreatureCollection(snap) {
  const u = (snap.unlockedCodes || []).join(',');
  const h = (snap.hatchedCreatures || []).map((x) => `${x.cycle}:${x.code}`).join(',');
  return [
    `n:${snap.recordCount}`,
    `hatched:${snap.hatched ? 1 : 0}`,
    `cycles:${snap.hatchCycles || 0}`,
    `cur:${snap.creatureCode || '-'}`,
    `u:${u || '-'}`,
    `h:${h || '-'}`,
  ].join('|');
}

function parseHatchedSegment(seg) {
  if (!seg || seg === '-') return [];
  return seg.split(',').filter(Boolean).map((part) => {
    const [cycle, code] = part.split(':');
    const c = code || 'MPLR';
    return {
      cycle: parseInt(cycle, 10) || 1,
      code: c,
      name: MBEI_NAMES[c] || c,
      label: `${MBEI_NAMES[c] || c} (${c})`,
    };
  });
}

function parseCreatureCollection(text) {
  if (!text || typeof text !== 'string') return null;
  let raw = text.trim();
  if (!raw) return null;
  if (raw.includes('◆')) raw = raw.split('◆').pop().trim();

  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      const hatchedCreatures = Array.isArray(j.h)
        ? j.h.map((x) => ({
          cycle: x.cycle || 1,
          code: x.code || 'MPLR',
          name: MBEI_NAMES[x.code] || x.code,
          label: `${MBEI_NAMES[x.code] || x.code} (${x.code})`,
        }))
        : parseHatchedSegment(
          Array.isArray(j.hatchedList)
            ? j.hatchedList.map((x) => `${x.cycle}:${x.code}`).join(',')
            : '',
        );
      const unlockedFromH = hatchedCreatures.map((x) => x.code).filter((c) => MBEI_NAMES[c]);
      const unlockedLegacy = Array.isArray(j.u) ? j.u : (j.unlocked || j.unlockedCodes || []);
      const unlockedCodes = unlockedFromH.length
        ? [...new Set(unlockedFromH)]
        : unlockedLegacy.filter((c) => MBEI_NAMES[c]);
      return {
        recordCount: Number(j.n ?? j.recordCount) || 0,
        hatched: !!(j.hatched ?? (Number(j.n) >= HATCH_RECORDS_REQUIRED)),
        hatchCycles: Number(j.cycles ?? j.hatchCycles) || 0,
        creatureCode: j.cur && j.cur !== '-' ? j.cur : null,
        creatureName: j.cur && MBEI_NAMES[j.cur] ? MBEI_NAMES[j.cur] : '',
        unlockedCodes,
        hatchedCreatures,
      };
    } catch {
      return null;
    }
  }

  if (!raw.includes('n:')) return null;
  const map = {};
  raw.split('|').forEach((part) => {
    const i = part.indexOf(':');
    if (i < 0) return;
    map[part.slice(0, i)] = part.slice(i + 1);
  });
  const hatchedCreatures = parseHatchedSegment(map.h);
  const unlockedFromH = hatchedCreatures.map((x) => x.code).filter((c) => MBEI_NAMES[c]);
  const unlockedLegacy = (map.u && map.u !== '-' ? map.u.split(',') : []).filter((c) => MBEI_NAMES[c]);
  const unlockedCodes = unlockedFromH.length ? [...new Set(unlockedFromH)] : unlockedLegacy;
  const creatureCode = map.cur && map.cur !== '-' ? map.cur : null;
  return {
    recordCount: parseInt(map.n, 10) || 0,
    hatched: map.hatched === '1',
    hatchCycles: parseInt(map.cycles, 10) || 0,
    creatureCode,
    creatureName: creatureCode ? (MBEI_NAMES[creatureCode] || creatureCode) : '',
    unlockedCodes,
    hatchedCreatures,
  };
}

/** Notion 裡給人看的摘要（可接在精簡格式前，解析時會忽略 ◆ 之前） */
function formatCreatureCollectionLabel(snap) {
  const n = snap.recordCount;
  const unlocked = snap.unlockedCodes?.length || 0;
  const cur = snap.creatureCode
    ? `${MBEI_NAMES[snap.creatureCode] || snap.creatureCode}(${snap.creatureCode})`
    : '—';
  const hatched = (snap.hatchedCreatures || [])
    .map((h) => `第${h.cycle}輪${h.name}`)
    .join('、') || '—';
  return `${n}筆·解鎖${unlocked}/16·當前${cur}·孵化${hatched}`;
}

/** @param {Array<{ date: string, code: string }>} userRows 含即將寫入的一筆 */
function buildHatchSnapshot(userRows) {
  const recordCount = userRows.length;
  const hatched = recordCount >= HATCH_RECORDS_REQUIRED;
  const code = hatched ? hatchedCodeFromUserRows(userRows) : null;
  const unlockedCodes = unlockedCodesFromUserRows(userRows);
  const hatchedCreatures = hatchedCreaturesFromUserRows(userRows);
  const hatchCycles = hatchedCreatures.length;
  return {
    recordCount,
    hatched,
    hatchCycles,
    creatureCode: code,
    creatureName: code ? (MBEI_NAMES[code] || code) : '',
    unlockedCodes,
    hatchedCreatures,
    hatchRecordsRequired: HATCH_RECORDS_REQUIRED,
    collectionCompact: serializeCreatureCollection({
      recordCount,
      hatched,
      hatchCycles,
      creatureCode: code,
      unlockedCodes,
      hatchedCreatures,
    }),
    collectionDisplay: formatCreatureCollectionLabel({
      recordCount,
      hatched,
      hatchCycles,
      creatureCode: code,
      unlockedCodes,
      hatchedCreatures,
    }),
  };
}

/** 寫入 Notion 單欄：人讀摘要 + ◆ + 機器可解析精簡格式 */
function buildCreatureCollectionFieldValue(snap) {
  return `${snap.collectionDisplay} ◆ ${snap.collectionCompact}`;
}

module.exports = {
  HATCH_RECORDS_REQUIRED,
  MBEI_NAMES,
  mbeiCodeFromScores,
  buildHatchSnapshot,
  hatchedCodeFromUserRows,
  unlockedCodesFromUserRows,
  hatchedCreaturesFromUserRows,
  serializeCreatureCollection,
  parseCreatureCollection,
  buildCreatureCollectionFieldValue,
};
