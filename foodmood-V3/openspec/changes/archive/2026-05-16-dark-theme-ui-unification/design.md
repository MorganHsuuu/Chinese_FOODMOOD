## Context

**架構發現（重要）**：本專案實際上存在兩套獨立的 app 實作：
- `index.html`（CDN 版）：使用者實際執行的 app，單一 HTML 檔案，包含 CDN React、CDN Tailwind（附 `tailwind.config` 自訂色彩）、Babel standalone，無需任何 build step
- `src/App.tsx`（Vite 版）：另一套 React+TypeScript+Vite 實作，從未被使用者使用，現已確認棄用並全數刪除

`index.html` 的色彩系統：採用語義化色名（`parchment`、`stroke`、`paper`、`muted`、`ink`、`jade`、`clay`、`night`、`cream`）在 Tailwind CDN config 的 `theme.extend.colors` 中定義，並在 `:root` 有對應 CSS 變數。原色值均為亮色系，body 已是深色（`--night: #1b1200`），造成卡片（`bg-parchment`、`bg-paper`、`bg-white`）呈白底、頁面呈深底的視覺衝突。

## Goals / Non-Goals

**Goals:**
- 將 `index.html` Tailwind config 的卡片/介面色（`parchment`、`stroke`、`paper`、`muted`）改為深色值
- 同步更新 `:root` CSS 變數，確保 `var(--parchment)` 等 inline 用法也生效
- 以 CSS `!important` override 解決 Tailwind 內建 `white` 無法透過 `extend.colors` 覆蓋的問題
- 確保 `text-ink` 在深色卡片背景上可讀（WCAG AA ≥ 4.5:1）
- 修復 `.gitignore`
- 刪除棄用的 Vite/npm 版本殘留檔案

**Non-Goals:**
- 不實作 light/dark 切換開關
- 不改動版面、動畫、功能邏輯
- 不引入新的 npm 套件

## Decisions

### 修改 Tailwind CDN config 色值而非重構色彩系統

**選擇**：直接改動 `index.html` 中 `tailwind.config.theme.extend.colors` 的 `parchment`、`stroke`、`paper`、`muted` 值為深色，保留所有現有 class 名不變。  
**原因**：`index.html` 整體使用 `bg-parchment`、`bg-paper`、`border-stroke` 等語義色名，若改色名需全檔替換；直接改值影響最小，所有 class 自動生效。  
**備選方案**：全域替換 class 名 — 工作量過大且增加出錯機會，故不採用。

### 以 CSS `!important` override 解決 `bg-white` 問題

**選擇**：在 `<style>` 區塊加入 `.bg-white { background-color: #252016 !important; }`。  
**原因**：Tailwind CDN 的 `white` 是內建顏色，`theme.extend.colors` 無法覆蓋它，只能加入自訂 class；`!important` 確保優先級。

### `text-ink` override 但保留 `bg-ink text-white` 按鈕樣式

**選擇**：加入 `.text-ink { color: #f5e0bb !important; }`，但 `bg-ink text-white` 的按鈕不受影響。  
**原因**：`ink: '#2C2623'` 是深棕色，在深色卡片上幾乎不可見；但 `bg-ink`（深棕底）搭配 `text-white` 的按鈕 pattern 必須保留。`text-white` 的 CSS specificity 高於 `.text-ink` override，因此按鈕安全。

### 刪除棄用的 Vite/npm 版本

**選擇**：刪除 `src/`、`api/`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`.vite/`。  
**原因**：確認使用者不使用 Vite 版本後，殘留檔案（尤其 `node_modules/` 數百 MB）造成混亂；清理後專案結構更清晰，減少未來誤改錯誤目標的風險。

## Implementation Contract

**行為**：
- 所有卡片（原 `bg-parchment`、`bg-paper`、`bg-white` 等）呈現深灰褐底色（約 `#252016`）
- 所有介面文字在深色底上清楚可讀，對比度 ≥ 4.5:1（WCAG AA）
- body 深色背景（`--night: #1b1200`）與卡片深色保持視覺層次

**實際色值對應**：

| 色名 | 原值（亮色） | 新值（深色） | 用途 |
|------|-------------|------------|------|
| `parchment` | `#F4EFE6` | `#201d12` | 主要卡片背景 |
| `stroke` | `#EAE4D9` | `#3a3020` | 邊框 |
| `paper` | `#FAF8F5` | `#252016` | 次要卡片背景 |
| `muted` | `#877B73` | `#c8b88a` | 次要文字、副標題 |

**CSS Override（解決 Tailwind 內建色問題）**：
- `.bg-white { background-color: #252016 !important; }`
- `.text-ink { color: #f5e0bb !important; }`

**接受標準**：
1. 用瀏覽器直接打開 `index.html`，切換至各頁面（首頁、曆卡、洞察、修身），所有卡片應呈深色底，無白色或米色殘留
2. 次要文字（`muted` / `text-muted`）在深色卡片上對比度 ≥ 4.5:1
3. 執行 `git status`，確認已刪除的 Vite 檔案不再出現，`node_modules/` 不在未追蹤清單

**範圍邊界**：
- 在 scope：`index.html` 色彩修改、`.gitignore` 修復、棄用 Vite 版本刪除
- 不在 scope：強調色（`clay: #C04A3B`、`forest: #4A6B5D`、`amber: #D98A5B`）、功能邏輯、版面動畫

## Migration Plan

1. 修改 `index.html` `tailwind.config.theme.extend.colors` 中的 `parchment`、`stroke`、`paper`、`muted` 值
2. 修改 `index.html` `:root` CSS 變數（`--parchment`、`--stroke`、`--paper`、`--muted`）
3. 在 `index.html` `<style>` 區塊加入 `.bg-white` 和 `.text-ink` override
4. 修改 `.gitignore`
5. 刪除棄用 Vite/npm 版本相關檔案
6. 用瀏覽器開啟 `index.html` 視覺驗證
