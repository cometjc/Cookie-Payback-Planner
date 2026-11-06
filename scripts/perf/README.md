# Windows 即時效能量測

使用原生 Node 22 以上；不讀取專案 `.env`。路徑、CDP、語言與方案以 JSON 明確指定；相對路徑以設定檔所在目錄解析。

## 舊版本觀測與候選版本比較

已部署舊版本稱為 legacy 觀測組；候選版本內的 `baseline` 是候選原始計算路徑。兩者可能有不同設定、方法及腳本雜湊，不能視為同版。沒有 `performanceExperiment` API 的舊版只能使用未指定 builtin 的 baseline。

正式遊戲觀測可另存 `tmp/live-profile.json`：

```json
{
  "executable": "D:/SteamLibrary/steamapps/common/Cookie Clicker/Cookie Clicker.exe",
  "debugOrigin": "http://127.0.0.1:9222",
  "output": "./legacy-observation",
  "warmupMs": 15000,
  "sampleMs": 60000,
  "repetitions": 3,
  "seed": 20261101,
  "variants": [{ "id": "baseline" }]
}
```

```powershell
node scripts/perf/run.mjs attach tmp/live-profile.json
node scripts/perf/run.mjs collect tmp/live-profile.json
```

`attach` 完整資料寫入 `output/attach.json`，終端只顯示 PID、頁面、模組數、版本、實驗 API 與雜湊摘要。`collect` 只附接既有實例，不啟動遊戲、不載入正式存檔。自然運作的狀態漂移可能使資料只能供觀測。

逐輪診斷使用 `./scripts/dev.ps1 diagnose -Profile tmp/live-profile.json`。只附接既有遊戲，依 `sampleMs` 觀察（上限60秒），保存每輪耗時、原生收益重算次數、候選數與最慢候選；例外照常傳遞，結束還原觀察器。輸出含前後版本／設定／模組身分，最多10,000輪並標記截斷。這是含包裝負擔的診斷，不能當比較效能證據；不更動購買數量或嚴格／實驗設定。

隔離購買觀察器 `observePurchases` 遇到選10／100、購後持有量仍非倍數時，額外保存 `bulkViolation`：呼叫數量、應補數量與來源堆疊。199買1到200屬正確補齊，不標記；紀錄不能單憑堆疊判斷是本模組、其他模組或手動購買，須核對呼叫來源。

## 準備獨立副本

控制器先保存並正常關閉正式遊戲，記錄原本是否執行、正式模組雜湊與設定。目標目錄必須不存在，且不得與來源重疊。以下指令只複製檔案及建立快照，不啟動遊戲：

```powershell
node scripts/perf/isolation.mjs prepare "D:/SteamLibrary/steamapps/common/Cookie Clicker" "./tmp/perf-game" scripts/perf/profile.example.json
```

副本保留其他模組，另建存檔快照與專用 `userDataDir`，停用副本的 Steam 原生 bridge。來源存檔在複製途中改變、junction、符號連結或啟動程式不符預期時拒絕完成；有 `INCOMPLETE` 標記的副本不可啟動。

將本次已驗證建置的候選模組放入副本的 `resources/app/mods/workshop/BestDealHelper/`，保留舊版觀測與檔案雜湊。候選版本必須提供實驗 API；準備與比較都不覆蓋正式模組。

## 四方案比較

設定 `expectedPlannerSha256` 為本次建置的64字元小寫SHA256，可在任何重置或啟動前拒絕舊隔離bundle。以 `Get-FileHash dist/main.js -Algorithm SHA256` 取得後轉小寫；缺少此設定時仍只記錄實際script hash，不保證候選版本正確。

`profile.example.json` 為隔離比較設定，包含來源、目標、輸出位置及語言：

```json
{
  "sourceRoot": "D:/SteamLibrary/steamapps/common/Cookie Clicker",
  "isolationRoot": "../../tmp/perf-game",
  "executable": "../../tmp/perf-game/Cookie Clicker.exe",
  "debugOrigin": "http://127.0.0.1:9222",
  "output": "../../tmp/perf-comparison",
  "language": "ZH-CN",
  "warmupMs": 15000,
  "sampleMs": 60000,
  "repetitions": 3,
  "seed": 20261101,
  "readyTimeoutMs": 90000,
  "variants": [
    { "id": "baseline", "builtin": true },
    { "id": "indexed", "builtin": true },
    { "id": "compiled", "builtin": true },
    { "id": "search", "builtin": true }
  ]
}
```

```powershell
node scripts/perf/compare.mjs compare scripts/perf/profile.example.json
```

