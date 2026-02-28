## 🍪 Cookie Payback Planner

✔️ 使用此模組時 **不會停用成就**。

用數學把餅乾變成理性的購買決策。  
不必猜 🤔 —— 直接得到清楚、有效率的 **下一筆最佳購買** 🚀。

---

## 🧩 拆分說明
`main.js` 已拆分為多個 TypeScript 模組，入口為 `src/index.ts`，透過 esbuild 打包輸出根目錄 `main.js`。

## 🚀 開發部署
- 在 `.env` 設定 `DEPLOY_MOD_PATH` 為你的 Cookie Clicker workshop mod 目錄。
- 執行 `npm run deploy` 會自動：
  - build 最新 `main.js`
  - 複製 `main.js` / `info.txt` / `thumbnail.png` 到 `DEPLOY_MOD_PATH`
  - 產生 `deploy-manifest.json`（含版本與 build hash）
- 遊戲內 mod 會輪詢 `deploy-manifest.json`，偵測到新版後只重載自身，並接續原本 tick 節奏，避免 timer 疊加。

## 📈 回本效率指標
查看任何建築或升級多快能回收你的 CPS 投資 ⏱️。

- **🏗️ 階層升級規劃** — 立即知道為解鎖下一階層而多買建築是否值得。
- **🌈 智慧提示** — 視覺提示告訴你哪些選項不是最完美，但能更快通往更強升級。
- **🎨 自訂顏色** — 調整效率顏色以符合你的喜好。

## ⏳ 物品倒數計時
精準顯示距離你能買下下一個建築或升級 **還要多久** —— 不用再手算。

## 🏦 餅乾銀行策略
設定基於 CPS 的存款目標，最佳化 **Lucky!** 等重大加成 ✨。

## 📊 依回本排序
自動依 **回本效率最佳優先** 排序建築與升級。

- **🧙‍♂️ 排除魔法塔（可選）** — 將魔法塔排除於計算外，維持施法節奏一致。

## 🤖 自動購買模式
依當前回本效率自動購買最佳選項 —— 適合偏放置的遊戲方式。

---

## 🔗 資源
- 📐 [設計與數學深度解析](https://docs.google.com/presentation/d/e/2PACX-1vQp7InxIx3edc27Q7gHLh5Imk4tE4CJdikBvQXP8oLmiGk5PNwoEjAvWqK6ZhdAbe4vflkm-VqSsu5D/pub?start=false&loop=false)
- 🐞 [回報問題到 GitHub](https://github.com/cometjc/Cookie-Payback-Planner/issues)