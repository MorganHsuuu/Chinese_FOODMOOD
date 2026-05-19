## 1. 修改 LoginGate 元件介面

- [x] 1.1 依照「決策：保留 LoginGate，透過 prop 區分登入狀態」在 `index.html` 的 `LoginGate` 函式簽名中加入 `existingProfile` prop（預設為 `null`），使元件可接受已登入使用者的 profile 物件。完成後：`LoginGate({ onLogin, existingProfile = null })` 可正常解構，不傳 `existingProfile` 時行為與原本相同。驗收：重新整理頁面（未登入狀態）仍可看到「開始修行」按鈕且表單流程不變。

- [x] 1.2 依照「決策：已登入時使用「歡迎回來，[暱稱]」替換蠟封按鈕」在 `LoginGate` 的 splash 畫面（`step === 'splash' || step === 'leaving'` 分支）中，根據 `existingProfile` 的值條件式渲染底部按鈕區域，滿足「Returning user entry button shows personalized welcome」需求：`existingProfile` 非 null 時顯示「歡迎回來，[nickname]」文字及進入按鈕；為 null 時顯示原本的蠟封按鈕。驗收：已登入狀態下開啟 app，畫面底部出現含使用者暱稱的歡迎按鈕，不出現「開始修行」。

- [x] 1.3 為「歡迎回來」按鈕綁定 click handler：執行 fade-out 動畫（設 `step = 'leaving'`），600ms 後呼叫 `onLogin(existingProfile)`，直接帶已登入 profile 回到主畫面，不進入 `step === 'form'`，滿足「LoginGate accepts existingProfile prop — form is never shown」需求。驗收：點擊「歡迎回來」按鈕後，開場淡出，主畫面出現，`loginProfile` 與重整前的 profile 相同（暱稱一致）。

## 2. 修改 App() 渲染邏輯

- [x] 2.1 在 `App()` 中移除第1184行的 `if (!loginProfile) return <LoginGate onLogin={handleLogin} />` early return，改為在 `loginProfile` 有值時渲染主畫面、無值時由 `LoginGate` 完成登入——但不論哪種狀態，都先經過 `LoginGate` 顯示開場，滿足「Splash shown on every app open」需求。具體做法：加入 `const [splashDone, setSplashDone] = useState(false)` state；`!splashDone` 時永遠渲染 `<LoginGate onLogin={handleLogin} existingProfile={loginProfile} />`；`handleLogin` 與已登入的歡迎按鈕 handler 完成後呼叫 `setSplashDone(true)`。驗收：已登入與未登入狀態下，重整頁面都會先看到開場動畫，不會直接跳進主畫面。

- [x] 2.2 確認 `handleLogin` 函式在「已登入使用者點擊歡迎按鈕」情境下不會重複寫入 localStorage。由於 `onLogin(existingProfile)` 傳入的是已存在的 profile，`handleLogin` 的 `saveProfiles` 和 `setLoginProfile` 呼叫結果應與原本相同（idempotent）。驗收：已登入使用者開啟 app 並點擊「歡迎回來」後，localStorage 的 `profiles` 和 `activeUser` 內容不變，主畫面資料（紀錄、設定）與點擊前一致。

## 3. 今日頁面卡片可見度修正

- [x] 3.1 在 `HomeView` 函式中，將 `card` 樣式物件的背景由 `rgba(21,13,0,0.7)` 改為 `#252016`（paper 色）、邊框改為 `1px solid #3a3020`（stroke 色）、加入 `boxShadow:'0 8px 30px rgba(135,123,115,0.08)'`（shadow-card），使今日頁卡片視覺層次與修身頁卡片一致。驗收：今日頁面四張卡片（宜忌、型格、箴言、趨勢）在深色背景上清晰可見，不再與 `--night` 背景融為一體。

## 4. 電腦版頁籤切換晃動修復

- [x] 4.1 在 `index.html` 的 `<style>` 區塊新增 `html { overflow-y: scroll; }`，確保 scrollbar 佔位空間永久保留，消除切換頁籤時因 scrollbar 出現/消失（約 17px）造成的版面水平位移。驗收：在桌面版依序切換今日、曆卡、洞察、修身頁籤，頁面不發生水平位移或晃動。

## 5. 排行榜角色點擊進入大卡片

- [x] 5.1 在 `ProfileView` 排行榜列表（`board.map`）中，為每一列 `<div>` 加入 `onClick={() => { setSelectedCreature(MBEI_TYPES[user.code]); setCreatureNavEnabled(false); }}` 與 `cursor:'pointer'`，16 種角色均可點擊開啟角色大卡片 modal。驗收：在排行榜（個人或 MBEI 分頁）點擊任意角色列，角色大卡片正確開啟並顯示對應角色的圖片、型格名稱、描述與箴言。

## 6. 大卡片導覽邏輯依開啟來源區分

- [x] 6.1 在 `ProfileView` 新增 `creatureNavEnabled` boolean state（預設 `true`）；圖鑑開啟大卡片時設為 `true`，排行榜開啟時設為 `false`；modal 的左右按鈕、頁碼顯示與觸控滑動手勢均依此 flag 條件渲染。驗收：從排行榜開啟大卡片 → 無左右按鈕、無頁碼、無滑動切換；從圖鑑開啟大卡片 → 左右按鈕、頁碼、滑動切換均正常運作。