每方案暖機 15 秒、量測 60 秒、重複三次，以固定種子打亂順序。`language` 只處理已知的首次語言選擇畫面，不接受其他對話框；`ZH-CN` 是遊戲支援的語言識別字。各組採相同語言與共存模組。

高負載比較設定 `"buyBulk": 100`；每次副本就緒且可見後，透過遊戲的 `storeBulkButton` 切換購買模式與數量，再開始品質檢查及暖機。可指定 1、10、100，省略則沿用存檔；實際選擇保存於每次試驗的 `buy-bulk.json`，狀態快照另記 `buyMode`／`buyBulk`。

購買100可能在60秒內超過10萬次收益計算採樣上限。設定 `"observeGains": false` 可省略逐次收益計時，保留完整更新、試算、helper、畫格與長任務採樣，亦保留 `CalculateGains` 函式身分。兩組須使用相同設定；此時不提供逐次收益耗時分位數，CPU profiler仍可定位熱點。

`node scripts/perf/price-series.mjs "<遊戲目錄>/resources/app/src/main.js"`：離線載入實際 `getPrice`／`getSumPrice`，比較逐筆取整、遊戲批買、等比總價公式。內含可重跑assert；不連線遊戲。fixture限定無折扣、免費建築及hooks，用來揭露取整與浮點運算順序差異，不能證明完整推薦等價。

比較器要求正式遊戲已停止；每次試驗驗證副本及快照，還原副本存檔、啟動自己擁有的副本、等待遊戲與實驗 API 就緒，最後正常關閉該次程序。副本必須使用 manifest 的 `--user-data-dir`，不得共用正式遊戲瀏覽器資料。

相同存檔雜湊不代表執行期狀態相同：離線收益、時間、buff 與其他模組仍會漂移。比較器另核對狀態、設定、模組與腳本指紋，保存固定時點的數值、推薦排序、商店順序與自動購買候選品質檢查。背景畫面、零更新／畫格樣本或截斷資料會標為無效。

報表不自動選擇勝者，`winner` 保留空值。控制器須同時檢查量測有效、狀態可比較與推薦品質，才能裁決改善是否落地。搜尋方案可能改變推薦，不能沿用精確方案的相等性保證。

### 配對比較

副本已啟動且可見、正式遊戲已停止時，執行 `node scripts/perf/paired.mjs paired <profile.json>`。
設定須包含 `isolationRoot`；可設定 `rounds`（預設 5）、`queriesPerRound`（預設 3000）及 `offsets`。
每輪固定時刻、輸入及點擊收益，比較 baseline、indexed、compiled 的等待估算與輸出誤差；只證明該函式效能，不能推論整體更新或 FPS。

## Windows 常用指令

從任意目錄呼叫 `scripts/dev.ps1`，腳本會切換專案目錄，優先使用 Codex 的原生 Node，並支援工作樹共用依賴：

```powershell
.\scripts\dev.ps1 check
.\scripts\dev.ps1 build
.\scripts\dev.ps1 compare -Profile tmp/comparison-full.json
.\scripts\dev.ps1 attach -Profile tmp/live-profile.json
.\scripts\dev.ps1 paired -Profile tmp/paired-profile.json
```

`check` 執行型別、lint、來源測試與效能工具測試，任何失敗即停止。
`start`、`stop`、`collect` 也可作為 Task；需要明確指定 Profile，啟停沿用 ownership 與單實例檢查。

### 重建快速購買狀態

```powershell
.\scripts\dev.ps1 rebirth -Profile tmp/comparison-full.json
```

只接受已啟動、可見且開啟自動購買的已驗證隔離副本；正式遊戲須停止。執行飛升、等待三秒、核對程序身分、轉生並立即存檔，等待儲存完成。命令不啟停遊戲、不更新比較快照；控制器仍須將新存檔固定為下一輪快照。輸出目錄的 `rebirth-save.json` 記錄程序與完成時間，不包含存檔內容。

## 原始資料與還原責任

輸出保存模組順序、runtime／manifest 版本與來源、腳本 SHA-256、方法內容及雜湊、實驗路徑計數、設定、狀態、推薦排序、各次原始 CPU 採樣、更新／模擬／輔助計算／全域收益耗時、畫格間隔與長任務。觀察器本身有負擔，所有組別須用相同設定。

```powershell
node scripts/perf/run.mjs start tmp/live-profile.json
node scripts/perf/run.mjs stop tmp/live-profile.json
node scripts/perf/run.mjs query tmp/live-profile.json tmp/readonly-expression.js
node --test scripts/perf/perf.test.mjs
```

