## Why

本專案存在兩套獨立實作：
1. **`index.html`（CDN 版）**：使用者實際執行的 app，採用 CDN React + Tailwind，無需 build step
2. **`src/App.tsx`（Vite 版）**：另一套 React+TypeScript+Vite 實作，使用者從未使用

`index.html` 的 Tailwind CDN config 採用語義化色名（`parchment`、`stroke`、`paper`、`muted`、`ink`）搭配 `:root` CSS 變數，但所有色值均為亮色系（`parchment: #F4EFE6`、`paper: #FAF8F5` 等），導致卡片呈現白底。body 背景已是深色（`--night: #1b1200`），產生視覺不一致。次要文字色 `muted: #877B73` 在白底對比度約 3.1:1，未達 WCAG AA（4.5:1）。

## What Changes

- 將 `index.html` Tailwind CDN config 的 `parchment`、`stroke`、`paper`、`muted` 色值全數改為深色系（分別為 `#201d12`、`#3a3020`、`#252016`、`#c8b88a`）
- 同步更新 `index.html` `:root` 中的對應 CSS 變數（`--parchment`、`--stroke`、`--paper`、`--muted`）
- 加入 CSS override：`.bg-white { background-color: #252016 !important; }` 覆蓋 Tailwind 內建 `white`（無法透過 `extend.colors` 改動）
- 加入 CSS override：`.text-ink { color: #f5e0bb !important; }` 確保 `ink` 色文字在深色卡片上可見（`bg-ink text-white` 的按鈕不受影響，`text-white` 優先級更高）
- 修復 `.gitignore`，加入 `node_modules/`、`dist/`、`.env`
- 刪除不使用的 Vite/npm 版本殘留：`src/`、`api/`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`.vite/`

## Non-Goals

- 不實作 light/dark 切換機制（固定深色主題）
- 不改動 app 的功能邏輯或資料流
- 不調整動畫或版面排版
- 不修改 Vite 版本（`src/App.tsx` 等）—該版本已確認棄用並刪除

## Capabilities

### New Capabilities

- `ui-color-token-system`: 在 `index.html` 的 CDN Tailwind config 和 `:root` CSS 變數建立深色語義化色彩系統，統一全站深色主題外觀並達到 WCAG AA 對比度標準

### Modified Capabilities

（無，目前無現有 spec 需更新）

## Impact

- Affected specs: `ui-color-token-system`（新建）
- Affected code:
  - Modified: `index.html`（Tailwind CDN config 色值、`:root` CSS 變數、CSS override 規則）
  - Modified: `.gitignore`
  - Removed: `src/`（整個 Vite React 版本目錄）
  - Removed: `api/`（未使用的後端 serverless 函式）
  - Removed: `vite.config.ts`
  - Removed: `tsconfig.json`
  - Removed: `package.json`
  - Removed: `package-lock.json`
  - Removed: `.vite/`（Vite 快取目錄）
