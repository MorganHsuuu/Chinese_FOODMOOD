#!/usr/bin/env node
/**
 * 驗證 Notion 寫入欄位是否齊全
 * 用法：
 *   node scripts/verify-notion-fields.mjs
 *   NOTION_API_KEY=secret_xxx node scripts/verify-notion-fields.mjs --read-back
 *
 * 選填：API_BASE=https://chinese-foodmood.vercel.app
 */

const API_BASE = process.env.API_BASE || 'https://chinese-foodmood.vercel.app';
const READ_BACK = process.argv.includes('--read-back');
const NOTION_KEY = process.env.NOTION_API_KEY;

const EXPECT_FIRST = [
  'WhatFood', 'Email', '暱稱', '性別', '年齡',
  '日期', '時間', '餐別', '爽度', '身體感受',
  '功德', '功德總數', 'MB', 'NP', 'HL', 'RV', '情境', '詩籤',
];
const EXPECT_SECOND = EXPECT_FIRST.filter((c) => c !== '性別' && c !== '年齡');

const payload1 = {
  record: {
    whatFood: '完整欄位測試餐',
    date: '2026-05-19',
    mealTime: '18:30',
    mealType: '晚餐',
    mood: '很爽',
    bodyFeeling: '舒服飽足',
    meritEarned: 3,
    mbeiScores: { MB: 10, NP: -5, HL: 20, RV: 15 },
    context: '這是一段超過十五個字的情境反思測試內容',
    fortune: { main_title: '測試籤', poem: '一二三四五', explanation: '測試說明' },
  },
  user: { email: 'fieldtest@foodmood.app', nickname: '欄位測試君', gender: '女', age: '32' },
  meritTotal: 12,
  includeDemographics: true,
};

const payload2 = {
  record: {
    whatFood: '第二筆測試湯麵',
    date: '2026-05-19',
    mealTime: '19:00',
    mealType: '宵夜',
    mood: 4,
    bodyFeeling: '清爽有神',
    meritEarned: 1,
    mbeiScores: { MB: 0, NP: 0, HL: 0, RV: 0 },
    context: '',
  },
  user: { email: 'fieldtest@foodmood.app', nickname: '欄位測試君', gender: '女', age: '32' },
  meritTotal: 13,
  includeDemographics: false,
};

async function post(body) {
  const res = await fetch(`${API_BASE}/api/notion-record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function propValue(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return prop.title?.map((t) => t.plain_text).join('') || '';
    case 'rich_text':
      return prop.rich_text?.map((t) => t.plain_text).join('') || '';
    case 'number':
      return prop.number;
    case 'select':
      return prop.select?.name ?? '';
    case 'date':
      return prop.date?.start ?? '';
    case 'email':
      return prop.email ?? '';
    default:
      return prop[prop.type] ?? '';
  }
}

async function readPage(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  });
  return res.json();
}

function checkWritten(label, written, expected) {
  const missing = expected.filter((c) => !written.includes(c));
  const extra = written.filter((c) => !expected.includes(c) && c !== 'WhatFood');
  console.log(`\n── ${label} ──`);
  console.log('已寫入欄位:', written.join('、') || '（無）');
  if (missing.length) console.log('⚠️  預期有但未寫入:', missing.join('、'));
  else console.log('✅ 預期欄位皆有寫入');
  if (extra.length) console.log('ℹ️  額外欄位:', extra.join('、'));
}

function checkReadBack(label, props, expected) {
  console.log(`\n── ${label}（Notion 讀回）──`);
  for (const col of expected) {
    const v = propValue(props[col]);
    const empty = v === '' || v === null || v === undefined;
    if (col === '情境' && empty) {
      console.log(`  ${col}: （空，可接受）`);
    } else if (empty) {
      console.log(`  ❌ ${col}: （空）`);
    } else {
      console.log(`  ✅ ${col}: ${v}`);
    }
  }
  for (const col of ['性別', '年齡']) {
    if (!expected.includes(col)) {
      const v = propValue(props[col]);
      const has = v !== '' && v !== null && v !== undefined;
      console.log(has ? `  ⚠️  ${col}: 不應有值但為 ${v}` : `  ✅ ${col}: 未填（符合第二筆預期）`);
    }
  }
}

async function main() {
  console.log('API:', API_BASE);

  const r1 = await post(payload1);
  console.log('\n測試1 HTTP', r1.status, r1.data.ok ? 'OK' : r1.data.error);
  if (!r1.data.ok) {
    console.log(r1.data);
    process.exit(1);
  }
  if (r1.data.writtenColumns) {
    checkWritten('測試1（首次紀錄）', r1.data.writtenColumns, EXPECT_FIRST);
  } else {
    console.log('（線上 API 尚未回傳 writtenColumns，請 deploy 最新版後再跑）');
  }

  const r2 = await post(payload2);
  console.log('\n測試2 HTTP', r2.status, r2.data.ok ? 'OK' : r2.data.error);
  if (!r2.data.ok) {
    console.log(r2.data);
    process.exit(1);
  }
  if (r2.data.writtenColumns) {
    checkWritten('測試2（第二筆）', r2.data.writtenColumns, EXPECT_SECOND);
  }

  if (READ_BACK && NOTION_KEY) {
    const p1 = await readPage(r1.data.pageId);
    const p2 = await readPage(r2.data.pageId);
    if (p1.object === 'error') {
      console.error('讀取失敗:', p1.message);
      process.exit(1);
    }
    checkReadBack('測試1', p1.properties, EXPECT_FIRST);
    checkReadBack('測試2', p2.properties, EXPECT_SECOND);
  } else if (READ_BACK) {
    console.log('\n請設定 NOTION_API_KEY 才能讀回 Notion 實際內容');
  } else {
    console.log('\n請在 Notion 搜尋「完整欄位測試餐」或暱稱「欄位測試君」確認');
    console.log('若要自動讀回：NOTION_API_KEY=secret_xxx node scripts/verify-notion-fields.mjs --read-back');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