`start` 與舊啟動入口共用 canonical 執行檔鎖；已有主程序時，即使 CDP 失敗也拒絕重開。狀態不明的鎖不自動搶佔，控制器須人工核對程序後清理。工具無法阻止使用者同時從 Steam 啟動，仍會核對程序數量。`stop` 只正常關閉 ownership 檔記錄且 PID、建立時間吻合的程序，不強制終止。

比較器不會替控制器關閉或重新啟動正式遊戲。完成或失敗後，控制器須確認副本已退出、正式檔案與存檔未被試驗修改，依最初記錄恢復正式遊戲啟動狀態；原先未執行時不自行開啟。清理或還原失敗須保留證據並回報。

`query` 是明確指定檔案的程式執行介面，呼叫者須審查 expression 保持唯讀，本工具無法將任意 JavaScript 轉為安全沙箱。自訂 variant hook 同樣只接受受信任程式，格式為回傳 `{id, implementation, apply(planner), restore(planner)}` 的 expression；隔離比較器只接受內建方案，不執行外部 hook。

## 離線搜尋品質核對

`node scripts/perf/search-oracle.mjs`：無遊戲連線，載入實際搜尋程式，完整枚舉小fixture並assert核對。需要既有esbuild；只驗證目前近似模型，不證明真實遊戲品質或FPS。

## 同輸入完整更新配對

`update-paired.mjs` 另匯出 `assessTopThree(round, candidateId)`，比較實際推薦前三名的身分與順序，允許數值差；缺少三項有效證據或遊戲狀態改變時拒絕。與既有嚴格 `assessUpdatePair` 分開回報；前三通過不代表購買安全、收益等價或未知副作用已驗證。

隔離profile設定 `crossoverCandidate: "batch"`，以 `update-paired` 常用命令執行12對批次候選比較，記錄bundle與候選函式SHA256；每輪須有實際接管且前三一致，否則拒絕。僅接受已核對副本、正式遊戲停止；程序生命週期由外層控制器管理。bulk100以外沒有接管，不能以原生對原生當候選通過。

`./scripts/dev.ps1 update-paired -Profile <comparison-profile.json>`：僅連線已啟動且前景的隔離副本，正式遊戲須停止，必填expectedPlannerSha256。12輪依種子打亂四方案，每輪同步固定時刻與點擊收益、清空計算快取，各執行一次updateUI；摘要排除前2輪。保存數值、helper、策略、商店順序與首選；indexed／compiled品質不同即停止，search差異另列。finally還原時鐘、方案及點擊收益。這是冷快取強制更新成本，沒有自然幀間隔或長期推薦品質證據。原始報告含遊戲狀態，只放本機tmp；不提交。

## 自然更新交錯觀測

`./scripts/dev.ps1 crossover -Profile <comparison-profile.json>`：連線既有隔離副本、正式遊戲須停止、必填 expectedPlannerSha256。相鄰自然更新以種子打亂 baseline／indexed，不清快取、不重設計時或自動購買；每組暖機15秒、量測60秒、預設3組。只支援目前 experiment 的 writable `current` 內部欄位，結構不符拒絕。finally還原包裝；例外更新或截斷拒絕驗收。輸出完整更新耗時及恰含一次更新的 rAF callback 間隔；後者含觀察器負擔，非實際呈現時間。共用快取、動態狀態及模組副作用仍存在，不能當同快照因果比較或長期品質證明；原始資料含設定，只放本機tmp。

`collect` 的身分比較使用實際第一個 baseline；baseline 尚未出現時標記缺失，後續補齊，避免隨機排程首組被誤稱基準。
逐組 JSON 保存當時判定；晚到 baseline 的回填以最終 report.json 為準。crossover 途中任何 visibilitychange 到 hidden 均拒絕，兩方案各須有樣本。

設定 `crossoverCandidate: "building-cache"` 可用同一 crossover 常用命令比較局部 CPS 快取；預設仍比較 indexed。報告 candidate 欄位識別方案，樣本中的 indexed 表示候選槽位。此路徑僅切 buildingCpsCacheEnabled，保留baseline等待模型與排程，finally還原旗標；未知候選拒絕。

設定 `crossoverCandidate: "building-model"` 比較純數值普通建築overlay；同時控制buildingCpsCacheEnabled／buildingCpsModelEnabled，每次finally還原。building-cache明確停用純模型，分開比較兩個候選。兩路實驗預設皆關閉。

設定 `crossoverCandidate: "production-projection"` 比較純產量／價格試算，僅切 `productionProjectionEnabled`，每次finally還原。原始報告保存累計支援候選數及回退原因；支援數為零不構成效能驗收。嚴格投影預設啟用，僅支援已驗證的2.053來源、資料與hook形狀；未知規則回原生，近似功能仍須自行啟用。Pantheon閉包須在正常啟動中取得來源綁定，既有helper不追認；熱載入可能保留原生回退。

