/**
 * OpenAI 代理（Vercel 環境變數 OPENAI_API_KEY）
 * POST body: { action: 'vision' | 'fortune' | 'image', ... }
 */

const formatOpenAIError = (status, data) => {
  const msg = data?.error?.message || '';
  if (status === 429) return 'OpenAI 請求過於頻繁或額度不足，請稍後再試';
  if (status === 401) {
    return msg
      ? `OPENAI_API_KEY 無效：${msg}`
      : 'OPENAI_API_KEY 無效（請確認為 platform.openai.com 建立的 sk- 開頭金鑰，且帳戶已開通計費）';
  }
  return msg || `OpenAI HTTP ${status}`;
};

async function chatCompletion(apiKey, payload) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(formatOpenAIError(res.status, data));
    err.status = res.status;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 無回傳內容');
  return text;
}

const BODY_FEELING_DESC = {
  0: '身體極輕盈，能量充沛',
  1: '身體舒適，無明顯負擔',
  2: '身體略沉，有些倦意',
  3: '明顯沉重，腦袋混沌',
  4: '強烈不適，消化困難',
};

const BODY_FEELING_LABEL_DESC = {
  '意猶未盡': '食量未滿，肚子還空空的',
  '清爽有神': '精神好、身體無負擔',
  '舒服飽足': '份量剛好，吃得滿意',
  '碳水倒流': '飯後昏沉，眼皮沉重想睡',
  '油膩發脹': '肚子太撐，油膩滯脹',
  '腸胃作怪': '腸胃不適，胃痛發脹',
};

const BODY_FEELING_H = {
  '意猶未盡': 0, '清爽有神': 0, '舒服飽足': 1, '碳水倒流': 2, '油膩發脹': 3, '腸胃作怪': 4,
  '輕盈自在': 0, '活力充沛': 0, '清爽無負擔': 0, '暖心飽足': 1, '舒服滿足': 1,
  '尚未滿足': 0, '吃飽想睡': 2, '昏沉想睡': 2, '昏沉腦鈍': 2,
  '頭重腦慢': 3, '頭昏腦脹': 3, '腸胃不適': 4, '腸胃不舒服': 4,
};

const { mergeMbeiScores } = require('./mbei-scores');

const calcMeritFromContext = (context) => {
  const t = String(context || '').trim();
  if (!t) return 1;
  if (t.length >= 60) return 3;
  if (t.length >= 15) return 2;
  return 1;
};

const normalizeFortunePayload = (fortune, recordData) => {
  const ruleMerit = calcMeritFromContext(recordData?.context);
  let meritEarned = fortune?.meritEarned;
  if (typeof meritEarned !== 'number' || meritEarned < 1 || meritEarned > 3) {
    const parsed = String(fortune?.merit_point || '').match(/\+(\d+)/);
    meritEarned = parsed ? parseInt(parsed[1], 10) : ruleMerit;
  }
  meritEarned = Math.min(3, Math.max(1, Math.round(meritEarned), ruleMerit));

  const aiNp = fortune?.np_score ?? fortune?.mbei_scores?.NP;
  const { mbei_scores, calculated_mbei } = mergeMbeiScores(
    aiNp != null ? { NP: aiNp } : fortune?.mbei_scores,
    recordData,
  );

  return {
    ...fortune,
    meritEarned,
    merit_point: `+${meritEarned} 功德`,
    mbei_scores,
    calculated_mbei,
  };
};

