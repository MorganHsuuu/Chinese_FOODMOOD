## Context

`index.html` 是單一檔案的 React app（CDN React + Babel Standalone）。`LoginGate` 元件（第389行）內含完整的開場動畫：壁畫滿版淡入、金線角框、底部標題 slide-up、蠟封按鈕。`App()` 在 `useEffect` 讀取 localStorage 後，若 `loginProfile` 有值則直接 early return 渲染主畫面，`LoginGate` 永遠不被掛載，已登入使用者看不到開場。

## Goals / Non-Goals

**Goals:**
- 每次開啟 app 都顯示開場動畫，不論登入狀態
- 已登入使用者看到「歡迎回來，[暱稱]」按鈕，點擊直接進入主畫面
- 未登入使用者流程完全不變

**Non-Goals:**
- 不新增「跳過動畫」設定
- 不修改動畫視覺效果或時長
- 不加入 session 層級的「每日一次」限制

## Decisions

### 決策：保留 LoginGate，透過 prop 區分登入狀態

在三個方案中選擇修改 `LoginGate` 接受 `existingProfile` prop（方案 B），而非在 `App` 層加 `showSplash` state（方案 A）或抽出獨立 `SplashScreen` 元件（方案 C）。

**理由**：
- 動畫邏輯和開場 UI 已完整在 `LoginGate` 中，不需搬移
- 方案 A 需要把 `loginProfile` 往下傳並在 `App` 層管理額外 state
- 方案 C 改動最多，對單一 HTML 檔的 app 過度工程化
- `LoginGate` 職責從「未登入時的登入流程」擴展為「每次開啟的入場儀式」，語意合理

**替代方案：**
- 方案 A（App 層 showSplash state）：需要在 `App` 多管一個 state，且 early return 邏輯要拆成兩段
- 方案 C（獨立 SplashScreen）：最乾淨但改動最多，不符合這個 app 的單檔架構

### 決策：已登入時使用「歡迎回來，[暱稱]」替換蠟封按鈕

顯示包含使用者暱稱的歡迎文字，點擊後直接呼叫 `onLogin(existingProfile)`，不渲染表單（`step` 永遠不會到 `'form'`）。

**理由**：對已登入使用者顯示「開始修行 / Commence Journey」語意不對；加入暱稱讓體驗更有溫度，確認使用者知道是哪個帳號在使用。

## Implementation Contract

**行為（可觀察）：**
- 開啟 app 時，不論 localStorage 是否有 `activeUser`，開場畫面一律出現
- 已登入時：蠟封按鈕區域顯示「歡迎回來，[暱稱]」文字 + 一個按鈕，點擊後動畫淡出並進入主畫面
- 未登入時：顯示原本的「開始修行」蠟封按鈕，點擊後跳轉到表單頁，行為與現在完全相同

**介面變更：**
- `LoginGate({ onLogin })` → `LoginGate({ onLogin, existingProfile })`
  - `existingProfile`：`null | { nickname, email, gender, age }`
- `App()` 移除第1184行的 early return `if (!loginProfile) return <LoginGate ...>`，改為永遠渲染 `LoginGate`，並傳入 `existingProfile={loginProfile}`；`loginProfile` 有值後再渲染主畫面

**失敗模式：**
- `existingProfile` 為 `null`（未登入）→ 走原本表單流程，無變化
- `existingProfile` 存在但 `nickname` 為空字串 → 按鈕文字顯示「歡迎回來」（不含名稱），仍可正常進入

**驗收條件：**
1. 已登入狀態重新整理頁面 → 開場畫面出現，底部顯示「歡迎回來，[暱稱]」按鈕
2. 點擊按鈕 → 動畫淡出 → 主畫面出現，`loginProfile` 與重整前相同
3. 登出後重新整理 → 開場畫面出現，顯示「開始修行」蠟封按鈕
4. 未登入時填寫表單並送出 → 進入主畫面，行為與現在相同

**Scope 邊界：**
- In scope：`index.html` 中 `LoginGate` 與 `App` 的修改
- Out of scope：localStorage 結構、其他元件、CSS 動畫關鍵幀

## Risks / Trade-offs

- [風險] 每次開啟都跑動畫，使用者可能覺得慢 → Mitigation：動畫總時長約 1.5 秒，且已登入狀態不需等待表單，可接受；若未來有需求再加跳過按鈕
- [取捨] `LoginGate` 職責略微擴大 → 對此 app 的單檔架構影響極小，不值得拆元件