`node scripts/perf/load-order.mjs <verified isolation root>`：正式與隔離遊戲皆停止時，僅在已驗證副本的原生 `LoadScript` 加入 `script.async=false`，固定動態腳本執行順序。拒絕未知來源修改，保存原版／修改版SHA256；可重複執行。此為量測環境控制，不是產品效能修補；模組內部非同步載入仍可能改變註冊順序，每次比較仍須核對實際順序。

`update-paired` 設定 `crossoverCandidate: "production-projection"` 時，改比較 baseline／純產量模型兩路，固定每輪時間與點擊收益，清快取後各執行完整更新。保存每次接管數；零接管或品質差異拒絕驗收，finally還原原旗標。此命令核對同輸入完整更新成本，不能代表自然FPS或自動購買長期進度。

## 黑箱解鎖探測

`scripts/perf/unlock-probe.mjs` 匯出 `probeUnlocks(Game, ceiling)`，須由控制器序列化到已驗證的可丟棄隔離副本；不可在正式遊戲呼叫。掃描建築購買回呼，三背景記錄解鎖／成就增減與ownership查詢；副本必須在執行後關閉且不保存。任意模組副作用不保證還原。測試：`node scripts/perf/unlock-probe.test.mjs`。規則、隨機例外與重生失效設計見 `docs/unlock-prediction-research.md`。

`candidate-cost.mjs` 匯出 `observeCandidateCosts(planner, durationMs=15000)`；序列化到隔離renderer後await，記錄原生候選計算累計／最大耗時與>20ms次數，保留回傳值與例外、finally恢復原方法且不覆寫中途第三方替換。包含cache hits及觀察成本，不是同輸入比較。外層CDP timeout須大於durationMs。驗證：`node --test scripts/perf/candidate-cost.test.mjs`。

## CPU flamegraph

`node scripts/perf/flamegraph.mjs <cpu.cpuprofile> [output.html]`：離線轉換CDP CPU profile，產生可點擊放大、懸停查看self／inclusive、聚焦updateUI／CalculateGains的HTML，終端列出熱點。預設輸出與profile同目錄；原始profile／HTML放ignored tmp。寬度是採樣時間，不是精確呼叫耗時；inclusive父子不可相加，含Profiler負擔。檢查：`node --test scripts/perf/flamegraph.test.mjs`。

`curve-error.mjs` 的 `curveError(points, field)` 同時回報端點線性插值的絕對、總量相對及整段增量相對誤差。大總量減小增量可能放大浮點誤差，不能僅以總量誤差判推薦等價；零增量但內部跳變回傳Infinity。只評已給樣本，不保證未採樣輸入。驗證：`node --test scripts/perf/curve-error.test.mjs`。

`affordable-prefix.mjs` 匯出 `affordablePrefix(prices, rawAt, cookies, bankingSeconds)`，逐筆使用動態銀行額判斷可立即購買的前綴；銀行停用時傳0。僅shadow，不跳過產品原生重算。`node scripts/perf/affordable-shadow.mjs <native-curve-price-series.json>` 以原生樣本與端點插值比較，合成各步門檻及±1e-10餘額，輸出前綴差異；合成餘額不是玩家實際資產。原始起點可能未刷新，須另檢查排除起點結果；有限樣本不能證明未知模組等價。驗證：`node --test scripts/perf/affordable-prefix.test.mjs scripts/perf/affordable-shadow.test.mjs`。

`batch-candidate.mjs` 匯出 `installBatchCandidate(game, planner)`，僅供可丟棄隔離副本，回傳setEnabled／supported／restore。預設停用；bulk100建築候選採原生終點與線性中間收益，保留逐筆原生價格／銀行等待及tier購買重算。其餘bulk、升級直接原生；finally還原包裝且保留第三方替換。未知hook、非線性內部條件、閉包副作用尚未驗證，不可部署到正式遊戲。測試：`node --test scripts/perf/batch-candidate.test.mjs`。

批次候選另採原生第1與50步核對；已觀察非線性／基底失配時該候選其餘步數回原生，fallbacks累計。有限採樣不保證未見內部條件，因此仍是隔離實驗。`assessPurchaseDecision` 對比前三的原生價格、銀行額、餘額、等待為零資格與目標數量，任一差異拒絕；這只是購買決策輸入核對，未執行實際購買或證明完整副作用安全。

