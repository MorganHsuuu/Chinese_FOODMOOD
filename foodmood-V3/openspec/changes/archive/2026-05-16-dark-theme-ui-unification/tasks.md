## 1. CSS 語義 token 定義

- [x] 1.1 依照「以 CSS 自訂屬性 + Tailwind arbitrary value 取代硬編碼」決策，在 `src/index.css` 的 `@theme {}` 區塊新增 7 個語義顏色 token（`--color-bg`、`--color-surface`、`--color-card`、`--color-text-primary`、`--color-text-secondary`、`--color-border`、`--color-border-subtle`），並採用「token 命名策略：語義而非視覺」原則命名（語義名而非 `--color-dark-1`）。App.tsx 中的硬編碼色改為 `bg-[var(--color-card)]` 格式引用這些 token。完成後執行 `npm run dev`，在 DevTools Elements 面板確認 `:root` 下可看到這 7 個 CSS 變數。

- [x] 1.2 將 `src/index.css` `@layer base` 中的 `body` 背景從 `bg-[#EAE4D9]`、文字從 `text-[#2C2623]` 改為使用 `var(--color-bg)` 和 `var(--color-text-primary)`，確保語義 token 系統（Semantic color tokens defined in CSS）的基底生效。驗證：瀏覽器打開 app，整體底色應為 `#1A1714` 深褐黑。

## 2. 版面背景替換

- [x] 2.1 將 `src/App.tsx` 最外層 `div`（App component）的 `bg-[#EAE4D9]` 改為 `bg-[var(--color-bg)]`，確保一致深色背景（consistent dark background across all views）在桌機版生效。驗證：桌機版整體頁面底色為深褐黑，無米色殘留。

- [x] 2.2 將 sidebar（`aside`）的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-surface)]`，使側邊欄與深色主題一致。驗證：桌機版側邊欄背景為 `#1E1C1A`，與頁面底色有輕微層次區別。

