/**
 * MBEI 四軸加權計分（-50～+50）
 * 對照 openspec：四大維度加權計分邏輯
 */

const MBEI_AXES = [
  { key: 'MB', neg: 'B', pos: 'M' }, // 負=M魂/情緒，正=B魄/生理（規格稱 P 魄）
  { key: 'NP', neg: 'P', pos: 'N' }, // 負=加工煉化，正=原野自然
  { key: 'HL', neg: 'L', pos: 'H' },
  { key: 'RV', neg: 'R', pos: 'V' },
];

const clampMbei = (n) => Math.max(-50, Math.min(50, Math.round(Number(n) || 0)));

const MOOD_NUM = { '很糟': 1, '不太好': 2, '普通': 3, '還不錯': 4, '很爽': 5 };

const EMOTION_CONTEXT_RE = /壓力|加班|失戀|孤單|犒賞|解饞|難過|想哭|焦慮|煩躁|空虛|寂寞|報復|紓壓|紓解|療癒|安慰|情緒|崩潰|委屈|煩|累|倦|委屈|爆吃|暴食|紓|慰|撫|賭氣|賭氣吃|心情|煩悶|煩心/;

const HL_BASE = {
  '清爽有神': -40,
  '意猶未盡': -20,
  '舒服飽足': 0,
  '碳水倒流': 25,
  '油膩發脹': 45,
  '腸胃作怪': 50,
  '輕盈自在': -40, '活力充沛': -40, '清爽無負擔': -40,
  '暖心飽足': 0, '舒服滿足': 0,
  '尚未滿足': -20, '吃飽想睡': 25, '昏沉想睡': 25, '昏沉腦鈍': 25,
  '頭重腦慢': 45, '頭昏腦脹': 45, '腸胃不適': 50, '腸胃不舒服': 50,
};

const BODY_TIER_HL_SCORE = {
  1: 50,
  2: 35,
  3: 15,
  4: -10,
  5: -40,
};

const BODY_FEELING_LEGACY = {
  '輕盈自在': '清爽有神', '活力充沛': '清爽有神', '清爽無負擔': '清爽有神',
  '暖心飽足': '舒服飽足', '舒服滿足': '舒服飽足', '尚未滿足': '意猶未盡',
  '吃飽想睡': '碳水倒流', '昏沉想睡': '碳水倒流', '昏沉腦鈍': '碳水倒流',
  '頭重腦慢': '油膩發脹', '頭昏腦脹': '油膩發脹',
  '腸胃不適': '腸胃作怪', '腸胃不舒服': '腸胃作怪',
};

const ANCHOR_SCORES = { MB: -20, NP: 35, HL: 10, RV: -40 };

const MAIN_MEALS = new Set(['早餐', '午餐', '晚餐']);
const SNACK_MEALS = new Set(['宵夜', '點心']);

const parseMoodNumber = (mood) => {
  if (typeof mood === 'number') return mood;
  return MOOD_NUM[mood] ?? 3;
};

const parseTimeMinutes = (mealTime) => {
  const parts = String(mealTime || '12:00').split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (Number.isNaN(h)) return 12 * 60;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
};

const normalizeBodyFeeling = (label) => {
  if (!label) return null;
  if (HL_BASE[label] != null) return label;
  return BODY_FEELING_LEGACY[label] || null;
};

const parseBodyTier = (value) => {
  if (typeof value === 'number' && value >= 1 && value <= 5) return Math.round(value);
  const match = String(value || '').match(/(?:第\s*)?([1-5])(?:\s*\/\s*5|\s*類)?$/);
  return match ? Number(match[1]) : null;
};

const getFoodInput = (recordData) =>
  String(recordData?.whatFood || recordData?.foodEmoji || '').trim();

const hasEmotionalContext = (context) => {
  const t = String(context || '').trim();
  return t.length > 0 && EMOTION_CONTEXT_RE.test(t);
};

/** 維度1：能量來源 M(魂,-) vs B(魄,+) */
function scoreMB(recordData) {
  let s = 0;
  const ctx = String(recordData?.context || '').trim();
  const mealType = recordData?.mealType || '午餐';
  const mood = parseMoodNumber(recordData?.mood);

  if (hasEmotionalContext(ctx)) s -= 30;

  const isSnack = SNACK_MEALS.has(mealType);
  const isMain = MAIN_MEALS.has(mealType);
  if (isSnack && mood >= 4) s -= 20;
  if (isMain && !hasEmotionalContext(ctx)) s += 40;

  // 規格：負分=M魂、正分=B魄；軸向編碼為 score≥0→M，故反轉符號
  return clampMbei(-s);
}

