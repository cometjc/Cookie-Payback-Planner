## 🍪 Cookie Payback Planner

✔️ 使用此模組時 **不會停用成就**。

用數學把餅乾變成理性的購買決策。  
不必猜 🤔 —— 直接得到清楚、有效率的 **下一筆最佳購買** 🚀。

---

## 購買批次與實驗加速

自動購買選10／100時補至下一個10／100倍數。例如123件選100，整批買77件至200；已200件則下一批至300。整批價格及銀行保留額不足時等待，不先買零散數量。升級維持原生單次購買。

嚴格產量投影預設啟用；只加速已驗證的遊戲2.053來源與資料，未知版本、函式或模組效果回原生計算。正常啟動才能取得Pantheon來源綁定，熱載入可能回原生。這與下方的可選近似功能不同；已量測的效能改善與剩餘停頓見[結果報告](docs/performance-results.md)。

設定中的 Experimental bulk100 acceleration 預設關閉。僅遊戲2.053、bulk100且補到下一100倍數需要超過5單位時，在付得起價格及銀行額的區間嘗試端點插值；等待區間、終點及其他狀態使用原生計算。每次更新輪替核對一棟建築；未核對或上次核對已超過10秒者維持原生計算。失配即停用、整輪回原生並清除策略快取。兩次核對間可能推薦不同，核對本身也可能造成停頓，屬實驗功能。

日常驗證：`powershell -File scripts/dev.ps1 check`。最終遊戲效能須另做可見隔離副本量測；單元測試不能證明畫面不卡頓。
## 🧩 拆分說明
`main.js` 已拆分為多個 TypeScript 模組，入口為 `src/index.ts`，透過 esbuild 打包輸出 `dist/main.js`。

## 🚀 開發部署
- 在 `.env` 設定 `DEPLOY_MOD_PATH` 為你的 Cookie Clicker workshop mod 目錄。
- 執行 `npm run deploy` 會自動：
  - build 最新 `dist/main.js`
  - 複製 `dist/main.js`（部署時命名為 `main.js`）與 `info.txt` / `thumbnail.png` 到 `DEPLOY_MOD_PATH`
  - 產生 `deploy-manifest.json`（含版本與 build hash）
- 遊戲內 mod 會輪詢 `deploy-manifest.json`，偵測到新版後只重載自身，並接續原本 tick 節奏，避免 timer 疊加。

## 🧠 Cursor MCP 即時偵錯
- 專案已內建 `.cursor/mcp.json`，可透過 `npx` 啟動最新版 `chrome-devtools-mcp`。
- 建議先執行 `npm run inspect:mcp`（單一入口：啟動遊戲、附加 CDP、輸出 MCP session metadata）。
- 然後在 Cursor 直接用自然語言要求代理：
  - 啟動/附加目前 target
  - 執行 console/network/performance tracing
  - 回傳分析結果與修正建議
- 快速故障排除摘要：
  - 若連不到 `9222`，先重跑 `npm run inspect:mcp`
  - 若找不到 target，切回遊戲主畫面後執行 `npm run inspect:probe`
- 詳細流程、提示詞模板與端到端驗收請看 `docs/mcp-realtime-debug.md`。

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
- Windows 開發與效能比較：[常用指令](scripts/perf/README.md)、[比較設計](docs/performance-design.md)、[量測結果與限制](docs/performance-results.md)。
- 📐 [設計與數學深度解析](https://docs.google.com/presentation/d/e/2PACX-1vQp7InxIx3edc27Q7gHLh5Imk4tE4CJdikBvQXP8oLmiGk5PNwoEjAvWqK6ZhdAbe4vflkm-VqSsu5D/pub?start=false&loop=false)
- 🐞 [回報問題到 GitHub](https://github.com/cometjc/Cookie-Payback-Planner/issues)