function buildFortunePrompt(recordData) {
  const { mealType, mood, bodyFeeling, whatFood, mealTime, context } = recordData;
  const foodName = whatFood || recordData?.foodEmoji || '這一餐';
  const moodText = typeof mood === 'number'
    ? ({ 1: '很糟', 2: '不太好', 3: '普通', 4: '還不錯', 5: '很爽' }[mood] || '普通')
    : (mood || '普通');
  const hLevel = BODY_FEELING_H[bodyFeeling] ?? 1;
  const bodyDesc = BODY_FEELING_LABEL_DESC[bodyFeeling] || BODY_FEELING_DESC[hLevel] || '';

  return `你是掌管靈獸孵化池的「賽博玄學解籤師」。使用者會輸入最直白的飲食紀錄，你需要「自動推算 MBEI 屬性」、「賜予玄幻菜名」，並生成「能量觀測詩籤」。

## 本次進食資料
- 食物：${foodName}
- 爽度與身體感受：${moodText}、${bodyFeeling}（${bodyDesc}）
- 情境與執念：${context && String(context).trim() ? String(context).trim() : '（未填）'}
- 進食時間：${mealTime} ${mealType}

## 食材造化 np_score（整數 -50～+50，必填，僅此一軸由你判定）
依食物「${foodName}」在加工煉化(P)↔原野自然(N)光譜給分（系統另算 MB/HL/RV，勿輸出 mbei_scores 全組）：
- **+50**：純原型（水煮蛋、清燙蔬菜、鮮肉塊、生魚片）
- **+25**：輕度烹調原型（雞肉飯、煎牛排、炒青菜、家常便當）
- **-25**：中重度調味/複合（牛肉麵、義大利麵、滷味、水餃）
- **-50**：高度人工煉化（鹹酥雞、洋芋片、手搖飲、泡麵、超商甜點）
可選中間值，但須貼近上述四檔之一；禁止固定套用同一數字。

## 功德（meritEarned，整數 1～3）
- 未填情境：1
- 有填但簡短：2
- 反思深入、情緒具體、字數多：3
可略高於字數規則，但不可超過 3。

## 御膳賜名
提取食物核心，轉為修真/宮廷風格（例：雞肉飯 → 玉粒白羽膳；洋芋片 → 煉火金磚）。

## 規則
1. 絕不暴雷具體神獸名稱，只描繪「蛋的狀態」或「孵化池波動」
2. 吃垃圾食物寫成「渡劫」「獻祭」，吃健康寫成「修仙」
3. 不用現代營養學詞彙（卡路里、碳水等）
4. 僅輸出 JSON

## 輸出格式（Strict JSON，勿含 markdown）
{"np_score":整數,"meritEarned":1到3,"merit_point":"+N 功德","mythical_food_name":"四到六字玄幻菜名","original_food_name":"（原：食物名）","main_title":"七字對聯","poem":"四句詩","explanation":"神解一句","do":"宜：建議","next_meal":"下餐宜：建議"}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '未設定 OPENAI_API_KEY' });

  const visionModel = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';

  const { action } = req.body || {};

  try {
    if (action === 'vision') {
      const { base64, mimeType } = req.body;
      if (!base64) return res.status(400).json({ error: '缺少 base64' });

      const text = await chatCompletion(apiKey, {
        model: visionModel,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: '你是食物辨識助手。看照片判斷最主要的一道食物或飲品，只回傳 JSON：{"food":"繁體中文名稱，12字內"}。若無法辨識則 food 為「未辨識」。不要其他說明。',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` },
            },
          ],
        }],
        response_format: { type: 'json_object' },
        max_tokens: 128,
      });

      const parsed = JSON.parse(text);
      const food = (parsed.food || '').trim();
      if (!food || food === '未辨識') {
        return res.status(422).json({ error: '無法辨識這張照片' });
      }
      return res.status(200).json({ food });
    }

    if (action === 'fortune') {
      const { recordData } = req.body;
      if (!recordData) return res.status(400).json({ error: '缺少 recordData' });

      const text = await chatCompletion(apiKey, {
        model: textModel,
        messages: [
          { role: 'system', content: '你只輸出合法 JSON，不要 markdown。' },
          { role: 'user', content: buildFortunePrompt(recordData) },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1200,
      });

      const parsed = JSON.parse(text);
      return res.status(200).json({ fortune: normalizeFortunePayload(parsed, recordData) });
    }

    if (action === 'image') {
      const { prompt, size } = req.body;
      if (!prompt) return res.status(400).json({ error: '缺少 prompt' });

      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: imageModel,
          prompt: String(prompt).slice(0, 1000),
          n: 1,
          size: size || '1024x1024',
        }),
      });
      const imgData = await imgRes.json().catch(() => ({}));
      if (!imgRes.ok) {
        return res.status(imgRes.status).json({ error: formatOpenAIError(imgRes.status, imgData) });
      }
      const url = imgData?.data?.[0]?.url;
      if (!url) return res.status(502).json({ error: '生圖無回傳 URL' });
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: '未知 action，請用 vision | fortune | image' });
  } catch (err) {
    console.error('[openai]', err);
    return res.status(err.status || 500).json({ error: err.message || '伺服器錯誤' });
  }
};