- [x] 2.3 將手機版 `header` 的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-surface)]`。驗證：手機版頂部 header 呈深色，文字 `text-[#2C2623]` 同步改為 `text-[var(--color-text-primary)]` 確保可見。

- [x] 2.4 將 `main` 的 `bg-[#FAF8F5] md:bg-transparent` 改為 `bg-[var(--color-surface)]`，統一手機和桌機的 main 區背景（consistent dark background across all views，消除 `md:bg-transparent` 問題）。驗證：手機版 main 區不再出現白色背景。

## 3. 卡片與區塊背景替換

- [x] 3.1 將 `src/App.tsx` 中所有 `bg-white` 的卡片（HomeView、AlmanacView、InsightView、ProfileView 裡的 `section`/`div` card）改為 `bg-[var(--color-card)]`。涉及的卡片包含：almanac card、MBEI type card、community insight card、calendar card、insight personal/group cards、profile header card、leaderboard card、badge boxes、group cards。驗證：`npm run dev` 後所有卡片背景為 `#252220`，無白色卡片殘留。

- [x] 3.2 將所有 `bg-[#F4EFE6]` 用途分情境替換：作為「pill/tag 背景」的改為 `bg-[var(--color-border-subtle)]`；作為「icon 區塊背景」（如 emoji 容器）的改為 `bg-[var(--color-card)]`；作為「section 淡色背景」（如 `bg-[#F4EFE6]/30` 的 RecordSection wrapper）的改為 `bg-[var(--color-border-subtle)]`。驗證：各類背景在深色底下仍有層次感，不呈現純黑。

- [x] 3.3 將所有 `border-[#EAE4D9]` 改為 `border-[var(--color-border)]`，將 `border-[#F4EFE6]` 改為 `border-[var(--color-border-subtle)]`，確保卡片邊框在深色底下可見。驗證：卡片輪廓清晰可辨，非純黑邊框融入背景。

## 4. 文字顏色替換（無障礙修復）

- [x] 4.1 將所有 `text-[#2C2623]` 改為 `text-[var(--color-text-primary)]`（包含標題 h1/h2/h3/h4、卡片正文、排行榜名稱等）。驗證：主要文字在 `#252220` 背景上清楚可讀，DevTools Accessibility 面板確認對比度 ≥ 4.5:1（WCAG AA contrast ratio for text）。

- [x] 4.2 依照「次要文字色提亮至 `#B5A99E`」決策，將所有 `text-[#877B73]` 改為 `text-[var(--color-text-secondary)]`（包含日期/副標題/label/次要說明文字等），`--color-text-secondary` 值設為 `#B5A99E`。驗證：次要文字（`#B5A99E` on `#252220`）對比度約 5.7:1，在 DevTools Accessibility 面板確認通過 AA 標準。

## 5. Modal 與浮層背景替換

- [x] 5.1 將 `RecordModal` 的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-surface)]`，header 區的 `bg-white/50` 改為 `bg-[var(--color-card)]/50`，底部送出區的 `bg-white/70` 改為 `bg-[var(--color-surface)]/80`。驗證：RecordModal 打開後呈深色背景，輸入框和 section 可清楚辨識。

- [x] 5.2 將 `RecordModal` 內的輸入框（`input`、`textarea`、`select`）的 `bg-white` 改為 `bg-[var(--color-card)]`，`text-[#2C2623]` 改為 `text-[var(--color-text-primary)]`，確保表單在深色主題下可使用。驗證：表單欄位底色為深灰，文字清晰可見，placeholder 文字改為 `placeholder:text-[var(--color-text-secondary)]`。

- [x] 5.3 將 `ResultModal`（unlocked 版）的 `bg-white` 改為 `bg-[var(--color-surface)]`，header 區的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-card)]`，內層 `bg-[#F4EFE6]` summary 區改為 `bg-[var(--color-border-subtle)]`。驗證：ResultModal 呈深色外觀，emoji 和文字清晰可讀。

- [x] 5.4 將 Encyclopedia modal（`showEncyclopedia`）的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-surface)]`，各 type card 的 `bg-white` 改為 `bg-[var(--color-card)]`，header 區 `bg-white/50` 改為 `bg-[var(--color-card)]/50`。驗證：Encyclopedia modal 開啟後為深色，16 型卡片清晰可辨。

## 6. LoginGate 替換

- [x] 6.1 將 `LoginGate` 的外層 `bg-[#EAE4D9]` 改為 `bg-[var(--color-bg)]`，登入 card 的 `bg-[#FAF8F5]` 改為 `bg-[var(--color-surface)]`，輸入框 `bg-white` 改為 `bg-[var(--color-card)]`，文字色同步調整為語義 token。驗證：登入頁呈深色主題，表單欄位可清楚填寫。

## 7. .gitignore 修復

- [x] 7.1 在 `.gitignore` 加入三行：`node_modules/`、`dist/`、`.env`，確保 node_modules 排除（gitignore excludes generated directories）。驗證：執行 `git status`，確認 `node_modules/` 目錄不出現在 untracked files 列表中。

## 8. 整合驗證

- [x] 8.1 執行 `npm run dev`，逐一切換 HomeView、AlmanacView、InsightView、ProfileView 四個頁面，確認無白色或米色背景殘留，所有卡片在深色底有明顯層次（card vs surface vs bg 有視覺差異）。

- [x] 8.2 使用瀏覽器 DevTools Accessibility 面板，抽查至少 3 處次要文字（`text-[var(--color-text-secondary)]`），確認對比度均 ≥ 4.5:1，通過 WCAG AA contrast ratio for text 要求。

## 9. 修正目標（index.html CDN 版）

> 實作過程發現使用者實際執行的是 `index.html`（CDN 版），非 Vite 版。本節記錄針對 `index.html` 執行的實際修改。

- [x] 9.1 修改 tailwind CDN config 色值而非重構色彩系統：將 `index.html` `tailwind.config.theme.extend.colors` 的 `parchment`（`#F4EFE6` → `#201d12`）、`stroke`（`#EAE4D9` → `#3a3020`）、`paper`（`#FAF8F5` → `#252016`）、`muted`（`#877B73` → `#c8b88a`）改為深色值；同步更新 `:root` 的 `--parchment`、`--stroke`、`--paper`、`--muted` CSS 變數。驗證：瀏覽器開啟 `index.html`，所有使用 `bg-parchment`、`bg-paper`、`border-stroke` 的卡片呈深色底。

- [x] 9.2 以 CSS `!important` override 解決 `bg-white` 問題：在 `index.html` `<style>` 區塊加入 `.bg-white { background-color: #252016 !important; }`，覆蓋 Tailwind 內建 `white`（無法透過 `theme.extend.colors` 改動）。驗證：原本 `bg-white` 的 header、modal、button 元素改呈深色背景。

- [x] 9.3 `text-ink` override 但保留 `bg-ink text-white` 按鈕樣式：加入 `.text-ink { color: #f5e0bb !important; }`，確保 `ink`（`#2C2623` 深棕）色文字在深色卡片上可見。`bg-ink text-white` 按鈕不受影響（`text-white` CSS 優先級高於 `.text-ink`）。驗證：文字顏色清晰可讀，`bg-ink` 按鈕的 `text-white` 文字不被 override。

## 10. 棄用 Vite/npm 版本清理

- [x] 10.1 刪除棄用的 Vite/npm 版本殘留：移除 `src/`（整個 Vite React 目錄）、`api/`（未使用的後端 serverless 函式）、`vite.config.ts`、`tsconfig.json`、`package.json`、`package-lock.json`、`.vite/`（Vite 快取）。驗證：專案根目錄僅剩 `index.html`、圖片資源、`openspec/`、`.claude/`、`.gitignore`、`.spectra.yaml`、`CLAUDE.md`、`README.md`、`metadata.json`。

## 11. 洞察頁型格卡片動態化

- [x] 11.1 將 `InsightView` function 改為接收 `records` props（原為無 props），並以 `React.useMemo` 計算過去 7 天紀錄中 `mbeiCode` 出現頻率最高的型格（`weekType`）；無紀錄時 fallback 為 `MPLR`。在呼叫端（`App` component 第 `activeTab === 'insight'` 判斷處）改為 `<InsightView records={records} />`。驗證：洞察頁「本週最常出現型格」區塊的 code 與 creature 名稱，與實際 records 中最常出現的 mbeiCode 對應的 `MBEI_TYPES` 條目一致。

- [x] 11.2 將「本週最常出現型格」卡片的 emoji icon（硬編碼 🦊）改為使用 `CREATURE_IMG[weekType.code]` 的 PNG 圖片：以 `<img src={CREATURE_IMG[weekType.code]} alt={weekType.creature} className="w-full h-full object-cover" />` 取代 `{weekType.emoji}` 文字，外層 div 加 `overflow-hidden` 並移除 `text-5xl`。驗證：型格卡片顯示 `openspec/asset/png/` 下對應的 PNG 圖片，圖片與名稱與圖鑑 16 型完全呼應。

## 12. Modal 深色半透明修正

- [x] 12.1 將 `RecordModal` header 的 `bg-white/50 backdrop-blur-md` 改為 `bg-parchment/80 backdrop-blur-md`，底部送出區的 `bg-white/70 backdrop-blur-xl` 改為 `bg-parchment/90 backdrop-blur-xl`。驗證：開啟「凝練食緒」Modal，header 與底部送出按鈕區呈深褐黑半透明，視覺風格與整體深色主題一致。