`installBatchCandidate(game, planner, true)` 僅略過已可負擔步數；價錢＋動態銀行額附近（相對1e-10內）或不足時恢復原生收益、保留呼叫端傳入價格，再交原生等待計算。終點原生，`skipped`記錄實際插值次數；`supported=0`不構成效能通過。參數預設false仍為整段實驗，兩者不可混稱相同方案或共用效能倍率。

`update-paired` profile設定 `crossoverCandidate: "affordable-only"` 可重跑僅可負擔步數的12對比較；report記錄affordableOnly=true及候選SHA256，候選槽仍稱batch，避免與整段結果混淆。零接管、前三不同或購買決策輸入不同均拒絕。

自然採樣的simulation項目另含候選token，可把同一次updateUI內的子呼叫耗時對回building／upgrade；觀察器有額外負擔，不能把跨狀態採樣當因果比較。

purchase-observer.mjs 匯出 observePurchases(Game, planner, limit=1000)，僅供隔離副本：記錄原生 buy 前後餘額、銀行額、擁有量、bulk 與實際付款；restore 保留中途第三方替換。記錄不能當成推薦正確或銀行安全通過，須另分析成功購買。測試：node --test scripts/perf/purchase-observer.test.mjs。

summarizePurchases(observation) 可重跑銀行觀察摘要；observedReservePass僅表示已記錄成功購買的前後保留額檢查，paymentAnomalies另列，不能推論付款資料一致、推薦品質或未記錄操作安全。

產品設定 experimentalBatch 預設false。game2.053／bulk100才可能接管，10秒候選原生核對、任何數值差異保守停用；核對輪使用原生結果。兩次核對間仍可能錯排。scripts/perf/batch-candidate.mjs與src共用實驗核心，不可繞過產品guard當正式預設。JSON大數採樣請用CDP evaluateJson；舊Electron returnByValue可能在int64邊界轉負。

日常用 scripts/dev.ps1 check 跑無UI單元與工具契約，再以 functional 跑隱藏Electron整合。最終效能採樣仍須可見，不能把無UI單元測試當遊戲卡頓驗收。

## 隱藏視窗功能驗證

`powershell -File scripts/dev.ps1 functional -Profile <comparison-profile.json>` 使用既有隔離副本及快照，要求正式與副本皆停止、expectedPlannerSha256吻合，啟動一個owned實例後最小化，核對hidden才執行同步品質檢查，finally正常關閉。保留真實DOM與其他模組，不是抽離遊戲核心；視窗啟動期間可能短暫顯示。

功能通過條件為候選數值、推薦排序、商店順序與首選一致；策略utility完全等價另列exactVariantsPass，不因功能通過改寫。背景節流與時間預算可影響策略utility，本工具不測FPS、不作效能結論。報告寫profile.output的functional-*，不寫正式存檔。一般順序：dev.ps1 check → functional → 可見compare。

功能核對暫時將策略時間預算設為10秒，保留原節點／佇列上限，避免JIT／背景排程導致各方案探索量不同；finally還原全部設定。此為功能oracle，不能拿耗時與正式毫秒預算策略比較。

`tier-values.mjs` 提供隔離診斷工廠 `createTierValuesCandidate(Game)`；只改集合迭代，保留公式與hooks。不得接正式模組：Object.values會提前讀取getter並排除繼承屬性。`node --test scripts/perf/tier-values.test.mjs` 可重跑等價普通資料與getter反例；自然效能仍須獨立驗證。

`createTierKeysCandidate(Game)` 改用key迭代以保留getter讀取時序，但仍排除繼承enumerable欄位；同一測試保留此反例，亦限隔離診斷。

`creator-observer.mjs` 為開發用兩階段creator caller觀察器。`core-smoke.mjs`的Pantheon選項會實跑原生建立鏈；`node --test scripts/perf/creator-observer.test.mjs`覆蓋未知來源、strict caller、重入、繼承setter、例外與描述子還原。正式版由`src/calc/pantheonBinding.ts`管理私有來源綁定，診斷工具不替產品認證。綁定owner不代表資料純度；不得以觀察前的既有helper或當下runtime來源自動認證。

`node scripts/perf/core-smoke.mjs <main.js> 2.053 <minigamePantheon.js> tmp/upgrade-survey.json` 另做逐項升級效果調查，並在 `gainUpgradeReads` 保存原生CalculateGains（含mouse／lump）實際查詢的Has key。每次收益計算後以finally還原Has；不觀察價格或buyFunction的讀取，不載存檔／共存模組。這只是合成狀態的觀測集合，不能證明未觀察到的升級沒有依賴，更不能直接當產品白名單。
