# 共存模組效能改善計畫

## 目標

- 比較現況、indexed、compiled、search；保留推薦品質，降低重生、自購及bulk100的統計更新卡頓。
- 提供安全自動啟停、固定快照、採樣、比較、flamegraph及日常驗證入口。
- 主庫：`D:\repo\Cookie-Payback-Planner`；工作樹：`.worktrees/performance`，分支`codex/performance`。
- 結果與限制：[效能報告](../../docs/performance-results.md)；[支援契約](../../docs/performance-design.md)；[增量模型](../../docs/incremental-simulation.md)；[演算法研究](../../docs/search-algorithm-research.md)。

## 決策

- 預設嚴格投影；近似`experimentalBatch=false`。未知版本／來源／hook／資料回原生，不追認既有Pantheon helper。
- 使用者指定統計更新≤100ms驗收；以固定共存模組及快照的三輪自然量測逐筆檢核，不宣稱未知狀態或未來模組的普遍時間保證。
- 保留既有搜尋設定；研究建議Beam，不改寫玩家目前A*設定。Rust／WASM、跨tick模型及frontier共用暫不採用。
- x10／x100補下一持有量倍數；整批價格及銀行額不足不開始。保留浮點扣款順序，不以等比總價取代原生價格。
- 不在修改Game的sandbox內async yield，不跨tick混基底。黑箱紀錄僅作提示，不能取代未知條件核對。
- 拒採：完整JSON key及capture結構比較模型cache、guard名稱傳遞、Has／tier改寫、來源不明快取、eager銀行上界預檢、literal-only升級guard縮表、條件式省略逐棟投影輸出、空patch重用branch、特殊tier靜態預計算、僅憑連續投影共用capture、單候選capture／fork四項局部微調、無一致性協議的提前局部刷新；詳證留報告，不重做同一原型。
- 尊重vault與排除設定；toggle先保留手動策略提示，不直接擴張自購。建議見支援契約。
- 依AGENTS.md維護：本檔只放目標、決策、待辦、最新續接；測試細節放報告，原始資料放ignored tmp/；每個已驗階段立即MVC commit。

## 待辦

- [x] 四方案自動比較、同輸入品質核對、程序ownership與單實例保護、隔離快照。
- [x] 原生CDP profiling／flamegraph；定位收益重算主成本。
- [x] 演算法、Rust／WASM、增量相依、黑箱升級條件與等比價格研究；保留限制與拒採依據。
- [x] 無UI原生核心smoke、隱藏副本功能驗證、可見自然負載驗收；保存常用scripts/dev.ps1入口。
- [x] 修正補倍數、自購整批銀行／付款與收益基底；近似可選、失配停用。
- [x] 嚴格投影已交付2053.73，原始非同步loader與16mods品質驗證通過。
- [x] 初始化／DOM／guard小切片分階段提交；兩個無收益原型撤除、證據提交。
- [x] 最新保留候選整合、備份部署、讀回hash；六輪品質與實購驗收通過。
- [x] 依100ms門檻完成2054.11自然驗收：新版三輪1,110次更新超標0；品質及實購安全核對通過，殘餘尖峰限制留報告。

## 最新續接點

- 正式：10691f6來源／2054.11，receipt tmp/alias-fences-deployment.json；兩項已驗別名結構回原生，bundle及metadata讀回一致，正式core／存檔hash未變，正式程序未啟動。
- 最新驗收：2054.11自然六輪tmp/final-strict-natural/1795324208806/final-assessment.json；新版更新最大84.20ms，1,110筆符合100ms門檻。六輪端點品質、實購銀行／倍數通過；fresh 202來源／101工具、typecheck／lint／build通過，重建hash等於部署版。
- CPU對齊trace仍屬2054.07：tmp/notation-text-stream-trace/1795319461050。集中到期與提前刷新拒採證據見報告；沒有藉延長時效或近似達標。
- 本輪交付完成，後續依日常入口重跑；不保證未知模組或未測狀態≤100ms。正式部署維持2054.11、owned已關閉；主庫原有`.husky/pre-commit`刪除保留，不提交。
- 缺失治理工具已有本次native Git／worktree／subagent替代授權；Windows原生提問，禁AUQ。外部任務未同步。

## 日常入口

- owning worktree執行`.\scripts\dev.ps1 check`、`.\scripts\dev.ps1 build`；其餘命令見scripts/perf/README.md。
- 啟動前核主程序與CDP；只停止owned PID＋CreationDate相符程序。正式存檔受保護，只重置已驗隔離副本。
- 比較固定快照、模組順序、設定，15秒暖機／60秒量測／各3輪隨機；進程分岔不宣稱因果倍數。
