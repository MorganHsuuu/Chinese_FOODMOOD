## Why

此次迭代涵蓋兩類修改：

**開場動畫**：目前開場動畫（壁畫滿版淡入、金線框、蠟封按鈕）僅在使用者尚未登入時顯示，已登入的使用者直接跳過 `LoginGate` 進入主畫面，完全看不到精心設計的開場儀式。這個開場動畫是 app 核心氛圍的重要一環，不應只出現在第一次登入時。

**UI 可用性修正**：在開發過程中同步修正四個視覺與互動問題：今日頁面卡片與背景融為一體；電腦版切換頁籤時版面因 scrollbar 出現/消失而晃動；排行榜角色無法點擊查看詳細介紹；從排行榜開啟的大卡片不應有左右切換功能。

## What Changes

**開場動畫：**
- `App()` 不再在 `loginProfile` 有值時直接跳過 `LoginGate`，改為永遠先渲染開場畫面
- `loginProfile` 改為 `useState` lazy initializer 同步讀取，消除開場畫面的閃爍問題
- `LoginGate` 接受新 prop `existingProfile`，當值存在時底部按鈕改為「歡迎回來，[暱稱]」，點擊後直接進入主 app，不需填寫表單
- 未登入使用者的流程完全不變：點擊「開始修行」→ 填寫表單 → 進入主 app

**UI 可用性修正：**
- 今日頁面卡片背景由 `rgba(21,13,0,0.7)` 改為 `#252016`（paper 色），加入 stroke 邊框與 shadow-card，與修身頁卡片風格一致
- `html { overflow-y: scroll }` 確保 scrollbar 位置永久保留，消除切換頁籤時的版面晃動
- 排行榜每列加入 `onClick` handler，點擊後開啟角色大卡片介紹（`selectedCreature` modal）
- 新增 `creatureNavEnabled` state 區分開啟來源：從排行榜開啟時關閉左右切換與頁碼，從圖鑑開啟時保持切換功能不變

## Non-Goals

- 不新增「跳過動畫」的設定選項
- 不修改動畫的播放時長或視覺效果本身
- 不加入「每日首次」或「每次開啟」的 session 判斷邏輯（每次開啟都顯示）

## Capabilities

### New Capabilities

- `splash-for-returning-users`: 已登入使用者每次開啟 app 也能看到開場動畫，並以「歡迎回來」按鈕直接進入主畫面

### Modified Capabilities

（無既有 spec 涉及 splash、onboarding 或卡片視覺行為）

## Impact

- Affected specs: `splash-for-returning-users`（新增）
- Affected code:
  - Modified: `index.html`