/** 維度3：身體負荷 */
function scoreHL(recordData) {
  const tier = parseBodyTier(recordData?.bodyTier ?? recordData?.bodyFeeling);
  const label = normalizeBodyFeeling(recordData?.bodyFeeling);
  let s = tier ? BODY_TIER_HL_SCORE[tier] : (label && HL_BASE[label] != null ? HL_BASE[label] : 0);
  const food = getFoodInput(recordData);
  if (s > 0 && /油炸|重甜|起司|炸|薯條|披薩|芝士|奶酪|奶茶|全糖|甜甜圈|蛋糕|洋芋|鹹酥/.test(food)) {
    s += 5;
  }
  return clampMbei(s);
}

const inRange = (t, startH, startM, endH, endM) => {
  const start = startH * 60 + startM;
  let end = endH * 60 + endM;
  if (end <= start) {
    return t >= start || t < end;
  }
  return t >= start && t < end;
};

const isRegularMealAligned = (mealType, t) => {
  if (mealType === '早餐') return inRange(t, 6, 0, 9, 30);
  if (mealType === '午餐') return inRange(t, 11, 30, 14, 0);
  if (mealType === '晚餐') return inRange(t, 17, 30, 20, 30);
  return false;
};

/** 維度4：規律節奏 R(-50) vs V(+50) */
function scoreRV(recordData) {
  const mealType = recordData?.mealType || '午餐';
  const t = parseTimeMinutes(recordData?.mealTime);

  if (isRegularMealAligned(mealType, t)) return -50;

  const isAfternoonSnackSlot = inRange(t, 14, 30, 17, 0);
  const isLateNightSlot = inRange(t, 22, 0, 4, 0);
  const isMainMisaligned = MAIN_MEALS.has(mealType) && !isRegularMealAligned(mealType, t);

  if (mealType === '宵夜' || mealType === '點心' || isAfternoonSnackSlot || isLateNightSlot || isMainMisaligned) {
    return 50;
  }

  return 0;
}

/** 維度2 fallback：食材造化（AI 失敗時；正值=N 原野，負值=P 加工） */
function estimateNPFromFood(foodName) {
  const f = String(foodName || '').trim();
  if (!f) return 0;

  const tier50Processed = ['洋芋片', '泡麵', '科學麵', '鹹酥雞', '鹽酥雞', '手搖', '珍奶', '超商', '甜甜圈', '糖果', '零食', '薯條', '炸雞', '漢堡', '可樂', '汽水', '能量棒', '麥當勞', '肯德基'];
  const tier25Processed = ['牛肉麵', '義大利麵', '滷味', '水餃', '鍋貼', '炒飯', '便當', '拉麵', '披薩', '熱狗', '三明治'];
  const tier50Natural = ['水煮蛋', '清燙', '燙青菜', '鮮肉', '生魚片', '沙拉', '清蒸', '水煮'];
  const tier25Natural = ['雞肉飯', '牛排', '炒青菜', '家常', '便當菜', '滷肉飯', '煎魚', '蒸魚', '燉'];

  if (tier50Processed.some((k) => f.includes(k))) return -50;
  if (tier25Processed.some((k) => f.includes(k))) return -25;
  if (tier50Natural.some((k) => f.includes(k))) return 50;
  if (tier25Natural.some((k) => f.includes(k))) return 25;
  if (/炸|泡|罐|加工|速食|微波/.test(f)) return -25;
  if (/蒸|燙|清|蔬|沙拉/.test(f)) return 25;
  return 0;
}

function isAnchorNp(np) {
  return clampMbei(np) === ANCHOR_SCORES.NP;
}

function isFullAnchorScores(scores) {
  if (!scores) return false;
  return MBEI_AXES.every(({ key }) => clampMbei(scores[key]) === ANCHOR_SCORES[key]);
}

function computeRuleMbeiScores(recordData) {
  return {
    MB: scoreMB(recordData),
    HL: scoreHL(recordData),
    RV: scoreRV(recordData),
  };
}

function mbeiCodeFromScores(scores) {
  if (!scores) return 'MPLR';
  return MBEI_AXES.map(({ key, neg, pos }) => (clampMbei(scores[key]) >= 0 ? pos : neg)).join('');
}

function mergeMbeiScores(aiScores, recordData) {
  const rule = computeRuleMbeiScores(recordData);
  const food = getFoodInput(recordData);
  let np = aiScores?.NP ?? aiScores?.np_score;
  if (np == null || isAnchorNp(np) || isFullAnchorScores(aiScores)) {
    np = estimateNPFromFood(food);
  }
  const merged = {
    MB: rule.MB,
    NP: clampMbei(np),
    HL: rule.HL,
    RV: rule.RV,
  };
  return { mbei_scores: merged, calculated_mbei: mbeiCodeFromScores(merged) };
}

module.exports = {
  MBEI_AXES,
  clampMbei,
  scoreMB,
  scoreHL,
  scoreRV,
  estimateNPFromFood,
  computeRuleMbeiScores,
  mergeMbeiScores,
  mbeiCodeFromScores,
  normalizeBodyFeeling,
};
