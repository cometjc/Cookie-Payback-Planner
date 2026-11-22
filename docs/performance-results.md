# 共存模組效能結果

目前正式版（2026-11-22）：10691f6來源／2054.11，嚴格投影預設開啟、近似預設關閉。依使用者指定100ms門檻，最新三輪新版共1,110次更新全數通過；各輪p95 44.83／48.95／47.45ms，最大84.20／70.75／83.28ms。與2054.04交錯的六輪端點品質及實購檢查通過；完整數據見末段「2054.11最終100ms驗收」。此結論限16mods、既有快照、銀行／自購及bulk100的量測窗口；自然進程可分岔，不宣稱因果倍數、未知狀態的時間保證或消除所有停頓。早期預設與未完成狀態不可當成目前產品狀態。

## 四方案比較

2026-11-01 完成 baseline、indexed、compiled、search 各三次，暖機 15 秒、採樣 60 秒，保留其他 15 個模組。
12 組有效，但執行期狀態及模組載入順序不一致，因此不可用跨組數字宣稱改善比例。

|方案|三次更新 p95（ms）|三次更新最大值（ms）|
|---|---|---|
|baseline|98.505 / 78.620 / 36.840|141.610 / 102.860 / 41.140|
|indexed|108.125 / 96.685 / 39.465|157.950 / 513.020 / 42.110|
|compiled|25.955 / 118.565 / 40.100|31.330 / 346.015 / 45.295|
|search|105.455 / 121.960 / 37.080|322.525 / 413.070 / 43.780|

indexed、compiled 在每組同步品質檢查中與 baseline 的數值、策略排序、商店順序及自動購買首選一致。A* 視為不同策略，未取得品質等價證據。

原始報告：`tmp/comparison-full/comparison-2026-11-01T05-05-15.824Z/report.json`，未提交存檔及原始採樣。

## 同輸入等待估算

2026-11-07，隔離副本、五輪，每輪每方案 3000 次查詢，固定輪內時間、輸入與點擊收益。五輪輸出相等（相對容差 1e-10），狀態穩定。

|方案|每次查詢中位數（µs）|每次查詢 p95（µs）|
|---|---:|---:|
|baseline|2.482|7.097|
|indexed|2.853|3.858|
|compiled|2.997|3.875|

索引與預編譯未改善查詢中位數；預設保留 baseline。這是等待估算微量測，不能推論整體更新或 FPS。

## 已落地：避免重建相同標籤

恢復快取標籤時，僅內容不同才設定 `textContent`／`innerHTML`。保持原畫面、計算、排序及策略。
實際遊戲同步配對五輪，每輪各 100 次，交替次序；每輪前後商店 HTML 相同。

|方案|五輪耗時（ms）|每 100 次子節點變更數|
|---|---|---:|
|原路徑|10.485 / 6.095 / 5.730 / 5.810 / 5.570|400|
|內容比對|6.495 / 4.690 / 3.855 / 4.395 / 3.885|0|

呼叫耗時中位數 5.810 → 4.395 ms，降低約 24%。此比例只適用標籤恢復函式，尚未證明整體遊戲改善。

排序優先分數也改為每項目建立一次同步索引，避免比較器重複呼叫 `getPrice()`；回歸測試確認原排序及同分順序。
2026-11-07 最終隔離 smoke（暖機15秒、採樣60秒）有效：153次更新，p95 44.490 ms、最大50.955 ms；37項品質、商店順序與首選檢查通過。
此輪沒有相同狀態的舊版對照，不能當成整體提升證據。

## 尚未完成的尖峰改善

CPU 採樣中，`updateUI` 累積約 67.5 秒，`updateBestCpsAcceleration` 約 36.9 秒、`updateHelperOrder` 約 23.2 秒、`estimateWaitSeconds` 約 3.7 秒（包含子呼叫，不能相加）。大量收益模擬比等待估算更值得優化。
目前過期項目可擴張同步模擬預算；直接限制預算會延後結果，須驗證推薦品質及自動購買新鮮度，尚未採用。不能宣稱統計更新卡頓已解決。

## 補充實驗：倍率索引與完整更新配對

2026-11-07，已知2.053／CCSE倍率預索引候選：67,000次公式oracle無差異，九輪推薦及遊戲狀態一致；完整更新中位38.275 → 42.190 ms，最大52.040 → 56.995 ms。結構檢查成本抵銷收益，拒絕採用；候選已移出src，原始證據保留tmp/tier-live。

已落地priority索引／標籤guard與前版render模組，在同一隔離renderer內固定時間、交替九輪配對：數值、排序、首選及遊戲狀態一致。更新中位38.865 → 37.520 ms，最大53.690 → 46.295 ms；樣本少、含首次JIT暖化，不足以確認持續尖峰改善。原始證據tmp/render-paired/timing.json及assessment.json。

技能調查首選官方ChromeDevTools/chrome-devtools-mcp的chrome-devtools（renderer runtime trace），補充Cloudflare web-perf。electron-flamegraph明確只支援main process，不適用本次renderer熱點。尚未安裝或改MCP；既有CDP9233與唯一實例保護仍適用。

後續已依使用者指定讀取並使用 chrome-devtools、web-perf。臨時 stdio MCP 可列工具，但 Electron target 的 list_pages 沒有可用頁面，trace 回覆 No page found；未宣稱 MCP trace 成功，未改全域設定。改用既有 CDP Tracing 取得 runtime 證據。

### 擴大完整更新配對

同一renderer載入前版／目前render模組，固定時間、交替順序；三次獨立啟動各70對，排除前10對暖化後各60對。每輪16個共存模組；各配對內同輸入，跨啟動載入順序不同，不合併成一組。全部210對的推薦數值、商店順序、首選與狀態檢查一致。

|輪次|中位ms 原／目前|p95 ms 原／目前|最大ms 原／目前|
|---|---|---|---|
|1|36.360 / 36.165|38.405 / 37.815|40.755 / 39.360|
|2|37.140 / 37.255|39.490 / 39.280|41.440 / 41.280|
|3|36.145 / 35.670|38.900 / 37.180|41.000 / 39.990|

已落地render變更在三輪p95皆略低，但第二輪中位略高；差距小，尚不足以宣稱明顯消除卡頓。這是同步強制更新配對，沒有量測自然遊戲幀間隔，不能推論FPS。證據tmp/render-long-{1,2,3}/timing.json及assessment.json；暖化後摘要tmp/render-long-summary.json。

較窄的倍率迴圈候選也測試：未加相容性guard時66,800公式對照無差異；加入正式所需guard後完整更新中位39.445→54.395ms，拒採，src候選已撤除。來源備份tmp/rejected-tierLoop.ts。來源16項／工具53項測試雖通過，不能取代效能驗收。

### 原生 renderer trace 與未採用候選

15秒 runtime trace：renderer 主執行緒10,343個 RunTask，累積3420.196ms、最大40.166ms，未見超過50ms工作。Layout累積256.705ms、最大2.177ms；UpdateLayoutTree累積128.083ms。各事件包含關係重疊，不可相加。CPU samples仍指向 updateUI、收益模擬與helper計算；此次短樣本不能排除其他狀態的尖峰。資料：tmp/cdp-trace/{runtime-trace,analysis}.json。CPU分析按renderer PID過濾，避免不同程序重複node ID混算。

快速控制列相同textContent避免重寫的候選，另跑三輪各70對，210對推薦數值、順序、首選及已列遊戲狀態一致。排除各10對暖化後，p95原／候選為39.750／38.690、39.420／39.450、45.930／45.270ms；第三輪max反而53.045／55.830ms。DOM mutation驗證兩路皆0，未形成有效差異證據；效益不一致，候選已撤回，未部署。

候選60秒自然觀測（暖機15秒，16mods）：149次updateUI，p50 19.015、p95 30.055、max40.505ms；5926個幀間隔，p99 19.809、max40.004ms，無超過50ms幀間隔。這是單次觀測，無同狀態baseline對照，不能宣稱改善。tmp/quick-natural/observation.json只留本機。

搜尋再評估見 [search-algorithm-research.md](search-algorithm-research.md)：預設為beam；現有astar是bounded best-first，沒有標準A*最優保證。保留預設，先建立小深度品質oracle；未以理論取代live比較。

本輪check（TypeScript、lint、11來源測試、53工具測試）、build、diff-check exit0；lint有一項既有no-this-alias warning。正式遊戲恢復唯一主程序PID15220，CDP9233，11mods，正式bundle SHA256仍bca76f0103f627b6f1bc120a924ce8e04ebea58b646129453485781b2731f193。正式與隔離mod組合不同，不直接比較。整體卡頓改善尚未驗收。

### 無限時增益的等待估算快速路徑

沒有有效timed window時，直接使用原末段的收益加法及除法，省去空陣列、Set、排序。保留buff收集、失效清理、銀行與動態CPS讀取；有window沿用原路徑。新增固定預期值檢查涵蓋零、負收益、NaN、Infinity；唯讀review無finding。

三輪隔離同步配對各70對，210對數值、排序、首選、已列遊戲狀態一致。各排除10對暖化後，完整更新p95原／候選為65.205／58.915、62.055／65.380、27.260／27.380ms；沒有一致整體收益，不能宣稱解除卡頓。原始資料tmp/sim-long-nobuff{1,2,3}/timing.json。固定無buff輸入的9輪各100,000次微量測，候選每輪較快（tmp/wait-micro-results.json）；此收益僅適用估算函式。

本輪check exit0（12來源測試、53工具測試、tsc、lint0error及一項既有warning），build exit0；正式遊戲已正常存檔後恢復單一PID15196，CDP9233、11mods、既有正式bundle hash核對。小型快速路徑尚未部署；較大的同步模擬尖峰仍待改善。

### 成就門檻成本上限與隔離建置核對

沙箱雖把Game.Win設為空函式，CalculateGains仍掃描48個CPS成就門檻。僅在隔離副本暫時換空清單、finally還原，三輪各70對；既有數值／排序／首選／已列遊戲狀態檢查通過。未加相容性guard的成本上限實驗，不能投入正式路徑：未知mod可能讀取清單，公式相等不等於所有副作用相同。

去各10對暖化後，第1輪中位25.605→25.345ms、p95 27.765→27.340ms；第3輪中位25.985→25.550ms、p95 27.790→27.475ms。第2輪全樣本p95反而27.410→29.650ms，未形成穩定尖峰收益，不採用。資料tmp/achievement-long-{1,2,3}。

重新查核發現隔離bundle保留舊tierIndex實驗程式（flag為false）；先前配對兩路共用該bundle，但不能視為目前commit的完整建置驗收。已於副本停止後備份並換成目前來源build；正式bundle未變。後續量測須先核對實際script hash。

正式遊戲PID15180恢復後，attach可讀模組與hash，但進一步readiness probe揭露isLoaded=false、hooksInstalled=false、timer=false、refreshes=0，Game.customStatsMenu／customOptionsMenu未建立，CCSE無isLoaded值。15秒trace嘗試實際卡在readiness並逾時，沒有取得正式runtime trace，不當成量測成功。src/index.ts的App.mods.CCSE fallback可在CCSE未完成時提早register；Game.registerMod先寫入Game.mods再呼叫init，失敗可能留下未初始化物件，後續existing檢查又直接視為成功。此為待修載入時序問題；先前僅程序／hash恢復不代表功能恢復。

後續實測修正上述根因推論：CCSE.track=1／playlist=14，document.hidden=true；原生視窗雖可見、未最小化，Page.bringToFront亦未解除renderer隱藏。正常存檔並關閉owned PID15180，加入與隔離量測相同的停用背景節流／遮蔽參數後重開唯一PID42512，document.visibilityState=visible，CCSE.isLoaded=1、planner.isLoaded=true、hooksInstalled=true、timer=true，refreshes由1增加至16。沒有手動呼叫init、重設設定或載入快照。證據支持Windows背景遮蔽使requestAnimationFrame初始化鏈停住；尚未證明必須修改index.ts，故未改載入程式。正式恢復驗收必須包含模組ready與更新次數增加。

正式運作後15秒trace成功，資料tmp/production-trace/{runtime-trace,analysis}.json。按CrRendererMain的PID／TID篩選：10,429個RunTask，累積3725.226ms、最大38.900ms；Layout最大2.032ms，無renderer超過50ms工作。未篩選程序的初步摘要有103.1ms工作，非renderer，不能當成mod阻塞。refreshes後續增至158，正式mod確實持續更新。此短期樣本未重現回報的嚴重卡頓，不宣稱問題已消失。

### 可重跑的四方案完整更新同輸入配對

新增scripts/perf/update-paired.mjs（dev.ps1 update-paired）：相同renderer內每輪同步固定Date.now與點擊收益、重置計算快取，種子打亂四方案；強制核對隔離bundle SHA256，正式遊戲停止，每輪核對PID／CreationDate／target。finally還原時鐘、方案及點擊收益；缺品質欄位或精確方案差異時拒絕。獨立review的欄位／每輪程序檢查建議已修正。

目前來源build SHA256 73a0ae1987f6d1d6a4b6e0d68eedfb2fec862f78e4b0b6aa4913bf7b3497389c；三次獨立啟動各12輪，暖機15秒，摘要去前2輪。各輪indexed／compiled數值、helper、策略、商店排序及首選一致；search每輪未等價，不能當品質維持方案採用。不同啟動不合併，以下僅輪內同輸入比較。

|啟動|baseline／indexed中位ms|baseline／indexed p95 ms|compiled中位ms|
|---|---|---|---|
|1|23.760／22.490|27.320／25.175|24.325|
|2|22.885／21.225|26.350／25.300|24.025|
|3|23.580／21.990|26.805／26.790|24.240|

indexed完整強制更新中位較低約5%–7%，與先前等待估算微量測結果不同；表示必須量測實際呼叫組合。每次只有10個暖化後樣本，冷快取強制更新不等同自然更新或幀率，尚不切正式預設。原始資料tmp/update-paired/updates-{1794015257023,1794015335799,1794015398369}/report.json。下一步量測自然運行與幀間隔；仍須保持品質與未知模組fallback。

正式已恢復唯一PID38424，visible、CCSE／planner ready、hooks／timer存在，refreshes增至63；正式bundle未改。check exit0（12來源、57工具、TypeScript、lint0error／既有1warning），未提交原始狀態。

### 自然運行與隨機交錯：indexed暫不採用

2026-11-07，來源build SHA256 73a0ae1987f6d1d6a4b6e0d68eedfb2fec862f78e4b0b6aa4913bf7b3497389c。相同隔離renderer、16mods，baseline／indexed各3組，種子打亂，每組暖機15秒、量測60秒。六組皆有更新與幀樣本，但cookies等狀態隨時間變動，非同快照比較；不得把組間差異直接歸因候選。

|組次|baseline／indexed更新p95 ms|baseline／indexed最大ms|baseline／indexed >50ms幀數|
|---|---|---|---|
|1|26.910／27.190|28.135／31.130|0／0|
|2|25.120／42.065|26.060／47.825|0／0|
|3|23.205／78.350|25.095／105.740|0／54|

第3組indexed重現同步尖峰：CalculateGains 55,665次，其餘組13,773–19,495次；simulation p95 6.095ms、helper p95 16.155ms。CPU自耗時集中CalculateGains／GetTieredCpsMult／Has；呼叫與重算量是後續調查線索，不代表已證明indexed造成迴歸。資料tmp/natural-indexed/2026-11-07T01-42-15.524Z。發現collect把隨機首組當基準，已修成實際baseline並加測試；此舊執行的report.corrected.json／md以新邏輯重算，原始檔保留。

另新增crossover工具：相鄰自然updateUI以種子平衡分派baseline／indexed，直接切換本版experiment current欄位，保留快取、排程與click smoothing，更新後finally還原；同一renderer3輪，每輪暖機15秒／量測60秒，無CPU採樣或CalculateGains包裝。只支援明確bundle hash與目前writable欄位；不是正式API或正式預設。結果：

|輪次|各方案更新數 baseline／indexed|更新p95 ms baseline／indexed|含單次更新的rAF間隔p95 ms baseline／indexed|
|---|---|---|---|
|1|73／73|27.355／23.650|36.845／31.535|
|2|73／73|37.960／39.335|47.060／48.125|
|3|76／75|36.225／39.905|45.850／46.975|

兩輪indexed較差，沒有穩定自然更新或frame收益，正式預設維持baseline，beam不變。相鄰狀態與共用快取仍非完全相同輸入；rAF callback間隔含觀察器負擔，不是呈現時間；未在本工具重做完整推薦oracle，依據前輪同步品質對照，不外推長期品質。資料tmp/crossover/crossover-1794016237261/report.json。

獨立review無阻擋，提出途中隱藏、單邊零樣本、單組JSON基準回填問題。前兩項已補拒絕與visibility listener清理；最後一項以最終report.json為authoritative並記README。上述live執行使用補正前版，沒有途中可見性事件證據；不宣稱補正後完成live驗收。新增serialized測試確認平衡分派、保留cache、例外還原、hidden事件追蹤與listener清理。

fresh dev.ps1 check exit0：TypeScript、lint0errors／既有1warning、12來源測試／59工具測試；build exit0。正式恢復唯一PID34992，CreationDate /Date(1794016508199)/，初次visibility檢查太早失敗，隨後waitReady及ensureVisible通過；CCSE／planner ready、hooks／timer存在、refreshes38。正式bundle仍bca76f0103f627b6f1bc120a924ce8e04ebea58b646129453485781b2731f193，未部署候選、未回寫隔離快照。整體尖峰改善未完成。

補查逐組before／after：indexed第2組開始無buff、結束Frenzy；baseline第2組含Frenzy及Click frenzy、並有升級購買；indexed第3組兩增益到期，建築及升級均變動。故105.740ms尖峰是動態共存情境重現，不能判定indexed迴歸。baseline第1組與indexed第1組無buff且無購買，更新p95接近；完整狀態仍有cookies／minigame差異。後續固定buff與購買狀態，先隔離相同負載；不可藉關閉正式自動購買來製造比較。

### 固定負載與重算成本（2026-11-07）

隔離副本、16mods、同步固定輸入；每組依序建立無buff、Frenzy、Frenzy＋Click frenzy，finally還原。四方案種子打亂22輪，去前2輪，baseline/indexed/compiled推薦數值、排序與首選一致；search另列。原始資料tmp/fixed-buffs/1794016869159。baseline/indexed/compiled p95 ms：無buff32.685/31.920/33.095；Frenzy33.840/35.265/37.605；雙buff56.685/63.115/63.560。固定雙buff已重現baseline長工作，indexed/compiled拒採。

單window直接積分候選品質一致，但整體收益小且不穩，撤出來源；保留到期前/正好到期/到期後固定預期值測試。直線展開tier Map與switch兩實驗品質一致但全部負載更慢，拒採。資料tmp/single-window/1794016982319、tmp/compiled-tier/1794017137179、tmp/compiled-switch/1794019623488。

另以包裝計時拆成本（有觀察器負擔，不與未包裝耗時直接比較），tmp/cost-breakdown/1794023192549。每輪合計四方案：無buff收益模擬832次CalculateGains、helper240次；Frenzy960/204；雙buff2064/8。因此雙buff收益模擬每更新516次CalculateGains，helper僅2次；主要成本是收益模擬逐步重算，並非搜尋或helper。雙buff收益模擬內CalculateGains占完整四方案更新約九成，不能據此推論Rust/WASM必然更快。

使用者提出相依圖＋overlay與基底增量失效。後續先驗單次sandbox內局部建築CPS節點重用，保留原CalculateGains的加總順序、全域倍率與hook流程；未知相依、hook或來源不能沿用快取。跨tick基底更新與完整overlay須待逐步oracle證明後才擴展。倍率memo實驗完整推薦不一致，已拒採；未部署。

### guarded快取進展與限制

實驗來源buildingCpsCache.ts尚未接正式入口。已辨識官方/CCSE函式、動態cookie power與hasGod；原生建築無type欄位，使用ObjectsById成員判斷。共同guard移至CalculateGains邊界後，固定三負載各16對完整品質通過，資料tmp/guarded-partial/1794031182564；無buffbaseline/cache p95 32.495/30.705、Frenzy33.975/30.225、雙buff56.965/47.445ms。不能沿用無guard原型較大收益，也不能推論自然幀。

獨立review tmp/building-cache-review.md建立可重跑反例：未知Cursor修改Farm fortune，舊cache回10、原生10.7。已補Cursor/Grandma來源與hooks guard、nested停用外cache、tier測試固定收益10→20；fresh check17來源/59工具、tsc、lint0errors/1既有warning通過。通用callback仍可修改未追蹤輸入，正式整合前須收斂為模擬器私有寫集並完成逐步oracle與review複核，不能宣稱任意callback安全。

自然交錯量測使用review修正前bundle，三輪15/60正在收集；僅診斷，不驗收修正後候選。第一輪cache更新p95 38.630較baseline36.045更高、相關rAF p95 49.540較45.270更高，尚無穩定自然收益。

自然三輪（review修正前外層wrapper），tmp/guarded-natural/1794031281202：baseline/cache更新p95依序36.045/38.630、40.915/39.055、40.945/37.555；相關rAF p95 45.270/49.540、48.880/48.330、47.455/47.515。中位更新cache三輪都較慢，frame收益不一致，不能驗收。候選外層guard安裝包含既有simCache命中，已改為僅實際重算區塊實驗flag，預設false；後續需對新bundle驗證。

第二review指出價格callback可改fortune，tmp/cache-price-repro.mjs已實跑重現10/10.7。已加building/tier getPrice、modifyBuildingPrice及價格hook guard、未知priceFunc fallback；source normalize按函式identity快取，保持靜態白名單。最新候選尚待live與複核，flag仍false。

整合位置修正後、上述最新guard之前的三輪自然觀測tmp/integrated-natural/1794031591678：baseline/cache update p95 37.445/40.755、26.960/28.785、27.340/27.200；rAF p95 45.785/49.840、36.280/35.120、37.075/35.880。更新兩輪較慢、frame不一致，仍不能宣稱自然卡頓改善。

最新價格guard曾讓所有實際tier因CCSE共用價格relay而fallback，tmp/integrated-cache/1794031852120不作改善證據。已讀relay：只遍歷customUpgradesAll.getPrice並乘回傳值；僅來源精確相符且下游清單空時允許，未知價格hook仍fallback。不能以全fallback比較冒稱partial有效。

最新source identity快取＋價格relay guard版本，tmp/integrated-cache/1794031941433：三負載各16對完整品質一致，排除前4對後baseline/cache p95 ms：無buff33.180/30.000、Frenzy35.540/28.850、雙buff59.380/40.295。完整最新候選仍待逐步oracle、自然frame與複核，預設false，不部署。

最新guard逐hit oracle：tmp/current-cache-oracle/1794032045099，以實際來源build時插入oracle，bulk1/10/100共158,396命中逐次Object.is與原building.cps完全一致，三負載各4對最終品質一致。oracle額外執行原公式，禁止用其計時宣稱候選慢/快。尚需自然幀與安全複核。

### 局部快取自然量測收尾

最新source快取／價格relay guard版三輪自然交錯已結束，資料tmp/integrated-natural/1794032082592。每輪暖機15秒、量測60秒，各方案75次更新；候選slot在raw中仍標indexed，實際切換buildingCpsCacheEnabled。

|輪次|更新p95 ms baseline／cache|含單次更新的rAF間隔p95 ms baseline／cache|
|---|---|---|
|1|40.400／38.700|52.485／45.170|
|2|37.365／37.890|43.775／46.740|
|3|42.195／34.475|47.175／44.705|

第三輪max更新46.490／48.120ms、相關rAF max54.665／59.805ms；p95改善未代表最長阻塞改善。三輪中位更新候選皆較慢。相鄰更新共用動態狀態與快取，非相同快照因果比較；兩輪p95下降仍不足驗收整體卡頓。保留實驗flag=false，不部署。

本次自然量測沒有最後新增的planner方法identity guard：只允許原生enterSandBox、leaveSandBox、getCurrentBuyCount、calcCookieTimesCost、getBankCookies、estimateWaitSeconds，避免第三方包裝在sandbox內改未追蹤輸入。不能把此量測當成最後來源版本的live驗收。

副本由runner finally正常關閉。正式恢復PID44484、CreationDate /Date(1794032400393)/，waitReady→ensureVisible通過，CCSE 2.036、planner loaded／timer／hooks有效、refreshes74，唯一正式主程序。未部署實驗bundle；完整overlay、跨tick失效及最終尖峰改善仍未完成，外部任務未同步。

最後方法guard新增8項測試：原生方法正向、六種替換fallback、替換等待函式的固定數值結果與狀態還原。fresh dev.ps1 check exit0：27來源測試、60工具測試、TypeScript、lint0errors／1既有no-this-alias warning；dev.ps1 build exit0。獨立複核tmp/incremental-final-review.md無新增具體阻擋缺陷，另跑6項cache與2項crossover測試、diff-check通過；不包含live效能或全部mod相容性驗收。

### 純數值普通建築overlay

buildingCpsModel以primitive規則、amount基底和分支overlay重算普通building.cps；反向amount依賴保留未變節點。rebase驗證後才安裝新基底，舊fork不變；adapter目前只在單sandbox使用，不跨tick，未知規則仍回退。兩flag預設false。

離線實際16mods輸入3,600項原公式對照一致；隔離逐hit oracle bulk1/10/100各4對、225,936次回傳與原公式Object.is一致，完整推薦及遊戲狀態一致（tmp/pure-model-live-oracle/1794033232971）。oracle額外執行原公式，不作速度比較。

一般build三負載各16對，去前4對，tmp/pure-model-live/1794033278254：baseline/model更新p95 ms為無buff35.880/29.395、Frenzy36.785/25.395、雙buff59.860/33.985。所有對的推薦數值、買量、等待、helper、strategy、排序、首選與遊戲狀態一致。仍需自然幀與最長阻塞驗收。

核心5項測試、adapter新增1項測試；check共33來源／60工具通過、tsc、lint0errors/1既有warning，build295.7kb通過。獨立review tmp/pure-model-review.md無新增具體阻擋，獨立12項模型/cache測試通過；未宣稱全部mod或跨tick相容。後續新增building-model crossover入口仍待fresh工具驗證。

補充離線隨機oracle：200組升級持有／ascension／amount基底，每組20分支，共72,000項普通建築CPS與原函式Object.is一致；每組均透過rebase更新，資料tmp/pure-model/stress.json。此為實際公式的合成狀態，不涵蓋未知mods或自然frames。另補純模型tier解鎖後永久fallback測試，8項adapter測試通過；building-model常用crossover入口3項serialized測試通過，完整check工具數已至61。

自然交錯三輪15/60已完成，tmp/pure-model-natural/1794033335899，bundle SHA256 edd85f652bca596ac60be26fe076b6d3ae6c97b5097e2096fe268e40dfd2e574：

|輪次|更新p95 baseline/model ms|更新max baseline/model ms|相關rAF p95 baseline/model ms|相關rAF max baseline/model ms|
|---|---|---|---|---|
|1|42.395/40.655|57.905/42.715|52.515/47.980|65.555/53.885|
|2|42.930/43.160|55.190/52.325|53.055/47.665|337.170/58.825|
|3|41.875/40.940|43.550/56.390|48.720/49.505|53.950/67.975|

各方案各輪75–76次更新。第三輪尾端反向，不能宣稱整體尖峰解決；相鄰更新共享動態狀態與cache，不是同快照因果比較。runtime使用當時tracked beginCrossover building-cache候選、整輪model flag=true；後續building-model工具入口未用於此run。來源公式與guard沒有變動，工具標記差異明示。

下一組在隔離副本明確關閉planner購買、建立3600秒雙buff，驗證建築amount/bought與升級bought/unlocked保持不變，再跑自然交錯；其他mods保持載入，任何購買或buff消失即拒絕。正式設定不修改。

固定負載第一組tmp/pure-model-fixed-natural/1794033647110誤用building-cache選項，新工具會在此選項明確關閉純模型，故不是model比較。收集期間已標hidden=true與invalidReason，runner保存raw後拒絕並finally關閉；此組不得當純模型證據。修正runner使用building-model後才重跑。

修正後固定自然組tmp/pure-model-fixed-natural/1794033741351目前前兩輪皆較慢：更新p95 baseline/model 20.885/29.985、18.540/24.250ms；相關rAF p95 28.010/33.830、27.390/33.695ms。兩輪建築與升級狀態未變、雙buff保持。不能以同步長迴圈的收益掩蓋短自然試算的建模成本；後續驗證延後建模門檻，短試算保留原路徑。

第三輪亦較慢：更新p95 19.025/22.060ms、max26.275/34.140ms，相關rAF p95 28.920/31.640ms、max29.525/36.425ms；三輪皆fixedStateUnchanged=true。立即建立模型版本拒採。後續候選於第4次CalculateGains才建模，前三次保留原公式；此新版本必須重做oracle，不能沿用上述自然結果驗收。

延後建模版逐hit oracle已通過：tmp/pure-model-live-oracle/1794034005940，bulk1/10/100各4對，189,936次模型回傳Object.is一致、完整推薦與狀態一致。此組bulk1已只有3,456次模型回傳，反映隔離副本遊戲進程變化，不能把跨啟動負載差異當演算法改善。一般build固定自然三輪正在收集，尚未採用。

lazy版獨立複核tmp/lazy-model-review.md無新增具體阻擋：13項模型/cache、3項工具測試及diff-check通過。最新完整check34來源/61工具通過，tsc、lint0errors/1既有warning、build295.9kb通過；核心與adapter來源hash見review。本輪來源guard範圍仍只限已知同步資料模型，不能宣稱全部mods相容。

延後建模一般bundle ff264fba77848b7b1e43cfd598c57200205cfc5a598eae84712a132e96f13dd9，固定自然tmp/pure-model-fixed-natural/1794034023837三輪完成：

|輪次|更新p95 baseline/model ms|更新max baseline/model ms|相關rAF p95 baseline/model ms|相關rAF max baseline/model ms|
|---|---|---|---|---|
|1|24.020/23.510|25.295/32.255|32.225/32.300|35.625/43.900|
|2|22.975/21.485|29.500/25.490|30.725/30.430|38.660/32.625|
|3|17.150/19.160|19.385/29.040|27.070/28.315|30.685/39.775|

每槽各輪71–72次更新、建築／升級狀態均未變、雙buff存在。第三輪候選較慢、第一與第三輪max更高，未達自然卡頓改善驗收，預設兩flag維持false，不部署。固定雙buff不等於完整固定輸入：cookies、click smoothing、buff時間與共用cache仍動態；此交錯觀察不聲稱同快照因果比較。

副本finally正常關閉，正式唯一PID25360、CreationDate /Date(1794034277768)/，waitReady→ensureVisible通過，CCSE 2.036、planner loaded／timer／hooks有效、refreshes25。正式bundle未改。下一步須減少每sandbox guard／安裝成本或建立refresh範圍可驗證基底；不因純公式微量測快就啟用。跨tick rebase與搜尋frontier尚未整合，整體目標保持未完成；外部任務未同步。

### 延後整個guard與安裝

S15 pureModel前3次CalculateGains保持原生CPS，第四次才做完整supported／價格guard與安裝wrapper，並保留至sandbox結束。短試算不再掃來源或安裝全部建築wrapper；模型與cache-only公式不變。10項cache測試含來源getter拒絕早讀、未知hook、nested、tier失效與例外還原；行為RED→GREEN。fresh check36來源/61工具、tsc、lint0errors/1既有warning、build297.7kb通過。獨立review tmp/deferred-install-review.md無新增阻擋，另10項cache測試通過。

本輪先正常保存關閉正式遊戲，再還原已驗證隔離snapshot 1dd464450bab4857dc00264ebdbe5e8e6cf72d7a92c5017b2d8027fecf86d47a；正式存檔不重置。oracle tmp/pure-model-live-oracle/1794034586567：bulk1/10/100各4對，214,560模型回傳Object.is與原公式一致，完整推薦／排序／首選與遊戲狀態一致。再次還原相同隔離快照後跑一般bundle固定自然交錯，sample另記實際computed項目數，用於檢查共享cache負載是否均衡；尚未驗收。

第一次自然組tmp/deferred-install-natural/1794034612158首輪fixedStateUnchanged=false，runner exit1拒絕並finally關閉，不作公平效能證據。兩槽computed平均12.276/12.395，中位皆12，不能推論候選多算是唯一原因。正式正常恢復後重新保存關閉，副本還原同快照；新run暖機後重設比較起點並保存具名變動明細，分辨購買與解鎖。不得直接忽略unlocked變動來放寬驗收。

重跑tmp/deferred-install-natural/1794034763561三輪15/60完成，bundle d65213dc3f6cf8ff982d277cfc88c3ab7b497fd662ea4f7a619c767babb63786。各輪建築與升級變動明細皆空，fixedStateUnchanged=true，雙buff保留：

|輪次|更新p95 baseline/model ms|更新max baseline/model ms|相關rAF p95 baseline/model ms|相關rAF max baseline/model ms|
|---|---|---|---|---|
|1|23.445/21.780|27.670/30.285|31.780/31.920|39.595/35.050|
|2|20.580/22.055|26.350/29.530|30.905/29.355|35.915/39.300|
|3|20.655/19.715|26.450/22.705|29.360/29.530|33.890/31.605|

每槽71–72次更新。更新與frames沒有一致優勢，未驗收整體卡頓，兩flag仍false、不部署。每sample computed快照含觀察器成本；相鄰更新依然共享cookies、buff時間與快取，不作同輸入因果比較。短試算避開安裝的正確性已證明，但性能收益不足，下一步僅試refresh純數值model共用，不能把supported成功快取整輪。

副本finally關閉；正式唯一PID40728、CreationDate /Date(1794035040015)/，waitReady→ensureVisible通過，CCSE/planner/timer/hooks有效、refreshes73。正式bundle未改。唯讀下一步設計tmp/refresh-base-design.md指出每sandbox仍須驗證並重新snapshot/rebase，避免候選間公開callback改baseCps、tier或函式而沿用舊值；跨tick與搜尋frontier尚未整合。

### S16 refresh 共用純模型：拒採預設啟用

每 sandbox 完整驗證後擷取 primitive snapshot/rebase；只在同一 refresh 共享純 memo。40項來源／61項工具測試、tsc、lint0errors/1既有warning、build298.5kb通過；獨立review tmp/refresh-model-review.md 26tests通過、無新增阻擋。bulk1/10/100各4對 live oracle：210,672次模型回傳Object.is一致、完整推薦與狀態一致，tmp/pure-model-live-oracle/1794035564407。

一般bundle decebc1aafac81b4b19166baf9a4488009688d2569a416677ea19f7e1f1cd6b0；同隔離快照重置後，固定雙buff自然交錯15秒暖機／60秒採樣／3輪，tmp/refresh-model-natural/1794035603445：

|輪次|更新p95 baseline/model ms|更新max baseline/model ms|相關rAF p95 baseline/model ms|相關rAF max baseline/model ms|
|---|---|---|---|---|
|1|21.445/21.845|25.925/24.080|31.700/30.705|36.035/31.205|
|2|18.035/20.095|30.950/27.350|26.845/31.455|42.405/33.130|
|3|18.625/21.535|22.130/40.270|27.965/30.610|29.250/48.475|

每槽70–72次更新，三輪fixedStateUnchanged=true、具名建築與升級變動皆空、雙buff保持；無更新或相關frame超50ms。更新p95三輪皆較慢，尾端亦反向，拒採預設啟用；兩flags=false、不部署。相鄰更新共享動態cookies、buff時間及cache，含computed觀察器負擔；不能當同快照因果比較。純memo共用不足以消除外層Game.CalculateGains重算，跨tick與frontier仍未完成。

副本finally正常關閉；正式唯一PID48824，CreationDate /Date(1794035850593)/，waitReady→ensureVisible通過；CCSE2.036、planner loaded/timer/hooks有效，refreshes145。正式bundle未改，外部任務未同步。Chrome DevTools MCP本輪無可用工具，沿用已授權原生CDP，不宣稱本輪取得新的CPU trace。

### 重生自動購買：新負載基線

使用者實際開始第18次重生後autoBuy=true、16mods。原生CDP採樣tmp/rebirth-autobuy/1794037418936約66秒：upgrades7→171，refreshes3784→4166；rAF p9560.072/p99129.868/max480.038ms，160長任務p95216.460/max415.255ms。採樣含CPU profiler負擔，不能與別組直接計算加速倍數。

self CPU：Game.Logic下Element.getBounds/getBoundingClientRect3554.921ms；CalculateGains合計2488.111ms；Game.RebuildUpgrades1744.269ms；updateNotation1443.014ms；reapplyLastKnownNotation合計1401.722ms。planner visibility下的getBoundingClientRect另324.008ms，不能將Game.Logic全部版面成本歸因planner。

候選僅減少notation重套的無效HTML/style寫入，WeakMap保存輸入及瀏覽器正規化值，仍偵測外部DOM修改與新span重建。17項targeted tests、獨立review tmp/notation-review.md通過；fixture第二次重套零writes，不等於live卡頓改善。完整52來源／61工具、tsc/lint/build通過。

依使用者要求在隔離副本傳承／飛升、等3秒、轉生後立即Game.WriteSave並確認完成：resets19、autoBuy=true、amounts10/5/其餘0。新獨立快照a921e4dc8a9d656a00fc2ab9a985b6c6c76ca30e7953312eb104f44399ef7c1a。正式存檔未覆寫；tmp/rebirth-fast-isolated可重置回同bytes。當前tmp/compare-fast-notation.mjs正比較baseline/candidate各3次15/60；動態購買與離線收益會分岔，仍須品質配對及限制判讀。

第一高負載組tmp/rebirth-fast-notation/1794038045115未完成：candidate1更新p9552.390/max111.020、baseline1 p9552.870/max117.100ms，買量/升級分岔；baseline2 visibility=hidden，runner exit1並finally關閉，拒採。正式正常恢復後保存關閉再重跑，不以此組宣稱加速倍數。

2026-11-07 重生自動購買notation候選：三輪自然更新p95原版59.620/61.285/126.490ms，候選135.095/53.210/54.105ms。動態購買狀態分岔，兩版各有尖峰，無穩定收益，拒採並恢復產品來源。6對同輸入211項推薦一致；DOM輸出一致，但重套100次兩版均0筆mutation，不能宣稱減少寫入。原始資料tmp/rebirth-fast-notation/1794038362798；未部署候選。正式遊戲已恢復，bundle未改。

購買100正式觀測tmp/bulk100-live/2026-11-07T08-13-28.242Z：有效1/1，162次update，p95284.025/p99539.920/max566.370ms；frame p95119.990/p99240.010/max570.005ms，165長任務max566.605ms。observeGains=false、仍含CPU profiler；不與購買1或不同狀態推算倍數。前一輪超100000收益樣本截斷已拒採。價格等比假說：逐筆取整與遊戲bulk一次取整有差，閉式另有float順序差，重跑scripts/perf/price-series.mjs可驗；不能直接替換逐單位等待與產量模擬。

純projection實驗交錯三輪（購買100）tmp/projection-natural/1794040592148：更新p95原路徑／候選120.450／115.235、161.855／67.610、135.015／74.410ms；max238.425／209.750、295.570／170.065、171.515／100.900ms。支援候選累計986。三輪有效且方向一致；共用狀態與快取，不能換算整體倍數，不含longtask比較。bundle19a7384660fc88abacc656226735f64bf94ba9ce8d122db3f53892513336d2c5，預設旗標false、未部署；完整副作用與獨立快照驗收仍缺。
## 副作用品質補充（2026-11-07）

本機tmp/projection-state-quality.json：同隔離重生快照、購買100、固定時間、逐組清計算快取，六對完整更新推薦與副作用一致。新增核對成就、最高產量、milk/effs、各建築stored產量、全域產量、滑鼠收益與糖塊時間，六對皆無欄位差異；純模型接管6次，其餘回退。先以原生更新建立共同基底，不能證明未暖化或任意第三方回呼的完整相容性。正式遊戲恢復，候選未部署。測試bundle1d123a0ff88382adfd66d4bbe264b4e493f4477b39460a08079e031e96da6b7a；後續item descriptor防護不在此bundle。

最新descriptor修正bundle ec236f3edee0c03877f7a2f359b0fa8c8cbb9b38c76c5143444857f998da5b1a再次六對全一致、接管6次；品質腳本強制逐建築試算且要求接管大於零。中途零接管輪不算候選驗收。新來源72項、工具70項測試與tsc/lint/build通過；lint保留1項既有warning。完整閉包guard與獨立自然比較仍未完成。

獨立快照重啟比較tmp/projection-independent/1794041610768只完成2/6；第三trial因tier回退導致接管0被coverage gate中止。首對更新p95候選118.720/基準144.475ms、長任務p95208.465/206.690ms，暖機後購買狀態分岔，不構成公平改善證據。正式已恢復，候選保持關閉。需可重現負載或tier支援後再驗，不能從未完成組推算倍數。

普通tier支援後，購買100固定輸入六對強制建築試算：baseline149–165ms、projection54–95ms，推薦與副作用皆一致；每對接管18普通建築，合計108。保留整批買完才付tier價格/更新產量及門檻前不中止語意；未知升級價格/hooks回退。bundle7f121ae1d0e92dd36995e0e8ba1520e30cc76f687fe74e837f982a750809b298，76來源/70工具、tsc/lint/build通過。僅此區段成本改善，未證完整遊戲倍率，候選預設關閉。新獨立自然比較另收集，不混用上一無效組。

新六trial收齊tmp/projection-independent/1794042092414：更新p95 baseline142.715/149.920/121.145ms、projection64.660/70.230/74.975ms；frame p99 baseline79.980/89.967/89.986ms、projection40.065/50.009/50.097ms。全部品質檢查通過、候選接管1109/1129/1106次；前後前景且無截斷。惟state及mod註冊順序漂移，assessment標causalComparison=false，不能換算公平倍數。原生mod載入並行Promise.all已定位，需隔離固定順序後再驗；未部署，正式恢復。

隔離副本改用原生script.async=false後，tmp/ordered-starts/1794042787697兩次重啟16模組的實際註冊/Steam順序完全一致，正式遊戲已恢復。工具只改已驗證停止副本，拒未知來源與共享連結；不是產品效能修補。採樣觀察器另加入中途hidden追蹤與拒絕，補足起訖前景檢查。尚待固定順序後重新比較，不沿用舊輪宣稱公平收益。

同輸入完整更新配對tmp/projection-update-quality.json：ordered副本、購買100、12對推薦品質全一致，每candidate接管18個普通建築。排除前2對暖化後，baseline中位186.395/p95193.395ms、純模型84.295/p95103.770ms，中位約2.21倍。這只證明固定同輸入、清cache強制updateUI成本，不能當自然FPS或整體遊戲倍率。使用bundle7f121ae1...；常用update-paired已加入此候選、零接管拒絕與旗標還原，76來源/74工具檢查通過，正式已恢復，候選未部署。

後續補繼承enumerable hook、tier/buff accessor與零倍率回退。最新bundle259f27dacfc55876973e847726f1a5ab16e7e71e3bcb32aab15b6e6333c9bb42：購買1/10/100各六對品質/副作用一致、各接管108次；78來源/74工具、tsc/lint/build通過。最新防護有額外成本，尚未重驗自然效能；2.21倍仍只對應舊配對bundle。正式恢復，候選維持停用。

### 最新純模型完整更新配對

2026-11-07，bundle `259f27dacfc55876973e847726f1a5ab16e7e71e3bcb32aab15b6e6333c9bb42`，購買100、固定副本載入順序，12對完整更新品質一致，純模型接管204次。排除前2對暖機後：

|方案|更新中位 ms|更新 p95 ms|
|---|---:|---:|
|baseline|173.665|194.475|
|production-projection|76.090|102.945|

中位約2.28倍，只限同步固定輸入、清快取後完整更新；不能代表自然FPS或整體遊戲倍數。原始資料 `tmp/projection-update-quality.json` 留本機。候選預設關閉，尚缺完整相容性、有效獨立審查與最終自然高負載驗收。

### 固定載入順序的自然高負載

相同最新bundle、16模組、重生快照、購買100及自動購買；各方案三輪，每輪暖機15秒、採樣60秒，種子打亂。六輪品質核對及樣本有效性通過，實際載入順序相同，途中未隱藏、未截斷。

|方案|三輪更新 p95 ms|三輪最大更新 ms|三輪畫格間隔 p99 ms|三輪最長長任務 ms|
|---|---|---|---|---|
|baseline|144.055 / 127.225 / 135.725|245.100 / 243.655 / 236.460|99.979 / 90.006 / 89.975|245.280 / 243.845 / 236.645|
|production-projection|79.335 / 69.525 / 69.825|125.645 / 118.665 / 114.450|49.994 / 49.984 / 49.976|109.050 / 118.865 / 114.585|

候選三輪接管1127／1110／1131次。自然購買路徑與暖機後狀態仍分岔，以上是實際負載觀測，不用來宣稱因果倍數。原始資料留 `tmp/projection-independent/1794043512043`；正式遊戲已恢復，候選尚未部署。

### 原三方案同輸入高負載補驗

同最新bundle、固定順序副本、購買100，12輪同步完整更新；每輪種子打亂方案，排除前2輪暖機。indexed／compiled品質一致；search於本次12輪也相同，但不代表長期推薦最優。

|方案|更新中位 ms|更新 p95 ms|
|---|---:|---:|
|baseline|168.590|179.115|
|indexed|167.615|177.260|
|compiled|168.620|178.060|
|search|165.300|177.930|

差距小，沒有足夠證據採用等待索引、預編譯或切換搜尋策略。維持baseline，優先純產量模型；不同run不混算比例。原始資料 `tmp/three-route-update-quality.json` 留本機。最新檢查：TypeScript、lint（0錯誤、1既有警告）、78來源測試、74工具測試通過。

最新繼承buff防護版 `af6f371df9cce7a15fdf9aaf437c9554a0475a7cbc44b0d6ccd0a0d419635d77` 已重新核對：購買1/10/100各六對推薦與狀態一致，接管共324；完整更新12對一致，排除前2對後baseline中位162.610/p95172.320ms、候選中位72.565/p9591.640ms，約2.24倍僅限同輸入強制更新。上一節自然六輪屬前一bundle，不冒稱本版自然驗收。79來源測試、74工具測試、TypeScript、lint及build通過。

兩項獨立審查P1（tier重用全域升級、非列舉升級getter）已修並複核；285項普通tier對應原生來源。最新bundle `c80033754b41a7713d296c972617564f26a33048ad2a07c3871987690af61469` 三bulk品質各六對一致，完整更新12對一致：後10對baseline中位167.930/p95176.485ms、候選中位74.525/p9583.340ms，約2.25倍僅限同輸入完整更新。82來源／74工具測試及型別、lint、build通過。未知閉包及模組副作用仍有限制，預設未開啟、未部署。

### 提交版自然量測與基底檢查

c8003375提交版補完六輪自然高負載（16模組、購買100、15秒暖機、60秒採樣、各三輪）：baseline更新p95為115.495/118.390/135.620ms，純模型64.415/73.440/89.910ms；畫格p99分別89.900/80.085/89.973ms與49.972/49.968/59.955ms。最長阻塞baseline235.340/268.820/273.170ms，純模型110.755/108.380/168.110ms。六輪品質、順序、可見性、樣本完整性皆通過；暖機後狀態不同，不能報因果倍數。raw留tmp/projection-independent/1794046003109，正式恢復。

新增零變更基底產量核對與首筆價格buildingCost效果一致性核對，不符回退原生試算；後者處理Game.effs尚未刷新而產量一致的情況。8a98d34e69e962eb540c088ba786b8e1987fd911f28f86d649bb04b4690cb425版購買1/10/100各六對品質及狀態一致，接管共324。84來源/74工具、TypeScript、lint（0錯誤、1既有警告）、build通過；此版尚無自然效能驗收，不沿用舊bundle數字。正式預設仍關閉。

### 最新購買100 CPU診斷

2026-11-07，bundle `33ade2e0496f30aadd45a2a482143c941a825605d2b3be68656035dfa737dccf`；16模組、重生快照、自動購買100、15秒暖機/60秒採樣，CDP CPU interval1ms，頁面可見且樣本未截斷。更新p95192.710ms、max241.500ms，包含Profiler負擔，不與未開Profiler的結果直接比較。

CPU inclusive：完整updateUI約14.36秒，其中updateBestCpsAcceleration約11.94秒。self：CalculateGains2.94秒、GetTieredCpsMult2.34秒、Has1.72秒。getBoundingClientRect約0.88秒，其中遊戲Logic0.75秒、模組可見性判定0.11秒；不以模組佈局讀取作主要優化方向。raw留本機tmp/bulk100-cpu/1794060389220，正式遊戲恢復。

自適應預算成本追蹤與診斷開關分離已修正，但早期兩輪smoke未證改善；staleCount仍會突破預算，推薦新鮮度與自然負載尚須驗收。這項修正不等於已解決同步收益試算尖峰。

### 原生終點批次候選：隔離量測

2026-11-08，bundle `1019fce835c6b5853d104b2df67d3ce6c13c05c445dc8e1c27472aeddf714d80`，候選函式SHA256 `92d01ff22af634cae437661049ec4fc32581952ef66911714647d2d181b9277d`。bulk100保留原生終點收益、逐筆價格／銀行等待、tier ownership變動原生重算；只在隔離工具安裝，尚未產品化。

同步12對完整更新，前三與嚴格數值皆一致；後10對baseline中位178.155ms，候選35.170ms，約5.07倍僅限此固定輸入。另12對Game／建築／minigame／其他mods自有純量狀態差異全空；閉包及巢狀自訂資料未涵蓋。

自然量測：16mods、同轉生快照、autoBuy、bulk100，各三輪15秒暖／60秒量，種子打亂，六輪可見性／樣本完整性／模組順序皆通過。品質獨立依同步oracle，未將自然量測硬寫品質pass。

|方案|更新p95 ms|最大更新 ms|幀間隔p99 ms|最長longtask ms|
|---|---|---|---|---|
|baseline|125.425 / 146.990 / 193.065|227.095 / 228.500 / 513.555|79.938 / 89.949 / 89.866|227.500 / 229.110 / 513.755|
|batch|33.195 / 38.430 / 36.605|50.250 / 82.950 / 61.100|30.016 / 30.008 / 29.993|50.445 / 141.850 / 61.495|

候選接管1773／1660／1697次。首候選另有2959.927ms幀間隔，無同級更新耗時或longtask，原因未定位；不可宣稱消除所有長停頓。後兩候選最大幀間隔150.013／79.951ms。自然購買進程已分岔，不報因果倍率。raw `tmp/batch-natural/1794083002127`；session3450 exit0，正式恢復且fresh probe正常16mods。前一run baseline隱藏無幀樣本已拒收，不混入此表。未知規則回退、未刷新基底、持續品質與正式部署仍未完成。
### 僅可負擔步數候選獨立測試

銀行保留動態更新，剩餘資產靠近price+bank（相對1e-10內）或不足時原生刷新並保留呼叫端價格，等待與終點原生；第1／50原生抽樣失配回退。16mods、bulk100、自然暖40秒後12對同步比較，前三及原生購買決策輸入全部一致、每輪20候選接管。排前2對，baseline中位215.790/p95231.045ms，候選53.630/p9560.025ms，中位約4.02倍僅限同步完整更新。raw留tmp/affordable-only-paired.json與summary；不代表自然FPS。前期背景兩次零接管，不能宣稱所有時點固定加速。有限抽樣與未知hook安全仍欠，產品未啟用。正式恢復fresh probe正常16mods。

### 僅可負擔步數：自然高負載三輪

bundle1019fce8、candidateSha fabbf74c、affordableOnly=true，16mods固定順序、相同轉生快照、autoBuy／bulk100，15秒暖／60秒量各3輪，seed20261108。六輪樣本有效，結束時各做同步前三與購買決策oracle，全部通過；自然購買進程不同，不報因果倍率。

|方案|更新p95 ms|最大更新 ms|幀間隔p99 ms|最長longtask ms|
|---|---|---|---|---|
|baseline|239.060 / 189.940 / 147.705|494.395 / 223.960 / 232.530|209.966 / 89.968 / 89.877|494.705 / 224.170 / 232.625|
|affordable-only|90.140 / 106.215 / 117.100|240.850 / 196.505 / 267.205|60.000 / 60.083 / 59.861|240.955 / 196.720 / 267.355|

接管722／830／691候選。此方案保留原生等待／終點，低於整段插值的接管率，尖峰仍約197–267ms；不宣稱解決最長卡頓或所有輪次最大值下降。raw `tmp/affordable-natural/1794084202797`，session73603 exit0、finally正式恢復、fresh probe正常16mods。原生模型未知條件與未見hook安全尚未充分，未部署。這份結果支持可付區間減少一般負載，但不能將同步4.02倍解讀為自然FPS倍率。
### 可付步數修正版：前三排序門檻

2026-11-15，修復tier價格保留及抽樣後其他原生收益欄位恢復；候選檔SHA256 `92fa2324a77534863124bd985864d76983d9861ca3c4136f9444a17c77339024`，bundle1019fce8不變。12對同輸入比較，前三身分及順序全部一致、購買決策輸入全部一致；未執行實際購買。保留第11對零接管，其他各18–20接管。

全部12對baseline中位181.175／p95193.435ms，候選中位77.065／p95184.225ms，中位約2.35倍，僅限同步更新。p95仍接近原生；不能宣稱消除尖峰。舊4.02倍及上述自然六輪屬修前版本，不能作此版驗收。raw `tmp/affordable-restored-paired.json`，session42363 exit0；副本退出，正式維持原先停止。新版自然六輪正在重驗。

### 修正版自然負載重驗（2026-11-15）

相同16mods順序、轉生快照、bulk100／autoBuy、15秒暖／60秒量各3輪；候選函式SHA256 `e8887e8376d22b26cd251b9a03ffb87452d526b82a3d0818add81086e482094e`（檔案SHA與上節相同）。六輪有效、各輪結束前三及購買決策輸入核對全部通過；實際購買安全未由此oracle驗證。

|方案|更新p95 ms|最大更新 ms|幀間隔p99 ms|最長longtask ms|
|---|---|---|---|---|
|baseline|120.010 / 144.650 / 110.625|255.480 / 233.310 / 218.690|79.983 / 79.999 / 79.999|255.880 / 233.490 / 218.980|
|affordable-only|76.270 / 265.190 / 91.110|204.485 / 534.415 / 246.655|59.858 / 180.328 / 69.744|204.735 / 534.780 / 246.940|

接管762／704／643候選。第二輪候選更慢，保留原樣；自然購買進度、起點CPS已分岔，不能作因果倍率。結論：前三門檻在已測狀態通過，同輸入中位約2.35倍，但自然尖峰不穩定，尚不足預設啟用。raw `tmp/affordable-restored-natural/1794720790166`，session26195 exit0，副本退出，CIM核對無遊戲程序；正式維持原先停止。最新check：typecheck、92來源tests、85工具tests通過，lint0errors／1既存warning。未部署。

### 整段批次修正版：同步配對（2026-11-15）

與僅可付修正版相同候選檔，第三參數false，保留n1/n50原生抽樣與當前點其餘原生欄位恢復。12對同輸入全部前三／購買決策輸入一致，各20建築接管。全12對baseline中位193.1475／p95203.540ms，候選43.4125／49.860ms，中位約4.45倍僅限同步更新；不同自然狀態不可拿這數字當FPS倍率。raw tmp/full-restored-paired.json，session71104 exit0。未知條件／hook回退、實際購買與正式接入仍未驗收。

### 整段批次修正版：自然六輪

16mods固定順序、同轉生快照、autoBuy／bulk100、astar、bankingSeconds=true（Number換算1秒）、15秒暖／60秒量各3輪。六輪有效，全部endpoint前三／購買決策輸入核對通過。候選函式SHA e8887e83，bundle1019fce8，第三參數false。

|方案|更新p95 ms|最大更新 ms|幀間隔p99 ms|最長longtask ms|
|---|---|---|---|---|
|baseline|173.670 / 158.005 / 142.860|367.445 / 231.640 / 219.795|99.871 / 79.990 / 79.997|367.605 / 231.780 / 219.965|
|batch|39.730 / 60.415 / 37.140|67.000 / 124.165 / 80.195|29.991 / 60.028 / 29.997|67.245 / 286.890 / 80.740|

接管1602／1498／1742候選。第二候選另有286.890ms longtask、289.955ms幀間隔，不全落在update內，未定位且保留。自然autoBuy進程分岔，不報因果倍率；這些資料支持減少收益試算成本，不能證明未知hooks或所有狀態排序等價。raw tmp/full-restored-natural/1794721738824，session37376 exit0，副本退出後CIM核對無遊戲程序，正式維持原先停止。實際購買觀察另跑，不混入此無buy觀察器量測。

### 實際購買：銀行保留額修正

整段候選隔離實購觀察發現既有CPP銀行額漏洞：342次成功中19次購後低於銀行額，stack均為tryAutoBuyFromMainLoop。資格只檢單件getPrice，原生buy卻依bulk100逐件購買，消耗保留額。未將此結果標為安全通過。

修正銀行開啟時逐件原生buy(1)，每件前重新核對price／bank／cookies；試算仍bulk100。新bundle SHA256 `4f140f890c4cc6d9453e88193a5d7af845b724b341cc172b5c7ee753d3369bb2`。15秒暖＋60秒觀察共8340呼叫、8048成功（7775建築、273升級），紀錄無截斷，零次購後低於購前或購後bank。同期endpoint前三與購買輸入一致。raw tmp/full-purchase-observed/1794722734254，session56329 exit0，副本退出、正式保持停止。前一次1000筆截斷結果僅作不完整證據保留。

新bundle這一輪p9537.125/max95.805ms含購買觀察器，不挪用舊bundle自然六輪作此版完整效能驗收；未知hook回退與正式整合／部署尚未完成。

### 銀行模式 bulk100 吞吐回歸修正

逐件銀行檢查後原50次連買上限使可付bulk100只買50；測試重現後，銀行模式建築上限改為至少當前正規化bulk（一批最多100），保持每件檢查與推薦目標停止。新bundle7431857a78fab8d075652fa4e802bbb82eb842fbd7bfe617bce55e41ba768a2c。

原生收益路徑15秒暖／60秒實購觀察：8489呼叫、8212成功（7951建築、261升級），無截斷，零次購後低於購前／購後銀行額；raw tmp/native-purchase-observed/1794723285831，session31979 exit0，副本退出，正式保持停止。同期endpoint前三／購買輸入核對通過；自然p95138.005/max227.820ms包含購買觀察器，只是一輪安全觀察，不宣稱完整尖峰改善。全check99來源／87工具通過，lint0errors1既存warning。

整段候選新增第25步暫時收益變化反例，證明1/50/100採樣可完全漏檢（fallbacks0，135被算成35）；故先前排序實測通過不能證明未知規則回退。候選仍僅隔離工具，未部署。

## 倍數購買修正（2026-11-16）

bulk10/100建築購買改為下一倍數：123選10到130、選100到200。先原生試算整批價格與動態銀行額，不足不開始；足夠後一次原生buy(7/77)，不逐件零買。真遊戲2.053、16模組隔離驗證兩者呼叫參數與終點正確、銀行額通過；使用合成充足餘額，非自然吞吐或任意第三方hook證明。

最新check：115來源／88工具測試、typecheck通過，lint0error／1既有warning；build SHA120974cd2cf66e8a32f764551c4ac5fc9dc4bd864332bf032bc54eb5b06bcc1c，已備份部署正式mod，正式遊戲維持停止。未提交整合。

近似實驗預設關閉，僅2.053整倍數bulk100；每10秒原生候選核對，任一數值不一致保守停用並清策略快取。核對會新增同步尖峰。舊實驗產品自然六輪中兩輪曾停用，不能宣稱持續近似加速通過。新版仍待完整自然驗收。

## 新版原生批次自然驗收（2026-11-16）

bundle120974cd，game2.053、同快照16模組、autoBuy／bulk100／astar、15秒暖機／60秒採樣、各3輪隨機順序。六輪可見性及endpoint前三／購買條件核對皆通過。實驗三輪啟用時皆失配退回嚴格，採樣期間checks增量0，不能宣稱實驗持續加速。自然autoBuy進程分岔，不作因果倍率。

|設定|三次更新p95 ms|三次更新max ms|三次frame p99 ms|
|---|---|---|---|
|嚴格|152.990／117.160／157.060|218.000／213.835／222.275|79.994／79.972／70.046|
|請求實驗但已退回嚴格|126.265／183.185／175.240|229.295／210.745／304.080|70.056／80.022／79.967|

完整實購3119呼叫／1727成功／40679units，398次成功建築購買全部停在100倍數；0銀行違規、0invalid、0付款異常，六輪皆無截斷。包含其他模組購買，不能擴大為任意hook證明。raw及機器摘要保留tmp/product-bulk-natural/1794761949939。同步尖峰仍存在，未宣稱卡頓解決。

新版30秒CPU profile（獨立於六輪效能比較，含Profiler及購買觀察器負擔）：updateUI累積6987.850ms；updateBestCpsAcceleration占87.57%、CalculateGains74.58%、GetTieredCpsMult22.68%、Has15.03%、notation4.33%、helper0.044%。皆含子呼叫，不可相加。autoBuy原生批次預檢另累積870.843ms（其中CalculateGains708.768ms），屬updateUI外負載，亦需納入後續優化。raw tmp/bulk-cpu/1794762482489/cpu.json與flamegraph.html；session53082 exit0，endpoint前三／purchase inputs通過、副本正常退出。

## 批次失配定位（2026-11-16，e492192）

同一同步狀態固定 Date.now、清候選快取，依序原生／近似／原生；game2.053、16模組、bulk100。原生前後逐候選三欄完全一致。初始快照近似12候選失配，最大相對差約3.63e-15；156.625／44.740／151.805ms。這組失配符合浮點累積差異，不能據此排除其他狀態的中間效果或放寬產品零容差。

補測所有建築amount=bought為0／100／123，以及100加低餘額（快照cookies乘1e-8），各原生前後一致；近似差異候選4／7／0／9，最大相對差1.33e-15。123不是100倍數，候選回原生，約126ms對126ms。這是合成隔離狀態，不能作自然遊戲或前三排序安全證明。

同四組狀態改用既有affordableOnly候選，所有候選三欄皆與兩次原生完全一致；原生／候選ms分別162.190／68.620、164.840／161.530、117.670／118.975、156.845／149.770。19次候選接管、1416次跳過重算，未涵蓋未知hook完整效果。僅首組有明顯收益，不能宣稱穩定加速。產品預設與零容差未修改。

原始結果：tmp/batch-mismatch-probe.json、tmp/batch-mismatch-scenarios.json、tmp/affordable-mismatch-scenarios.json；三支本機probe皆exit0，owned副本正常退出，正式遊戲未啟動、存檔設定未變。後續應對affordableOnly跑同輸入完整排序與自然高負載驗收，確認是否值得作可選實驗；嚴格路徑仍需改善。

### 付得起區間候選：完整同步品質（2026-11-16）

當前bundle120974cd、16mods、bulk100，原生／affordableOnly交替順序12對，逐對遊戲狀態穩定、所有候選三欄完全相同、前三及購買條件輸入一致。策略預算設10000ms避免功能oracle受wall-clock探索量干擾；不是正式策略預算效能結論。排前兩對，原生中位167.650/p95191.070ms，候選132.305/p95176.170ms，中位約1.27倍；第0對零接管，不能當有效加速覆蓋。raw tmp/affordable-full-paired.json及summary，session52630 exit0、副本正常退出。未知hook安全仍無證明，未改預設。

啟動當前版本自然六輪tmp/affordable-current-natural/1794763389456，session84132；首輪候選359次更新、1336候選接管、p9567.710/max141.635ms、framep9940.091ms，有效且endpoint前三／購買條件核對通過。未完成六輪前不排名或宣稱驗收。初次腳本字串替換產生falsetrue於設定階段失敗（session76486 exit1），finally關閉副本後修正；失敗raw保留1794763358660。

fresh scripts/dev.ps1 check exit0：typecheck、118來源／90工具測試通過，lint0error／1既有no-this-alias warning。此時產品未變，測試與性能觀察不互相代替。

### 當前付得起區間候選：自然六輪完成

session84132 exit0，raw tmp/affordable-current-natural/1794763389456，bundle120974cd、16mods固定順序、同轉生快照、autoBuy／bulk100、15秒暖／60秒量／各3輪隨機。全部樣本有效、六個endpoint前三及購買條件輸入核對通過；自然進度分岔，不作因果倍率。

|方案|三輪update p95 ms|三輪update max ms|三輪frame p99 ms|
|---|---|---|---|
|原生|114.490／150.535／108.425|212.695／214.065／224.500|70.139／79.993／79.851|
|affordableOnly|67.710／70.405／64.310|141.635／106.300／116.045|40.091／49.913／39.969|

候選接管1336／1356／1355次；3334購買呼叫、1813成功、43298units，424次成功建築購買全100倍數，0銀行額違規／invalid／付款異常，無截斷。purchase-assessment.json與final-assessment.json保存機器核對。owned副本正常退出，CIM核對無遊戲程序；正式未啟動。

此候選直接注入隔離遊戲，未含產品ExperimentalBatch每10秒原生audit；不可當成產品配置已達此速度。預設嚴格不變。下一步在可選實驗接入affordableOnly並保留零容差audit，驗啟用持續性、核對尖峰與失配退回；不可僅憑候選六輪發布效能聲明。此前完整同步12對品質通過可支持此實驗接入，未知hook仍不能保證。

產品affordableOnly首輪（tmp/product-affordable-natural/1794763968091，session2964仍運行）核對6次後mismatch1停用，採樣checks增量4；p9586.050/max384.985/framep9970.003ms。包含失配回原生及定期audit，不可稱持續實驗加速或解決尖峰。310成功、77building全100倍數、0bank/invalid/payment anomaly。其餘輪待收；正式未部署。新增未付款區間n25反例回歸測試通過，僅tests變更，不影響本輪bundle。

產品六輪未完成：session2964 exit1，index2 endpoint同步核對偵測Update mutated gameplay state，樣本本身valid但品質未過；保留原始3輪資料，不宣稱產品通過。finally正常退出後CIM無遊戲，另啟獨立逐audit診斷session3687。

獨立audit診斷session3687 exit0，70秒7次核對逐候選三欄完全一致、enabled=true。tmp/product-audit-diagnostics.json保留結果；未重現前次失配，包裝時序有觀察器負擔，不當效能驗收。未確認根因、未修改容差，副本已正常退出且CIM無遊戲。

### 購買後收益基底過期：已重現
無額外包裝的產品audit診斷session42431 exit0，第5次核對id301 BestCpsAcceleration約7.4985e49對6.4271e44，證實不能歸因浮點尾差。新增lastMismatch單一記憶體欄位保存失配證據。後續session84528兩次純原生對照首輪即重現：recalculateGains=1、CPS6.73694e29，第一次候選還原後CPS6.87168e29且flag0；Cursor分數3.22193e50對1.02980e40。raw tmp/native-native-audit.json。這證實購買後未刷新的原生基底可讓雙原生結果失配，尚不證明涵蓋所有失配。
產品候選計算前若遊戲recalculateGains為真先原生CalculateGains；嚴格及實驗皆適用，未放寬容差。同步品質工具亦於初始指紋前刷新pending gains，仍拒絕之後狀態漂移，錯誤附變動欄名而不輸出值。fresh全check121來源／91工具pass、typecheck pass、lint1既有warn、build7c09b95d；工具最後新增基底刷新後7項目標測試pass。session71095新產品120秒核對運行中，待收，不宣稱已修復全部問題。

基底刷新後session71095 exit0：120秒12次audit全部一致，實驗持續enabled，tmp/product-audit-fresh-base.json；owned副本正常退出。這是持續核對證據，不是效能結論；新版六輪含audit量測session7186已啟動。

基底刷新新版六輪首對：實驗持續enabled，8次audit零失配、update p9573.935/max275.890/framep9939.995；原生118.865/210.690/79.973ms。endpoint前三／購買條件皆pass。這顯示audit可能改善一般耗時卻加重最長阻塞；六輪未齊，不作最終排名或因果倍率。raw tmp/product-affordable-fresh-natural/1794764697642，session7186續跑。

### 基底刷新後：產品六輪含audit驗收

session7186 exit0，raw tmp/product-affordable-fresh-natural/1794764697642，bundle7c09b95d、16mods固定順序、同轉生快照、autoBuy／bulk100／astar、暖15秒量60秒各3輪。所有樣本與endpoint前三／購買條件核對通過。三次實驗各8次audit，皆enabled=true、mismatches=0、lastMismatch=null；採樣audit增量各6。基底失配未重現，不擴大為任意hook保證。

|模式|三輪update p95 ms|三輪update max ms|三輪frame p99 ms|
|---|---|---|---|
|嚴格|118.865／183.080／156.915|210.690／222.945／210.365|79.973／70.068／80.034|
|實驗含audit|73.935／72.115／85.295|275.890／357.105／284.730|39.995／39.977／49.962|

3305次購買呼叫、1825成功、43341units，424次建築購買全100倍數，無bank／invalid／付款異常、無截斷。final-assessment.json及purchase-assessment.json保存核對；自然進度分岔，不作因果倍率。全部owned副本退出、CIM無遊戲，正式未啟動。

產品實驗一般耗時與frame p99較低，但audit雙算讓最大阻塞一致較差，未達最長卡頓改善要求；不宣稱整體完成、不預設開啟。下一步可逐候選同狀態雙算並輪替audit覆蓋，避免一次全量雙算；不能跨tick混合分數或取消失配停用。嚴格原生尖峰亦仍需改善。

### 輪替單棟核對：產品六輪

bundlec6ef62e8、session49995 exit0，raw tmp/product-rotating-audit-natural/1794765402209；16mods固定順序、同快照／autoBuy／bulk100、15秒暖／60秒量／各3輪。每次更新至多audit一棟；未核對或逾10秒者cold原生。失配整輪cold原生，所有比較仍在同步同狀態完成。

|模式|三輪update p95 ms|三輪update max ms|三輪frame p99 ms|
|---|---|---|---|
|嚴格|126.930／114.105／106.415|224.200／214.545／208.250|79.986／69.998／70.005|
|輪替實驗|75.050／72.115／72.750|208.870／117.860／138.055|49.994／50.003／40.012|

三實驗audit總數160／157／159，全部零失配、持續enabled。六輪樣本與endpoint前三／購買條件全通過。3225購買呼叫、1792成功、43378units，425次建築購買全100倍數，零銀行額／invalid／付款異常、無截斷。機器摘要final-assessment/purchase-assessment保存。自然進度分岔不作因果倍率；max第一輪改善小，不能聲稱任意狀態無長任務。相較上一版全量audit的276–357ms，這輪未見同等尖峰。

副本正常退出、正式未啟動。後續僅更新UI提示為輪替語義，演算法不變；fresh全check124來源／91工具通過、typecheck pass、lint1既有warn、build完成。可選實驗預設關閉，嚴格原生路徑的約200ms尖峰仍未解，整體goal未完成。

### 批購餘額修正後嚴格模式驗收

4cbe02a／2053.27，bundle a3eea40ddeed2f10a4e083ba7ef38f2c9567c647256f6a61bd73eafb2521bf47。預檢每步同步Game.cookies，finally先還原餘額再原生還原收益；餘額定價回歸修前失敗、修後通過。125來源／91工具、typecheck、build通過；lint0錯誤／1既有警告。正式停止時備份並部署，讀回hash一致；未動正式存檔。

隔離同轉生快照／16mods／bulk100／autoBuy／嚴格模式，暖機15秒、量測60秒單輪，raw tmp/preflight-strict-natural/1794767653921。348次更新，p95121.265ms、max210.415ms；framep9989.953ms、max220.060ms。573次購買呼叫、311成功、6186units；60次建築購買全100倍數，零銀行保留額／付款／invalid異常、無截斷或bulkViolation。endpoint前三與購買條件核對通過。單輪自然資料不是舊版對照，不能推算加速或宣稱尖峰改善。最後副本正常退出，正式維持停止；嚴格模式尖峰仍未解，原始倍數回報尚未直接重現。

後續相同bundle／快照／模組組合補兩輪15/60，raw tmp/preflight-strict-repeats/1794767823343。第二／三輪updatep95143.005／103.090、max241.575／226.885ms，framep9989.955／80.049ms；皆有效，endpoint前三／購買條件通過。兩輪各77次building全100倍數、零bank/invalid/payment anomaly、無截斷。合併前輪共214次building、968成功／21870units。這三輪僅新版行為驗收，無舊版公平比較；嚴格尖峰未通過改善驗收。全部owned退出，正式維持停止。
## 精確收益快取與投影模型驗證（2026-11-16）

14ffada修復小數收益變動未使快取失效；正式部署2053.29，bundle 8cd802a52c117e9b123b9c44b78c641c9af0072cb411e9c9bfe5b31caf51889c。隔離嚴格模式單輪15/60：362次更新、p95 150.865ms、max217.860ms、frame p99 89.996ms；77次建築購買全100倍數，零銀行／付款／invalid異常，endpoint前三與購買輸入通過。無公平舊版對照，不能換算整體加速。

7a30325將純數值試算改為補到下一個10/100倍數，未部署。模型仍停用；Pantheon閉包與未知副作用回退保持。以下診斷刻意略過Pantheon gate，僅證明所測狀態的結果一致，不能用來啟用正式嚴格投影。

- 目前存檔bulk10/100×銀行開關，各8對：32對完整候選三欄精確相同，狀態未變。bulk100平均原生160.043/167.861ms，投影73.185/78.539ms；僅同步冷快取局部比較。
- 全建築持有量0/100/300/600×銀行開關：64對通過。
- 非倍數起點9/99/123/199/299/599×銀行開關：96對通過。
- 各建築混合門檻前數量，6種輪替配置×銀行開關：96對通過。這些數量是隔離合成狀態，並非自然遊玩樣本。
- 完整updateUI：bulk10/100×銀行開關四組，81候選數值、80項策略分數與排序、商店順序、自動購買首選一致，狀態未變。固定順序單輪不作正式性能倍率。

raw保存於ignored tmp/bound-projection-*.json；未包含存檔於提交。129來源／91工具測試、typecheck、build通過，lint僅既有警告。原始自購非倍數異常尚未直接重現；嚴格模式尖峰仍未達改善驗收。正式遊戲未啟動，所有測試副本已退出。

## 延後收益批購價格修正驗收（2026-11-17）

ea19256，bundle0ef03abb154201e84931e95f917463766ade5769d95819428af2633a6f38acb0。預檢先保留原生整批延後刷新收益的價格路徑，各步原生餘額再與動態銀行額交叉核對。修前兩個回歸失敗；修後131來源／91工具、typecheck/build通過，獨立審查22購買測試通過、前P1已修。未知Spend/buyFunction副作用仍不作完整保證。

同快照16mods、bulk100、自動購買、嚴格模式，15秒暖機／60秒量測共3輪。更新p95為159.845／118.385／178.885ms，max215.645／228.130／216.565ms；frame p99為90.016／79.997／80.227ms。樣本有效、endpoint前三與購買條件皆pass。共1745購買呼叫、956成功、21496units，210次建築購買全100倍數，零銀行／invalid／付款／bulkViolation，無截斷。raw tmp/deferred-price-strict-natural/1794861210957與tmp/deferred-price-strict-repeats/1794861319938。

agent-desktop1.3.1已安裝，Windows權限正常，成功唯讀檢查隔離遊戲視窗。全部owned副本退出、正式未啟動。無公平舊版對照，不能換算性能改善；嚴格同步尖峰仍未解，原始倍數回報未直接重現。


## 2026-11-17 無銀行批購預檢

銀行關閉時省去第二輪逐件收益試算；原生整批價格預檢與 finally 基底還原保留。新增回歸先失敗100次收益呼叫，修後 fixture 零次。16mods 真遊戲 123→200 補買77單位，收益呼叫78→1次；五個既有正向／拒買案例通過。資料：tmp/no-bank-bulk-live.json。

fresh dev.ps1 check/build exit0：132來源／91工具、typecheck通過、lint 1既有warning。獨立 no_bank_review 無新增 finding，23購買測試通過；未知 Spend／buyFunction 副作用仍未完整模擬。

16mods、strict、bulk100、autoBuy、bank=false，15秒暖／60秒量三輪 exit0、樣本有效，endpoint 前三／購買條件全通過。914次成功、21488units、210次建築買入全100倍數，零銀行／invalid／付款／bulkViolation，無截斷。購買觀察含暖機。

|指標（ms）|第一輪|第二輪|第三輪|
|---|---:|---:|---:|
|update p95|424.930|205.885|396.440|
|update max|725.120|689.550|704.875|
|frame p99|429.928|129.979|309.899|

首輪有 agent-desktop snapshot／來源檢查干擾，後兩輪停止額外桌面操作仍有尖峰。銀行設定與先前不同，沒有同設定舊版對照，不宣稱整體改善；只證局部重算減少。raw：tmp/no-bank-strict-natural/1794861752123，bundle 見 inputs.json；owned 正常退出，正式未開，新修正未部署。


## 無銀行尖峰歸因

既有三輪 raw 重算歸因：最慢 update725.120／689.550／704.875ms，其中候選試算622.675／670.155／689.170ms；建築519.440／638.850／627.005ms，升級103.235／31.305／62.165ms。最後一輪176次呼叫為176不同token，未見重複候選／重入；helper近零。歸因資料 tmp/no-bank-spike-attribution.json。獨立 strict_redundancy_audit 唯讀審查未找到可在未知hooks下安全刪除的收益刷新；沒有以 identity 比較微省工替代尖峰目標。

快照實際 strategyAlgorithm=astar、bank=false、experimentalBatch=false、bulk100；先前計畫「保留現有Beam」文字已校正，未改玩家演算法設定。


## 無銀行舊新版自然對照

同快照、16mods、bulk100、autoBuy、bank=false、strict、既有A*設定；種子20261117，每方案三輪15秒暖／60秒量，全部有效、endpoint前三與購買條件通過。old bundle與既有部署hash完全一致；new僅差銀行guard，hash見inputs.json。

|方案|輪次|update p95 ms|update max ms|frame p99 ms|
|---|---:|---:|---:|---:|
|new|1|197.535|524.380|109.931|
|old|1|187.470|227.980|90.039|
|old|2|416.240|627.715|320.158|
|new|2|458.730|657.940|390.087|
|new|3|433.765|766.710|309.796|
|old|3|244.070|416.075|179.809|

未證明整體尾端延遲改善；新版省去批購預檢重算仍不足。自然購買進程分岔，不能報因果倍率。實購摘要（含暖機）：{"calls":2995,"successful":1617,"units":38030,"violations":0,"invalid":0,"paymentAnomalies":0,"bulkViolations":0,"buildingSuccess":372,"truncated":false}。raw：tmp/no-bank-ab-natural/1794862221500；runner exit0、owned退出。


新版無銀行30秒獨立CPU採樣 exit0、品質通過、owned退出；tmp/no-bank-cpu/1794862777054/cpu.json 與 flamegraph.html。update累積6503.893ms，simulation88.80%、CalculateGains75.48%、tier22.86%、Has12.45%、notation3.84%、helper0.016%（inclusive不可相加）。本輪max215.655ms，沒有重現六輪最高767ms，不能以此短採樣否定尖峰。熱點與先前相同，主要仍為建築逐單位收益計算。


## 長時間執行的診斷記錄上限

refreshDurationsMs 原每次更新無限追加；限制最近120筆，與策略耗時記錄一致，保留原陣列參照。回歸先RED（121筆），修後133來源／91工具、typecheck、build、diff-check通過，lint1既有warning。只修記憶體與診斷排序成本隨時間增長，不宣稱主尖峰改善，未部署。

另隔離CDP唯讀檢查 [[Scopes]]，hasGod的Closure (M.launch) 中M與Temple.minigame相同；未呼叫helper或更改Game。tmp/pantheon-closure-inspection.json，runner exit0、owned退出。此反射僅開發端可用，不授權產品略過pantheon-closure guard。modern-web-guidance performance已讀，未採直接yield／worker，因sandbox與閉包資料邊界未解。


## 已提交版本功能驗證與部署

f6fca99，隱藏功能 runner exit0：79有效候選，indexed／compiled／search 的數值、排序、utility、商店順序與自購首選一致，stateStable=true。資料 tmp/functional-history-cap/functional-1794863092361/report.json；功能驗證不代表FPS。

正式停止與模組ID核對後，備份部署2053.38，讀回SHA256 4a07b0b8e5e4fccc6b00de6b2835a2938b786f361fb3be44baf8d32f733f75ef。備份 D:\repo\Cookie-Payback-Planner\.worktrees\performance\tmp\production-backup-history-1794863126600；receipt tmp/history-cap-deployment.json。正式存檔未動、正式遊戲未啟動。嚴格尖峰仍未達改善驗收。


## 打包壓縮篩選（拒採）

同來源只切esbuild minify，bundle367329→191426 bytes；隔離16mods、bank=false、strict、bulk100、autoBuy，種子20261117各一輪15秒暖／60秒量。兩輪有效、endpoint前三／購買條件通過。壓縮／原版update p95 131.105／123.970ms、max218.145／225.460ms，frame p99 79.985／80.020ms。未見足以進入三輪驗收的訊號，不改正式建置。自然進程不同，非同輸入配對，也非跨bundle完整品質證明；只作篩選拒採。raw tmp/minify-ab-natural/1794863198147，exit0、owned退出、正式未開。


## 原生核心跨執行環境邊界

離線assert檢查exit0：原版main.js在裸vm context首先因Element未定義而拒絕載入；structuredClone含函式資料拋DataCloneError；閉包helper轉字串重建後M未定義。tmp/core-isolation-boundary.mjs／.json。這只證明直接搬函式／資料不足，未證所有DOM shim或完整重載皆不可行。完整副本可自行重建閉包，但存檔不能代表所有模組執行期狀態；仍須逐模組同步契約與generation驗證才能作正式推薦。維持隱藏真遊戲功能測試與可見最終效能測試，不新增另一份遊戲核心或啟用worker。


## 低負擔採樣

新增profile observeCandidates:false：不包裝updateBestCpsAcceleration，保留updateUI、helper、frames、longtasks；預設仍記候選。assert驗證函式identity、100001次未記呼叫不截斷、更新計時與cleanup；check exit0，133來源／92工具、typecheck通過、lint1既有warning。未改產品bundle。

隔離單輪15／60，移除候選包裝仍max215.990ms、p95188.480ms、framep9980.031ms；有效、endpoint前三／購買條件pass，raw tmp/low-overhead-strict/1794863559423，exit0、owned退出。期間有工具檢查，不作精確observer成本比較；足證無候選包裝時仍有同步尖峰。


## V8熱點狀態觀察

隔離副本加診斷專用allow-natives-syntax旗標；每15秒讀一次GetOptimizationStatus，共四次。CalculateGains／GetTieredCpsMult／Has／updateBestCpsAcceleration均回49，refreshes113→226→332→437；未見取樣時狀態切換。數值位元語義依V8版本，未據此宣稱已最佳化或排除兩次取樣間deopt，更未強制OptimizeFunctionOnNextCall。tmp/jit-inspection.json，exit0、owned退出、正式未啟動／未改旗標。此結果不足支持JIT調整，正式不採引擎旗標。

## 無 UI 原生核心 smoke 入口

### 可選實驗剩餘熱點

獨立30秒CPU採樣tmp/partial-bulk-cpu/1794924322194，15秒暖機、16mods、autoBuy／bulk100、原存檔銀行設定；有效、endpoint前三／購買條件通過。產品累計100次audit零失配、持續enabled。update累積5104.273ms，候選計算78.45%、CalculateGains62.64%、tier18.33%、Has10.58%、notation7.91%（inclusive不可相加）。本輪max116.965ms，未重現六輪192ms，不可據此排除尖峰；Profiler有額外成本。flamegraph.html已產生，runner exit0、owned退出，正式保持停止。

標註四個固定ID查找改用getElementById，省去CSS selector查找；不改計算、快取或玩家設定。這是局部精簡，未做效能對照，不宣稱主尖峰或整體倍率改善，未部署。

### 補倍數可選實驗自然驗收

e40961c來源，bundle e7c0d4eaa3c25d0728754f22f83d05678645913c38260e819592a9c626136fa2；16mods固定順序、同轉生快照、autoBuy／bulk100／既有A*，種子20261117，15秒暖機／60秒量測各三輪。關閉逐候選與gains觀察包裝，保留整輪更新、frames、longtasks。六輪有效，endpoint前三與購買條件核對全通過。自然購買進程分岔，不報因果倍率，亦無舊實驗版對照，不能把全部收益歸因補倍數擴充。

|方案|update p95 ms（三輪）|update max ms（三輪）|frame p99 ms（三輪）|
|---|---|---|---|
|嚴格|185.460／178.645／181.715|215.290／215.780／211.970|89.906／80.012／79.934|
|可選實驗|68.955／76.740／77.655|100.375／128.875／192.480|40.032／49.963／50.014|

實驗三輪持續enabled，原生audit共156／160／154次，全零失配；採樣期間增量115／120／113次。六輪3254購買呼叫、1785成功、41569單位，406次建築成功購買全100倍數，銀行額／invalid／付款異常／bulkViolation皆0，無截斷。最長阻塞仍可達192ms，不能宣稱消除卡頓或嚴格模式改善。raw與機器摘要：tmp/partial-bulk-product-natural/1794923475330，runner exit0、owned全部退出、正式未啟動／未部署；外部任務未同步。

後續交付：核對正式主程序為0、來源與正式模組ID後，備份並部署61f807c／2053.51。讀回main.js SHA256 e7c0d4eaa3c25d0728754f22f83d05678645913c38260e819592a9c626136fa2，與上述六輪bundle完全一致；info.txt逐欄一致。備份tmp/production-backup-partial-bulk-1794924200578，receipt tmp/partial-bulk-deployment.json。正式遊戲保持停止，存檔／設定未動，預設嚴格仍不變。只交付可選功能切片，主尖峰任務未完成。

可選近似的補倍數擴充：抽樣終點改為下一100倍數，中點改為實際補買量的一半；補買不超過5單位時保持原生，避免抽樣成本超過收益。工具測試涵蓋123／150／198／199／200起點，逐步輸出、最大抽樣量與finally還原一致，既有隱藏中間效果反例仍保留。嚴格路徑與輪替零容差核對未變；真遊戲完整品質與自然效能尚待驗證，不宣稱改善或部署。

e40961c fresh check/build exit0：133來源／92工具、typecheck通過、lint1既有warning。隔離16mods同步原生／近似／原生，123／150／198／199四起點，固定時鐘、清候選快取；既有餘額四情境全數值一致、原生前後穩定、前三一致，但supported=0，不能當加速驗證。另高餘額1e100、bank=false合成狀態，四情境同樣全數值／前三一致；123原生130.540／近似22.415／原生125.790ms，150為86.850／21.140／87.220ms；198／199保持原生。此為單次候選計算篩選，未含產品輪替audit、自然幀或多輪驗收，不報整體倍數。raw tmp/partial-bulk-quality.json、tmp/partial-bulk-affordable-quality.json；兩runner exit0，owned退出、正式未啟動、未部署。

`node scripts/perf/core-smoke.mjs <原生main.js路徑> 2.053` 以 stdlib vm 載入未修改原生來源、最小 DOM 替身；在 Init 首次排程時拋專用 sentinel，僅接受該終止原因，其他初始化例外皆失敗。未提供檔案、網路或正式儲存介面，也不執行排程。這是受信任本機遊戲來源的開發檢查，vm 不是安全沙箱。

本機執行 exit0，原生來源 SHA256 a8813ec2ee97edf5ebff6a3ce2037dcb65c08abd13c123bb92efda89b06ef4f7；建立20建築／875升級，空產量0、100 Cursor產量10、Reinforced index finger購入後20，assert全通過。版本由命令輸入，不作來源版本認證。這推進先無UI開發的可行性，仍只是部分初始化，未涵蓋存檔、16模組、完整推薦與畫面效能；不得當正式 worker 或解除閉包 guard 的依據。

可選第三參數 `<minigamePantheon.js路徑>` 載入未修改 Pantheon，再呼叫原生 launch；同一 VM 重載兩次，保留舊 helper，驗證各自讀取自己的 M.slot，新舊槽位互不影響，Industry 第一／第二槽的原生產量倍率1.1／1.06皆在1e-12容差內。本機 exit0；Pantheon SHA256 af08c31c4564d445cc2d1a7d101c4a63b57aa9b89991b93b8a65f4c0427573a0。只證受控初始化會自行建立閉包，未證已有共存模組的玩家閉包來源；正式 pantheon-closure guard 保留。下一步以此原生環境驗證建築／升級依賴反例，再決定增量計算可支援範圍。

第四參數可指定 ignored `tmp/native-upgrade-survey.json`：固定 VM 時鐘、所有建築100、清空升級購入狀態、Industry第二槽，逐項切換875升級的 bought，觀察原生raw／unbuffed產量、20建築storedCps／單價與一項代表升級單價；每次還原後重新計算，要求所有觀測與基底完全相同。exit0，875次還原一致，673項有觀測效果。原始結果保留tmp，未提交。此處只改bought，不執行buyFunction，不測解鎖條件；代表升級單價不是所有升級價格。單一合成狀態的陰性結果不能證明無依賴，更不能授權嚴格模式剪枝。已觀察跨建築效果（如Farmer grandmas）、全建築價格效果（Season savings）；後續須用多狀態／組合升級覆蓋條件效果，黑箱紀錄只能作候選提示。

原生組合反例已加入同一可重跑檢查：Million fingers單獨購入時Cursor storedCps維持0.106；先有Thousand fingers時為201.506，再購入Million fingers升至1007.106。所有非Cursor建築為0時，Thousand fingers亦無效果。最後恢復100建築與未購入升級，觀測完全回基底。exit0，證明即使同版本、同函式來源，升級效果邊也依其他升級與建築持有量變動；靜態單項陰性索引不足以支援嚴格剪枝。保留黑箱作提示，正式每步原生計算不變，未宣稱效能收益。

同指令亦包含建立者 provenance 原型：驗證整個 minigame launch 函式雜湊（SHA256 5b06346b8e29bb528441c1862474b67306bf11659210cad30c02b37f6e6a067e），並在親自執行建立時以 WeakMap 綁定新 Game.hasGod 與其 Temple minigame 實例。原型驗證：已存在的 helper 不能追溯補認證；未知 launch 拋例外；後續替換 helper 立即喪失綁定；assert 全通過，exit0。這證明可在原生執行期建立真閉包邊界，但正式模組若在 Temple 升級／載入後才啟動，已存在的 hasGod 仍屬未知閉包，必須維持 pantheon-closure 回退。正式 guard 保留，未改產品代碼。

### tier 集合迭代診斷（2026-11-17）

保留原生公式與每次 hook，只將 GetTieredCpsMult 的兩個 for-in 改為 Object.values／for-of；未展開 tier、未快取收益、未減少 CalculateGains。診斷工廠 scripts/perf/tier-values.mjs 不接產品。

無UI原生核心16對、每組1000次CalculateGains，raw／unbuffed與所有storedCps完全一致；僅初篩，無存檔或共存mods。raw：tmp/tier-values-core.json。隔離16mods、bulk100、固定時鐘、冷cache、逐候選嚴格計算16對亦完全一致；排除前4對後，原生／候選中位157.243／135.090ms，p95 162.975／145.070ms。raw：tmp/tier-values-live.json，runner：tmp/tier-values-live.mjs。這是候選計算區段，未測完整更新、自然幀、購買或任意hook相容性，不宣稱整體倍率。

可重跑測試證明getter反例：原生於Has後再取upgrade.power，Object.values提前取值，結果12／6；另會排除繼承enumerable屬性。因此不可直接納入預設嚴格。下一步需驗證保留屬性讀取時序的key迭代，或完整data descriptor／prototype guard成本，未知資料仍回原生。正式bundle未變；runner exit0、owned退出，CIM未見遊戲程序。

fresh dev.ps1 check exit0：133來源／93工具測試、TypeScript通過，lint 0 errors／1既有warning。無產品來源改動，未build或部署；外部任務未同步。

### 啟動後暫時盤點失敗恢復（2026-11-21）

隔離tier防護診斷啟動後，CIM一度返回不完整欄位，startOwned尚未寫receipt便中止。後續CIM與CDP確認唯一隔離主程序；比對本次launch lock的owner PID、執行檔、CreationDate及父PID，正常關閉並移除相符token的鎖；未再啟動、未關正式遊戲。診斷當次沒有性能樣本。

process.mjs改為在既有啟動鎖內、原期限內重查同一expectedPid；不重新launch。持續觀測失敗仍保留鎖，Error.cause保留原始原因；多主程序仍立即失敗。回歸覆蓋暫時失敗後成功、launch只呼叫一次、持續失敗保留鎖與原因。dev.ps1 check exit0：133來源／94工具、TypeScript通過、lint 0 errors／1既有warning。僅工具修改，未build／部署。

### tier key 迭代與資料檢查成本（2026-11-21）

同一隔離16mods／bulk100固定時鐘冷cache診斷，key迭代16對推薦數值一致；排除前4對，原生／候選中位151.285／139.663ms，p95 155.015／153.755ms。raw：tmp/tier-keys-live.json，runner：tmp/tier-keys-live.mjs。僅逐候選計算，沒有完整更新或自然幀證據。createTierKeysCandidate保留原屬性讀取時序；可重跑測試確認values的getter反例已消除，但繼承enumerable升級仍出現原生15／候選3，因此不能直接啟用。

初版prototype檢查全回退原生，supported0／fallbacks662400，不可當有效候選效能比較（tmp/tier-keys-descriptors-live.json）。另以每次呼叫檢查整個物件own descriptors的診斷量成本，非完整安全認證：2對接管81920／回退0，推薦數值一致；原生162.545／149.485ms，候選22227.830／22090.905ms，拒採此粗粒度檢查方式。raw：tmp/tier-keys-descriptor-short-live.json。先前16對長版Runtime.evaluate超過45秒中止，無有效結果；已正常關閉owned副本。不能以這個昂貴原型排除較窄的防護設計；本輪不接產品、不部署。

fresh dev.ps1 check exit0：133來源／94工具、TypeScript通過；lint 0 errors／1既有warning。最終CIM未見遊戲程序。raw均留ignored tmp，正式模組與設定未變。

### 局部快取 Pantheon 閉包回退（2026-11-21）

重新檢查bulk100局部快取，修正前原生逐hit oracle 96740次完全一致（tmp/bulk100-local-oracle-live.json）；加入oracle會額外呼原公式，不作性能比較。原生／舊純模型／setAmount分支更新12組固定輸入推薦數值一致，去前4組中位155.125／95.030／93.590ms，僅逐候選診斷；old/current並非每組都較快，沒有自然尖峰證據，setAmount候選已完整撤回。raw：tmp/branch-update-live.json。上述快取仍未經完整安全認證，不因局部耗時啟用。

唯讀子代理重現真正反例：hasGod來源完全相同，但其閉包M.slot[0] getter可將Farm fortune.bought由0改1。保留完整CalculateGains不會消除這種隱藏寫入；舊cache回10，原生10.700000000000001。新增回歸先以exit1重現wrapper錯誤安裝，再修正為存在hasGod屬性即回原生，不讀其getter；快取安裝後才新增helper亦永久停用該scope快取。覆蓋一般快取、延後純模型安裝及途中getter加入。純模型與局部cache旗標保持false；此修正不能證明其他未知閉包安全。

fresh dev.ps1 check／build exit0：136來源／94工具、TypeScript通過，lint 0 errors／1既有warning。獨立複核先前13項cache測試通過、無新增具體缺陷；最後新增途中helper回歸由完整check覆蓋。CIM未見遊戲程序；正式存檔與模組未動，本輪未部署，外部任務未同步。

### 色彩輸出型別使 notation cache 失效（2026-11-21）

updateColorRender宣告回傳string，實際chroma.scale回傳Color物件；每次重建色階後即使顏色相同，notationCache以物件身分比較仍失配，重寫標籤。以真實chroma單元測試先重現object／string失配，再使用既有chroma原生.out('hex')符合字串契約；沒有替換色彩函式庫或修改推薦計算。

16mods／bulk100隔離遊戲，固定時鐘擷取80候選與metric。舊版／新版交錯12對，每組固定輸入重建色階並重畫20次；所有候選推薦數值、標籤HTML、CSS顏色完全一致。舊版每組920筆childList變更，新版全部0；耗時raw見tmp/color-cache-live.json，runner與色彩模組build在tmp/prepare-color-cache.mjs。這是固定輸入標註區段，不是完整更新或FPS；新版亦有33.015ms離群，不能宣稱消除尖峰。診斷先前舊版模組build移除.out造成TS換行解析失敗，未啟動遊戲；改用.out()保持舊版Color輸出後成功，最終runner exit0、owned退出。

fresh dev.ps1 check／build exit0：137來源／94工具、TypeScript通過；lint 0 errors／1既有warning。自然高負載與正式部署待後續驗收；預設仍嚴格。

### 色彩快取修復自然六輪與部署（2026-11-21）

同一轉生快照、2.053、16mods固定順序、autoBuy／bulk100／銀行開啟／astar，兩版皆嚴格；種子20261121打亂、各三輪，每輪暖機15秒／量測60秒，不包逐次gains或候選計時、不開CPU profiler。六輪有效，endpoint前三與購買輸入均pass。natural進程仍有分岔，不作因果倍率或FPS改善宣告。

|指標ms（各三輪）|舊Color物件輸出|新hex字串輸出|
|---|---|---|
|更新p95|121.225／192.415／152.150|119.510／184.275／142.095|
|更新max|217.695／219.010／206.565|212.140／206.355／208.695|
|frame p99|79.923／79.999／80.001|79.980／80.044／79.941|
|longtask max|217.820／220.575／206.645|213.005／206.475／209.000|

3,075購買呼叫、1,713成功、41,028單位；404次建築成功購買全到100倍數，零銀行／輸入／付款／bulk違規，未截斷。raw與機器摘要：tmp/color-cache-natural/1795275697477/final-assessment.json；runner：tmp/color-cache-natural.mjs。session58436 exit0，owned均正常退出。結果支持交付正確的字串快取，但frame p99沒有改善，嚴格主尖峰仍未完成。獨立複核確認Color.toString與scale.out('hex')均使用同一hex轉換，195組含alpha、反向／重複domain、範圍外與非有限值字串一致；17項performance測試通過，未改檔或啟動遊戲。

已部署來源7614b05／2053.58，SHA256 c76476f75c9cbe02974af1648e63a29cfae4eae45e0b385170ba84ac4bf969e3，與六輪新版bundle一致。目標為D:/SteamLibrary/steamapps/common/Cookie Clicker/resources/app/mods/workshop/BestDealHelper；備份tmp/production-backup-color-cache-1795276248867，receipt tmp/color-cache-deployment.json。部署前核正式程序停止，讀回main.js hash及info逐欄一致；正式存檔／設定未動、未啟動正式遊戲。預設嚴格，其他模型仍停用。外部任務未同步。

### tier 作用域與函式建立方式對照（2026-11-21）

保留for-in、屬性讀取、公式與hook呼叫，僅在隔離遊戲將原tier函式的var改let；16對固定輸入、逐候選冷cache數值完全一致。去前4對中位原生159.268／候選152.758ms。另16對bind對照數值一致，中位150.527／149.225ms，未見穩定收益；不跨啟動比較數字。

為排除重新建立函式本身的影響，補12組原生／同var來源clone／let候選三方對照，推薦數值完全一致；去前4組中位153.980／148.883／151.040ms，max157.475／153.350／160.415ms。let沒有穩定優於同來源clone，且max反向；拒採作用域改寫與bind，不改產品、不部署。不能由此推論JIT根因或完整更新／FPS收益。原始資料與runner：tmp/tier-scoped-live.json、tmp/tier-bound-live.json、tmp/tier-clone-control-live.json（同名.mjs）。對照runner首次產生時Node template字串誤展開而失敗，未啟動遊戲；修正後三支runner皆exit0、owned正常退出，最終CIM無遊戲程序。

本階段只有報告／計畫修改，無新產品測試或build；正式仍2053.58／7614b05來源。嚴格主尖峰未完成，外部任務未同步。

### Has重新建立與逐次依賴驗證（2026-11-22）

Has原公式不展開、不cache查詢結果、保留每次呼叫，僅重新建立相同來源函式：16對同輸入品質一致；去前4對，原生／候選中位163.280／161.932ms，max167.730／172.195ms。沒有穩定收益，拒採；raw：tmp/has-clone-live.json。

另以局部CPS快取原型，每次回傳前以own data descriptors核對實際tier／synergy／fortune／Grandma／Has輸入，保留完整CalculateGains；不預設hasGod閉包純度。四對數值一致，每次接管27157 hits／10103 misses／0 fallback，但候選833.695–844.970ms，原生151.900–157.875ms；逐次驗證成本超過省下的原生公式，拒採此原型，未接產品。資料：tmp/dependency-cache-live.json；原型與runner在ignored tmp/dependency-cache.ts與同名-live.mjs。這只評估該實作，不證明其安全性或排除其他驗證方法。runner最初import路徑替換錯誤、未啟動；修正後兩支診斷皆exit0、owned正常退出，CIM無遊戲程序。

目前正式仍2053.58；沒有新產品修改、建置或部署。已提問釐清嚴格最終效能門檻；未收到答覆前繼續以降低明顯卡頓為目標，不將局部改善當整體完成。外部任務未同步。

### 兩階段 creator caller 來源觀察（2026-11-22）

開發工具scripts/perf/creator-observer.mjs觀察完整來源已知的launch→init→hasGod建立鏈：只在non-strict setter的直接caller為原launch、launch.caller為私有wrapper、當次this為指定owner時記錄init函式身分，再以helper賦值的直接caller回連owner。不額外呼叫helper判斷閉包，也不追認既有helper。同來源重建、strict／不可觀察caller、未觀察重入、繼承setter均不取得綁定；scope結束只還原完整描述子仍屬自己的欄位，保留第三方修改，關閉後不再授予綁定。

初版錯認helper直接由launch建立，實際是init；failed assert格式化完整owner導致Node Array buffer allocation failed，改用布林斷言後定位並修正。獨立review另重現繼承setter被繞過與第三方鎖定launch中斷清理兩個缺陷，已新增回歸並修正；5工具測試、review複核原反例通過。原生無UI2.053核心實跑creatorCallerObservation=true，原生main／Pantheon／launch SHA仍與既有記錄一致。只證明捕獲owner，不證明owner資料純度或其他模組安全。

再將觀察工具與已部署bundle前置組合，僅寫入驗證隔離副本；一般啟動中觀察scriptLoaded並保留其toString供CCSE改寫，不手動重啟Pantheon。16mods／CCSE2.036皆載入，唯一Temple建立事件observed=true，實際helper綁定目前Temple minigame；helper／init皆還原data descriptor，Temple CCSE callback數為1。raw：tmp/creator-observer-startup.json；runner／準備入口：tmp/creator-observer-startup.mjs、tmp/prepare-creator-startup.mjs。session76670 exit0、副本正常關閉。這個前置wrapper尚未納入產品，不據此宣稱所有共存語義、推薦品質或效能通過。

fresh dev.ps1 check exit0：137來源／99工具、TypeScript通過，lint 0 errors／1既有warning；原生core smoke exit0。沒有產品來源修改或新build／部署，正式2053.58與Pantheon guard保持。下一步須使用固定可信來源目錄、私有綁定與逐次owner資料驗證，完成同輸入oracle及自然高負載後才考慮投影啟用。

### 私有Pantheon來源綁定與投影資料邊界（2026-11-22）

creator觀察器移入src/calc/creatorObserver.ts，工具改共用同一實作。產品正常scriptLoaded建立期間，以固定2.053完整launch來源認證launch→init→hasGod，私有WeakMap記實際owner；保留CCSE來源改寫與原始參數，dispose還原自身descriptor。既有helper不追認，CSP／caller不可觀察或未知版本回退，不額外呼叫helper探測。owner與slot／god資料另驗，productionProjectionEnabled仍false。

補hasAura來源／hook、aura選擇、非列舉資料、可寫輸出、Win來源與pending achievement邊界；kitten pool拒getter。複核重現Cursed finger.power／wrinkler.phase getter及rawHighest／upgrade pool coercion漏洞後補回歸：Cursed finger直接回退，phase與raw值限有限數字，pool／tier限原生primitive。回歸不執行getter或valueOf。針對本輪修正的獨立複核無阻擋項；這不是整個JS物件圖的安全證明。

最新bundle399.6kb，16mods正常cold startup，無額外前置wrapper；固定時鐘，同輸入完整updateUI交錯12對。每次18項普通建築接管，共216；其餘候選回原生。候選逐項數值、前三、購買輸入與eligibility、原生最高產量／mouse／milk／building／mult／sucked／effs／byType／lump ages／storedCps輸出皆JSON完全一致。原生158.765–188.070ms，投影69.730–117.185ms；這是同步固定輸入更新，不含實際自購、自然進程、FPS或active buff驗收，不能宣稱整體加速倍率。raw與runner：tmp/provenance-final-guard-update.json、同名.mjs；exit0、owned正常關閉。前一版12對亦一致，保留tmp/provenance-full-update.json供追溯。

fresh scripts/dev.ps1 check與build exit0：149來源／99工具測試、TypeScript通過，lint0 errors／1既有no-this-alias warning。原生core smoke exit0，main／Pantheon／launch SHA與前段一致，creatorCallerObservation=true。git diff --check通過。正式仍2053.58，存檔設定未動、本輪未部署、模型flags false；嚴格卡頓主目標未完成。下一階段先統一active-buff等待計算，再做自然六輪與啟用驗收。外部任務未同步。

### 原生與投影共用buff等待計算（2026-11-22）

estimateWaitSeconds原數學移入私有estimateWaitWithBank；原生傳目前銀行，投影傳候選raw產量決定的銀行。修正舊投影callback未除passive／click即積分的差異；保留compiled分支、elapsed offset、零缺額早退及原生非有限值行為。新增實際callback接線測試，baseline／indexed／compiled各涵蓋兩個buff不同到期點、elapsed0／3／10／12、四個價格及基底與候選銀行不同；另驗100/224明確預期值。

fresh dev.ps1 check／build exit0：152來源／99工具、TypeScript通過，lint0 errors／1既有warning，bundle399.5kb。尚未解除active buff guard，投影flag仍false；本階段不宣稱live buff或自然效能已通過。

### 有限正數timed buff投影（2026-11-22）

共用等待計算後，投影允許有限正數passive／click乘數；timer限有限非負數、實際觀察名稱限string，拒絕getter及coercion物件。Cursed finger、ages／Century egg仍回原生。新增有效雙buff與opaque timer/name回歸。前階段的三variant接線測試是在refresh外選定variant，未走optimized compiled分支；真正withRefresh比較由既有performance.test.js覆蓋，不把該接線測試當compiled分支證明。

16mods／bulk100／銀行1200秒／固定click income，none、Frenzy、Frenzy+Click frenzy、Clot各3對完整updateUI，同步固定輸入交錯比較。12對逐候選item、原生outputs皆JSON完全一致，前三／購買條件通過，接管17–18項；原生163.495–217.805ms、投影83.115–125.100ms。raw／runner：tmp/provenance-active-buff-update.json、同名.mjs；exit0、owned關閉。這不是實際自購安全或自然frame證據。

fresh dev.ps1 check／build exit0：153來源／99工具、TypeScript通過，lint0 errors／1既有warning。投影預設仍false、未部署；接續同快照自然六輪驗收。

### 按名稱查詢buff的繼承getter回退（2026-11-22）

複核重現非列舉繼承Everything must go getter逃過buff迭代，known hasBuff仍會讀取並改動baseCps。rule gate現拒buffs非plain prototype，五項價格buff另逐名own-data驗證；Cursed finger亦維持own-data回退。新增五名稱不讀getter回歸，獨立複核原反例封住。fresh dev.ps1 check／build exit0：154來源／99工具、TypeScript通過，lint0 errors／1既有warning；bundle400.2kb。

首批自然量測tmp/projection-natural先使用修正前bundle，首輪亦與驗證程序重疊；只保留診斷，不作正式比較。runner具bundle hash守門，修正版build後於下一輪啟動前停止，待正常退出後以新bundle重跑。投影仍false，未部署。

### 嚴格投影自然六輪（2026-11-22）

來源fab642d、bundle SHA256 46b8df6fc7b267b647fe234dab2504d826134186868510ca20fa4e9f80e32607；同一轉生快照、2.053、16mods固定順序、自購／bulk100／銀行／astar、非近似。相同bundle只切productionProjectionEnabled，種子20261122打亂，各3輪，15秒暖機／60秒量測；沒有同時執行測試、build或CPU profiler。六輪均有效、未截斷，輪末同輸入exact／前三／購買條件全通過。

|指標ms（各三輪）|原生|投影|
|---|---|---|
|更新p95|180.455／101.475／187.030|70.175／68.080／68.795|
|更新max|216.170／217.865／220.270|101.050／103.880／105.150|
|frame p99|70.010／79.730／79.982|40.085／40.006／40.007|
|longtask max|216.285／218.045／220.440|101.185／104.070／105.435|

共3661購買呼叫、2017成功、47853單位；469次成功建築購買全到100倍數，零銀行／付款／輸入／倍數違規。三輪投影在正式量測窗合接管3479項；首輪完整期間fallback只有item（含升級、Cursor、Grandma）。自然自購進程仍分岔，不宣稱因果倍數；結果顯示尖峰與尾端frame穩定下降，但max仍超過100ms，嚴格卡頓目標未完。

raw／摘要：tmp/projection-natural/1795282514496/final-assessment.json；runner：tmp/projection-natural.mjs，session57208 exit0、owned正常退出。前批因build hash改變正常中止且與測試重疊，未混入本組。正式仍2053.58、未部署、投影預設false。下一步檢查尚未接管的Cursor／Grandma能否沿用已驗證的特殊建築投影，避免在已有100ms尖峰時停止。

### 特殊建築投影接線（2026-11-22）

解除adapter對id0／1的排除，沿用既有Cursor／Grandma純模型、source／data／tier guard；不新增公式。特殊模型原有2000 seeded原生對照，完整產量模型已涵蓋id0／1 amount overlays與Grandma tier。新增兩個adapter不修改Game回歸；Cursor未知tier仍回原生。獨立review無新增阻擋項。

16mods隔離完整updateUI：四buff情境12對，加bulk1／10／100 × Cursor和Grandma持有量123／199／200 × 四buff情境36對，共48對；逐候選數值、原生outputs JSON exact，前三與購買條件全通過，接管19–20項。raw／runner：tmp/provenance-special-buff-update.json、tmp/provenance-special-bulk-update.json與同名.mjs；兩個session exit0、owned正常關閉。不將合成ownership狀態或固定輸入耗時當自然收益。

fresh dev.ps1 check／build exit0：156來源／99工具、TypeScript通過，lint0 errors／1既有warning。預設flag仍false，正式未部署。自然效能需要下一獨立六輪；前段fab642d數據不能作本次新增特殊建築收益。

### 特殊建築版自然六輪與更新flamegraph（2026-11-22）

來源6cb853d、bundle SHA256 a0014a02d7e0b82c536a661c28376160b53391225a19d4e9b9549379361cde10；同轉生快照、16mods固定順序、自購／bulk100／銀行／astar，種子20261122，各3輪15秒暖機／60秒量測，未同時執行測試或build。六輪有效、輪末exact／前三／購買條件皆通過。

|指標ms（各三輪）|原生|投影|
|---|---|---|
|更新p95|339.960／124.080／191.800|61.360／114.380／58.560|
|更新max|574.595／209.730／533.190|100.780／206.445／88.645|
|frame p99|249.980／79.902／150.120|40.038／100.092／40.011|
|longtask max|574.815／210.515／533.760|101.400／206.860／88.810|

3535購買呼叫、1944成功、44333單位；零銀行／付款／輸入／倍數違規，未截斷，量測窗接管3842項。原生與投影皆出現啟動間異常波動；當時主機總CPU約12%，無證據可歸因全機飽和或特定程序。保留所有資料，不剔除慢輪，不跨啟動宣稱因果倍率或特殊建築額外收益。raw／摘要：tmp/special-projection-natural/1795283283563/final-assessment.json，runner tmp/special-projection-natural.mjs，session71671 exit0、owned關閉。

另以同版隔離副本，15秒暖機／30秒CDP CPU profiler、interval1000μs，保留原生候選／gains函式身分，sample有效。新flamegraph：tmp/special-projection-cpu/1795283814134/flamegraph.html；cpu.cpuprofile與report.json同目錄，runner tmp/special-projection-cpu.mjs，session76169 exit0、owned關閉，沒有啟動正式遊戲。updateUI採樣3162.572ms中，候選模擬76.30%、projectBuildingTrial45.91%、fork16.58%、原生CalculateGains22.34%、rule guard9.91%、notation7.66%、strategy2.44%為inclusive，不能相加。原生gains占比已由初始74.58%降至22.34%，剩餘成本已有投影自身；兩次profile負載不同，不拿百分比換算時間倍率。

嚴格主尖峰仍未完成，flag false、未部署。下一步研究已驗純模型的單調性：若整批末餘額仍高於末產量銀行額，是否可精確證明所有中間步都付得起，保留逐價格加減順序只略過中間production；不得以抽樣、未知callback或近似取代證明。

### 純模型可負擔整批的精確捷徑（2026-11-22）

buildingTrial加入唯一由已guard投影啟用的monotoneProduction契約：固定tier的raw單調非減、價格純函式。先算批末production，逐價格原順序扣款與累加paid，末餘額嚴格大於末銀行才略過中間production。等值、非有限值、批末非safe integer保留逐步路；tier仍批末處理。證明見incremental-simulation.md。複核找出MAX_SAFE_INTEGER逐++停滯與直接加units不同，已補快路safeinteger門檻及回歸，複核原反例封住。

3000 seeded cases涵蓋1e-12至1e300、bulk10/100、123/199、銀行、tier，與逐步版exact；等值銀行、77步只做一次production與安全整數反例均回歸。獨立研究另做40000模型單調檢查與248391個通過步驟，無反例；這些不能取代source／data guard。fresh dev.ps1 check／build exit0：160來源／99工具、TypeScript通過，lint0 errors／1既有warning；bundle401.2kb。

原生遊戲16mods／四buff／bulk1/10/100／amount123/199/200完整更新36對，逐item及原生outputs JSON exact、前三／購買條件全過；raw tmp/provenance-monotone-bulk-update.json（安全整數補丁前，測試持有量均在安全範圍）。修後另以只加診斷計數器的隔離bundle36對，前12對原快照／高銀行無skip，後24對將隔離記憶體cookies設1e200，累計1032批判斷、552批／18576單位skip，全36對同樣exact。raw tmp/provenance-monotone-coverage.json、runner同名.mjs；診斷instrumentation在tmp/monotone-observed-main.js，不進產品。兩session exit0、owned關閉。未把人工高餘額或diagnostic bundle耗時當自然效能證據。

預設投影仍false，未部署。自然高負載覆蓋率可能低，需下一階段量測，不宣稱這個捷徑已解決主尖峰。

純模型整批捷徑補充：目前餘額若不高於當前銀行額，依單調性已可排除成功，直接保留逐步路，不預算批末production。新增11/11 targeted測試通過（含原3000cases），diff-check通過；本小階段未重跑全套或build，後續正式比較前一併建置。

### 預設啟用前的純資料邊界總審（2026-11-22）

總審重現ObjectsById自有map callback、unshackle/Has名稱與tier lookup key coercion、BuildingsOwned在computeLumpTimes的valueOf。另同類盤點補aura name/id、building amount/bought、item id與tier threshold算術前的primitive驗證。標準dense array拒自有／繼承methods；own/read/data拒非string或finite-number key，Has拒非string/undefined；tier必須綁目前building並與Game.Upgrades登錄身分一致，foreign tier在價格callback前回退。所有已重現反例已加不執行callback回歸。

初版更嚴schema使舊unsupported-tier fixture（缺name）先走malformed回退；補明確Farm/unknown tier後仍覆蓋原unsupported分支。fresh dev.ps1 check／build exit0：167來源／99工具、TypeScript通過，lint0 errors／1既有warning，bundle402.7kb。獨立review先複核原總審反例，後複核早期算術／foreign tier，共42及43 targeted通過，無本批具體阻擋項；不宣稱涵蓋任意未來模組。

最終bundle16mods／四buff／bulk1/10/100／amount123/199/200原生完整更新36對，全逐item／native outputs JSON exact、前三及購買條件通過，每對20項接管。raw／runner：tmp/provenance-final-boundary-update.json、同名.mjs，session72365 exit0、owned關閉。先前tmp/provenance-key-guard-update.json僅作中途診斷。預設flag仍false、尚未部署；自然負載驗收使用後續最終bundle。

### 嚴格投影預設候選（2026-11-22）

本分支將productionProjectionEnabled預設true，metadata標為guarded-projection；實驗近似experimentalBatch預設仍false。只在已驗2.053規則、空或已知hooks、純資料與Pantheon來源綁定通過時接管，未知路徑保留原生。變更說明與效能工具README同步；既有Pantheon helper不追認，熱載入可能無接管，正常新啟動才取得綁定。

fresh dev.ps1 check／build exit0：168來源／99工具、TypeScript通過，lint0 errors／1既有warning。新增預設旗標與近似關閉回歸；原生2.053 core smoke exit0，main／Pantheon／launch SHA與既有記錄相同、creatorCallerObservation=true。此階段只提交候選，正式仍2053.58、未部署；接續同bundle的預設cold-start與自然六輪驗收，通過後才整合部署。

### 預設嚴格版最終六輪與部署（2026-11-22）

來源354115b／2053.73，bundle SHA256 d6200a5e87756e617db362ea1aed311b7884029b33249c9055bc4176864b3eae；同轉生快照、2.053、16mods固定順序、自購／bulk100／銀行／astar，種子20261122，各3輪，15秒暖機／60秒量測，無並行測試、build或CPU profiler。六次cold-start在任何量測覆寫前均確認productionProjectionEnabled=true、experimentalBatch=false，逐輪固定mod順序。六輪有效，輪末同輸入exact／前三／購買條件全通過。

|指標ms（各三輪）|原生|嚴格投影|
|---|---|---|
|更新p95|121.430／147.385／152.190|55.945／56.320／59.725|
|更新max|212.960／216.565／210.435|81.840／89.720／81.770|
|frame p99|80.013／79.976／69.997|39.988／30.007／30.016|
|longtask max|213.275／216.810／210.560|82.000／89.910／82.185|

共3130次購買呼叫、1741成功、42063單位；415次成功建築購買全到100倍數，零銀行／付款／輸入／倍數違規，未截斷。投影量測窗合接管4138項。raw／摘要：tmp/final-projection-natural/1795285864401/final-assessment.json，runner tmp/final-projection-natural.mjs，session67618 exit0、owned正常退出。自然進程仍分岔，不作因果倍數；更新p95/max與尾端frame均穩定降低，但仍有82–90ms同步阻塞，未宣稱消除卡頓或完成剩餘尖峰目標。

另將驗證副本還原原始非同步LoadScript，使用同bundle與2053.73 info，正常啟動16mods，再做四buff／bulk1/10/100／amount123/199/200共36對，逐item與native outputs JSON exact，前三／購買條件全過，接管19–20項，證實不是只能在ordered loader取得綁定。raw／runner：tmp/provenance-native-loader-update.json、同名.mjs，session30819 exit0、owned關閉，最後恢復量測副本的ordered設定。初次runner因Windows正反斜線比較在啟動前安全中止；改用path.resolve比對後成功，未影響正式來源。此組不作自然效能比較。

已部署來源354115b／2053.73至D:/SteamLibrary/steamapps/common/Cookie Clicker/resources/app/mods/workshop/BestDealHelper，備份tmp/production-backup-strict-projection-1795286550518，receipt tmp/strict-projection-deployment.json。部署先核正式主程序0、舊bundle仍為已知2053.58，六輪全部通過、候選hash等於實測；備份後寫入，失敗具備還原路徑。部署後獨立讀回main hash與info一致，正式遊戲core SHA仍a8813ec2ee97edf5ebff6a3ce2037dcb65c08abd13c123bb92efda89b06ef4f7，主程序0。正式存檔／設定未寫入，未啟動正式遊戲；近似預設false。交付的是已證改善，剩餘尖峰另續做，不回退推薦品質。

### 已部署版profile與初始化空分支去重（2026-11-22）

以354115b／2053.73實測同hash bundle，16mods／自購／銀行／bulk100，15秒暖機／30秒CDP profiler、1ms interval，樣本有效，保留gains與候選函式身分。session21378 exit0、owned關閉；raw／圖：tmp/deployed-projection-cpu/1795286722878/cpu.cpuprofile、flamegraph.html，report.json同目錄。updateUI採樣3619.045ms中，projection41.74%、模型建立6.77%、fork8.32%、special4.60%、原生gains24.36%、guard10.04%、notation9.47%、reorderUpgrades3.48%為inclusive，不能相加；不是自然FPS證據。

模型建立原本每個普通建築各呼一次相同空fork，共18次；改為一個baseBranch逐棟cps，保留順序與驗證。無patch的Entry共用memo，獨立review確認沒有數值／分支語義差異。fresh dev.ps1 check／build exit0：168來源／99工具、TypeScript通過，lint0 errors／1既有warning。

16mods固定輸入36對，四buff／bulk1/10/100／amount123/199/200，全item／native outputs JSON exact、前三及購買條件通過。診斷同bundle動態切18fork／1fork，兩邊都是嚴格投影；baseline標籤在此只代表舊初始化，不是原生路徑。去前4對中位68.190／66.625ms，收益小、有個別反向，不能宣稱整體改善。raw／runner：tmp/provenance-init-fork-update.json、同名.mjs；比較bundle tmp/init-fork-comparison-main.js，session41826 exit0、owned關閉。先提交減少重複配置，正式仍2053.73，尚未部署本片。下一步檢查DOM標註與分組排序的重複寫入。

### 商店排序只搬動位置不同的節點（2026-11-22）

自然隔離觀察先確認舊UI 30秒457次reorderUpgrades，216次產生搬動，共52800筆childList、單次最多276；techCalls=0，因此此負載不是跨容器比較問題，而是順序有變時舊碼將整批重新prepend。raw：tmp/order-mutation-natural/1795287603642/rows.json，session28574 exit0、wrapper還原、owned關閉。另跨tech／一般分組的交錯輸入即使各組已正確，仍能重現20次呼叫160筆變更；這是合成UI案例，不作自然主瓶頸證據。

新增private prependOrdered供升級／建築共用：保留既有節點、每組反向單趟，已在正確nextSibling不搬動；bar維持置頂，未參與排序的children保留相對順序。API可用且兩端connected／同document才使用moveBefore，否則insertBefore；未新增動畫或改CSS視覺排序。遵循modern-web-guidance dynamic-sort的「Do not recreate them」與move-dom-element-without-losing-state的「MUST use feature detection」。初版連接狀態相等仍允許兩個detached subtree，獨立review指出composed-root限制後改為只對兩端connected使用atomic，回歸及複核通過。

新增6個UI測試，含200組shuffle對照舊prepend、bar／hidden／未知child、兩API及disconnected fallback。fresh dev.ps1 check／build exit0：174來源／99工具、TypeScript通過，lint0 errors／1既有warning。現有TypeScript DOM型別未宣告moveBefore，以optional method型別擴充並作runtime偵測；不是polyfill。

固定輸入36對完整updateUI，四buff／bulk1/10/100／amount123/199/200：兩邊同為嚴格投影，只替換舊／新UI函式，先把商店重排成相同逆序。全item／native outputs及三容器innerHTML JSON exact、前三／購買條件通過。整個update的childList合13287／12247（包括標註等其他寫入），不把這個合成逆序差異當自然收益；raw／runner tmp/provenance-sort-update.json、同名.mjs，session23739 exit0、owned關閉。

實際Electron另驗交錯分組20次：舊160筆／焦點丟失，新0筆／焦點保留；atomicAvailable=false，確實走傳統fallback，清理後原始HTML一致。raw／runner tmp/group-sort-paired-probe.json、同名.mjs，exit0。獨立review本批無剩餘具體阻擋項；正式仍2053.73，本片未部署，接續同快照自然六輪。

### 初始化／DOM候選自然六輪（2026-11-22）

比較正式2053.73與aaf5162候選，兩邊嚴格投影true、近似false；同轉生快照、16mods固定順序、自購／銀行／bulk100／astar，種子20261122，各3輪，15秒暖機／60秒量測。六輪有效、cold-start defaults符合，輪末exact／前三／購買條件皆過，所有購買紀錄無銀行／付款／輸入／倍數違規、未截斷。

|指標ms（各三輪）|2053.73|候選|
|---|---|---|
|更新p95|62.590／55.125／51.655|53.630／52.715／55.950|
|更新max|125.285／87.740／80.010|84.740／77.195／81.520|
|frame p99|30.139／39.929／30.021|39.974／29.994／39.889|
|longtask max|125.415／88.035／80.190|84.850／77.405／81.630|

更新耗時小幅變動，區間重疊；frame尾端未穩定改善，不能宣稱整體加速或由這兩片解決尖峰。DOM去重與焦點改善已有獨立證據，但此自然組先不觸發部署；正式維持2053.73。raw／摘要：tmp/dom-diff-natural/1795288649093/final-assessment.json；runner tmp/dom-diff-natural.mjs，session65318 exit0、owned關閉。

下一步僅cache已完成capture的完整純數值snapshot所建立的模型，範圍限制於單次withRefresh；每候選source/data guard、捕獲、乘數與原生base refresh都保留。獨立靜態review認為完整JSON key可行，要求非法／不完整snapshot不得因undefined省略命中舊模型；此限制須先測試，尚未實作。

### 完整snapshot JSON key的refresh內模型cache：拒採（2026-11-22）

原型在既有withRefresh context以完整且嚴格序列化的純snapshot key共享模型；每候選guard／捕獲／乘數／base一致性與原生base refresh均保留，nested／outside scope隔離、invalid undefined/NaN不alias，constructor成功才set。miss從已編碼資料重建，避免toJSON雙次呼叫。原型178來源／99工具、TypeScript／lint／build通過，獨立review48 targeted通過，未見本批cache一致性阻擋。

原生／cache prototype完整更新36對（tmp/provenance-model-cache-update.json）全item／native outputs JSON exact、前三／購買條件pass，初版含tier時每次約18 builds／19 hits。tier通常每候選唯一，後改只cache base：same-bundle cache off/on另36對全exact，每次1 cache build／18–19 hits；去前4對中位69.600／77.115ms，沒有穩定收益，不能由原生／投影比較冒稱cache加速。raw／runner：tmp/provenance-base-cache-paired.json、同名.mjs；兩個session exit0、owned關閉。

拒採並撤除所有未提交產品cache、counter與橋接；保留tmp/production-model-cache-prototype.patch、productionModelCache.prototype.test.js及model-cache-comparison-main.js供追溯，不部署。恢復後fresh dev.ps1 check／build exit0：174來源／99工具，TypeScript通過、lint0 errors／1既有warning。這只拒採本JSON-key原型，並不排除所有預編譯／增量模型。下一步只消除同一guard呼叫中的重複descriptor讀取，不跨候選cache資料。

### 單次guard重複資料讀取去重（2026-11-22）

projectionRuleFailure將同一upgrade的name／bought／pool／tier讀取保留於區域變數，所有資料欄位、getter拒絕、bought可寫與型別檢查均保留。沒有跨候選cache，首次讀取順序不變；獨立review及既有16個guard回歸通過。

同bundle舊／新guard完整updateUI共36對，四buff／bulk1/10/100／amount123/199/200：全item／native outputs JSON exact、前三與購買決策一致；未執行實際購買。兩邊均為嚴格投影，baseline標籤僅指舊guard。完整更新中位77.525／76.208ms，不能宣稱整體穩定加速。raw／runner：tmp/provenance-guard-read-update.json、同名.mjs；session71924 exit0。

另在同一實際Game直接呼叫同一私有guard函式，875個upgrades，每組50次暖機／200次量測，共12對交錯次序，每次均成功返回undefined。200次guard耗時中位80.958／66.815ms，12對均降低，約減少17.5%；僅代表guard局部。raw／runner：tmp/guard-read-micro.json、同名.mjs；session56450 exit0、owned正常退出。診斷暴露僅在ignored bundle，不進產品。

fresh dev.ps1 check／build exit0：174來源／99工具、TypeScript通過，lint0 errors／1既有warning，bundle403.3kb。本片提交、未部署；正式維持2053.73。

### 同候選guard名稱傳遞原型：拒採（2026-11-22）

原型將完整guard成功後的upgrade key陣列傳給緊接的乘數capture，省去再次讀取Upgrades／name；逐項Has與所有guard仍保留。每候選fresh metadata，未跨候選cache，缺省走原捕獲；以列舉數量一致拒絕非enumerable data，nonenumerable getter仍先由原guard拒絕。獨立review無具體阻擋，新增3個回歸，fresh check／build exit0：177來源／99工具、TypeScript通過，lint0 errors／1既有warning。

same-bundle開關metadata傳遞，共36對完整updateUI，四buff／bulk1/10/100／amount123/199/200：全item／native outputs JSON exact、前三及購買決策一致，未執行購買。兩邊同為嚴格投影，並非原生／投影比較。完整更新中位67.883／68.328ms；去前4對68.483／68.328ms，無穩定收益。raw／runner：tmp/provenance-validated-names-update.json、同名.mjs；session90989 exit0、owned關閉。

因新增傳遞與資料限制未換得完整更新收益，撤除本片全部產品改動及測試，不進自然六輪、不部署。原型保存tmp/validated-names-prototype.patch；診斷bundle tmp/validated-names-comparison-main.js。正式仍2053.73，保留已提交的較小guard讀取去重。

### 保留切片最終自然六輪（2026-11-22）

正式2053.73對照d8d2ce0來源／2053.80候選，候選包含初始化空fork共用、DOM位置差異搬動及單次guard讀取去重；不含兩個已拒採cache／metadata原型。候選bundle SHA256 d210bfc30f5aec3c9daae9d5ef07fad56af89df468f80dbe669e1cdd7bed4cce。兩邊嚴格投影true、近似false；同轉生快照、2.053、16mods固定順序、自購／銀行／bulk100／astar，種子20261122，各3輪、15秒暖機／60秒量測，無並行測試／build／CPU profiler。

|指標ms（各三輪）|2053.73|候選|
|---|---|---|
|更新p95|57.510／52.230／56.025|51.620／46.495／51.410|
|更新max|80.255／88.365／90.930|85.085／81.510／76.980|
|frame p99|30.000／39.880／39.962|30.024／30.012／30.060|
|longtask max|80.405／88.570／91.260|85.300／82.295／77.165|

六輪有效、預設正確、每輪末同輸入exact／前三／購買決策皆過。含暖機的實購觀察共3440次呼叫、1900成功、44499單位；437次成功建築購買全到100倍數，零銀行／付款／輸入／倍數違規、未截斷。候選更新p95較低，max仍有重疊、自然進程分岔，不能宣稱因果倍數或消除停頓。結合已驗局部省工與焦點保留，保留此候選進行交付。

raw／摘要：tmp/guard-final-natural/1795292075821/final-assessment.json，runner tmp/guard-final-natural.mjs、摘要tmp/assess-guard-final-natural.mjs，session30412 exit0、owned正常關閉。原生core smoke再跑exit0：20建築／875升級、Pantheon閉包與creator觀察通過，main／Pantheon／launch hash與既有一致。此為部分初始化功能證據，不能代表遊戲FPS。

### 保留切片部署（2026-11-22）

fresh dev.ps1 check／build exit0：174來源／99工具、TypeScript通過，lint0 errors／1既有warning；重建hash等於六輪實測d210bfc30f5aec3c9daae9d5ef07fad56af89df468f80dbe669e1cdd7bed4cce。文件更新與排除升級建議經唯讀核對；已修正近似接入與歷史原型的矛盾。f49ef44已ff整合main，主庫原有.husky/pre-commit刪除保留。

已備份部署f49ef44來源／凍結2053.80 info至D:/SteamLibrary/steamapps/common/Cookie Clicker/resources/app/mods/workshop/BestDealHelper；receipt tmp/retained-optimizations-deployment.json，備份tmp/production-backup-retained-1795292746365。部署前核正式主程序0、舊bundle仍等於2053.73已知hash；新bundle與info獨立讀回一致。只寫main.js、info.txt、deploy-manifest.json；正式存檔／設定未寫入，正式遊戲未啟動。文件提交hook會繼續升版本號，部署仍使用量測凍結info，不能把後續文件版本號當成另一次已驗部署。

已交付進一步省工與DOM焦點保留。最長同步阻塞仍超過50ms，尚未宣稱整體任務完成；剩餘驗收目標待使用者選擇。外部任務未同步。

### 銀行批購預檢的嚴格產量上界候選（2026-11-22）

2053.80同hash原生CDP profile：15秒暖機／30秒採樣／1ms interval，16mods／bulk100／銀行／自購。updateUI採樣3268.749ms，投影39.69%、原生CalculateGains24.99%、notation9.71%；inclusive不可相加。原生候選試算483.634ms、leaveSandBox328.968ms。完整呼叫樹另顯示Game.Logic自購銀行預檢481.249ms，不在updateUI樣本內；不能只看updateUI判定自購沒有成本。raw／圖：tmp/deployed-retained-cpu/1795292845533/cpu.cpuprofile、flamegraph.html、cost-breakdown.json；session47928 exit0、owned關閉。

候選共用既有projection來源／資料／buff／基底驗證，在enterSandBox前捕獲固定ownership純模型，計算批末raw銀行上界。僅原bank／sandbox方法、own primitive銀行設定、safe integer數量且至少32件時嘗試。第一遍原生逐件價格ledger保留，全部餘額嚴格高於批末bank才跳過第二遍銀行重算；等值、未知資料／時鐘／hook、基底不符或價格效果過期仍原生。finally leaveSandBox原生刷新與正式buy保留，不自行寫mouse／lump／achievement。獨立唯讀review無具體新增缺陷；buff.multClick getter與sandbox前Win來源檢查的反例已納入邊界。

初版所有批量皆捕獲模型，96對輸出exact，但1／7件前置成本反向，故限制至少32件。修正版144對交錯同bundle：Cursor／Grandma／Farm／You、amount123／199／200、bulk10／100、三種餘額、無buff／雙buff；所有購買呼叫參數、cookies、amount/bought、native收益／mouse／milk／effs／lump／building輸出與Win／Logic還原JSON exact。真buy以只記錄參數代替，未執行實際購買。40對上界成功，預檢中位7.645／1.280ms；96對小批次0.342／0.325ms；8對大批量未通過上界0.105／1.227ms。尚未以自然頻率加權，不宣稱整體或FPS收益。初版96對JSON被診斷重跑覆寫，不作採用依據；後續資料改獨立命名保存。raw／摘要：tmp/bank-bound-min32-144-paired.json、tmp/bank-bound-min32-144-summary.json，runner tmp/bank-bound-144-paired.mjs，session9960 exit0、owned關閉。

抽共用capture後完整updateUI另36對原生／投影，四buff／bulk1/10/100／amount123/199/200，全item／native outputs JSON exact、前三／購買決策通過；不是上述預檢的效能比較。raw／runner tmp/provenance-bank-bound-update.json、同名.mjs，session39247 exit0、owned關閉。fresh dev.ps1 check／build exit0：181來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle405.4kb。此階段提交候選，正式仍2053.80；下一步自然六輪含真購買驗收，通過才部署。

### 銀行候選自然量測與getter回歸修正（2026-11-22）

821cfcc／2053.84候選對2053.80，同快照、16mods固定順序、bulk100自購／銀行／astar，各3輪、15秒暖機／60秒量測。六輪有效，輪末exact／前三／購買決策通過；3878次購買呼叫、2117成功、47597單位，467次成功建築購買全到100倍數，銀行／付款／輸入／倍數違規皆0，未截斷。候選銀行快路累計243次，含啟動與暖機。raw：tmp/bank-bound-natural/1795293903479/final-assessment.json；session60689 exit0、owned關閉。

|指標ms（各三輪）|2053.80|821cfcc候選|
|---|---|---|
|更新p95|55.625／50.445／51.285|47.815／52.370／51.825|
|更新max|85.420／78.285／76.255|76.810／80.270／77.065|
|frame p99|39.893／39.920／30.043|30.025／30.041／30.026|
|longtask max|85.710／78.535／76.500|77.030／80.480／77.325|

更新耗時區間重疊，不能宣稱整體更新加速。另15秒暖機／30秒原生CDP profile，直接銀行預檢CalculateGains路徑未採到樣本（前版481.249ms）；finally還原的原生刷新仍有11.191ms。raw：tmp/bank-bound-cpu/1795294507807/cpu.cpuprofile、native-gains-paths.json，session40870 exit0、owned關閉；採樣0不代表保證從不呼叫，亦不是FPS驗收。

部署前追加審查找到方法getter的TOCTOU反例：enterSandBox getter第一次身分比對回原fn，第二次實際進入前改Kitten ownership，會令先捕獲的銀行上界過低。821cfcc代表負載雖通過，仍不可部署。修正config與enterSandBox／leaveSandBox／getBankCookies均以own data descriptor驗證；accessor不授權快路，保留原生呼叫行為。四個新增回歸及獨立複核通過。

修正版fresh dev.ps1 check／build exit0：185來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle405.7kb。另144對預檢JSON exact、40對上界成功，中位7.370／1.280ms；raw tmp/bank-bound-own-data-144-paired.json，runner tmp/bank-bound-own-data-paired.mjs，session89079 exit0、owned關閉。正式仍2053.80；修正版須以新hash重跑自然六輪，不能沿用821cfcc作部署驗收。

### own data銀行候選最終裁決：拒採（2026-11-22）

b732fbd／2053.85修正版對2053.80，同快照、16mods固定順序、銀行／bulk100自購／astar，各3輪，15秒暖機／60秒量測，未並行測試／build／profiler。六輪有效，輪末exact／前三／購買決策皆過；3174次購買呼叫、1767成功、42492單位，419次成功建築購買皆到100倍數，銀行／付款／輸入／倍數違規皆0、未截斷。候選上界計數209次，含啟動／暖機。raw：tmp/bank-bound-own-data-natural/1795295000337/final-assessment.json；session97999 exit0、owned正常退出。

|指標ms（各三輪）|2053.80|b732fbd候選|
|---|---|---|
|更新p95|51.655／61.635／52.135|50.150／53.645／51.395|
|更新max|76.750／77.185／82.310|121.685／105.905／79.815|
|frame p99|39.924／30.064／29.988|29.971／29.990／39.930|
|longtask max|77.175／77.810／82.430|278.380／106.215／79.995|

第一輪278.380ms事件發生於樣本起點後25809.385ms，當時不是updateUI；稍後26116.780ms的updateUI才是121.685ms。沒有足夠證據歸因於銀行候選，不能剔除或宣稱已解決。候選max及frame尾端未穩定改善，局部預檢約6倍不能當整體效能驗收。

追加原生CDP timeline trace（15秒暖機／60秒記錄，含診斷負擔）未重現278ms或超過100ms事件。最大renderer task83.776ms，模組更新timer的FunctionCall83.653ms；同task MinorGC合0.804ms、Layout0.527ms、UpdateLayoutTree0.043ms，主成本仍是更新JS。trace不是自然效能對照，也不能解釋未重現的異常。raw／摘要：tmp/bank-own-data-trace/1795295723857/trace.json、summary.json、largest-task-breakdown.json；runner tmp/bank-own-data-trace.mjs，session98692 exit0、owned關閉。

拒採本次eager銀行上界實作，撤除全部未交付產品改動、計數與新增測試；原型保留於821cfcc／b732fbd提交及tmp/bank-bound-rejected-prototype.patch。延後capture可能減少無法整批負擔時的前置成本，但仍欠完整late契約與實測，不當成已驗替代方案。恢復後fresh check／build exit0：174來源／99工具、TypeScript通過、lint0 errors／1既有warning；bundle403.3kb，SHA256精確等於正式2053.80的d210bfc30f5aec3c9daae9d5ef07fad56af89df468f80dbe669e1cdd7bed4cce。正式模組／存檔／設定均未寫入。

### 空分支重用已驗特殊建築基底（2026-11-22）

createProductionProjection建構時原本執行special(s.amounts)驗證、隨即丟棄結果；fork([])又做一次。兩行修改保存私有baseSpecial數值，僅空patch重用；有patch仍重算，checkpoints每次套用，constructor驗證及錯誤時機不變。獨立唯讀review未見別名／可變基底／checkpoint反例；既有1200組原生overlay與100組base對照仍通過。fresh check／build exit0：174來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle403.4kb。

同bundle動態切換重用與重算，完整更新36對皆全item／native outputs JSON exact、前三及購買決策一致；未實購。中位61.698／68.975ms，沒有完整更新收益。為排除每次fork讀全域開關的診斷干擾，另用獨立原始／優化factory、只於建構時選擇，再36對全exact；中位70.280／68.923ms，但去前12對67.012／68.320ms，仍不穩定。raw／runner：tmp/provenance-base-special-update.json、tmp/provenance-base-special-factories-update.json（各同名.mjs），sessions56527／67293 exit0、owned關閉。

同一Game捕獲的numeric snapshot／checkpoints，200次constructor＋空fork、每組50次暖機，共12對交錯；輸出皆JSON exact，11對降低，中位16.195／15.400ms，局部約減少4.9%。raw／runner tmp/base-special-micro.json、同名.mjs，session4131 exit0、owned關閉。只保留此最小省工來源切片，不以局部收益宣稱整體或FPS改善，不觸發部署；正式2053.80不變。

### 私有capture結構比較的更新內模型共用：拒採（2026-11-22）

另作ignored診斷原型：projectionTrial模組持有封閉refresh context，UI以try/finally管理nested／outside生命期。唯一acquire來源是guard後新建、私有且不含Game refs的numeric/boolean capture；逐值Object.is／prototype／keys比較，含toJSON鏈者不cache。constructor成功後才存，tier overlay仍獨立建模。所有逐候選guard、capture、multipliers、base exact及原生刷新保留，沒有跨tick共用或JSON key序列化。獨立唯讀審查未找到支援資料可產生的別名／驗證繞過反例；這不擴張到任意外部caller或被改寫的原生intrinsics。

same-bundle cache off/on完整updateUI共36對，四buff／bulk1/10/100／amount123/199/200，全item／native outputs JSON exact、前三與購買決策一致。每次只建模1次、18–19 hits，但中位64.738／66.228ms；去前4對66.405／68.118ms、去前12對71.282／71.755ms，無完整更新收益。不能以build數下降代替實際耗時或FPS驗收。

拒採，不匯入產品、不進自然六輪、不部署；產品只有3559845的兩行special基底省工。原型／bundle：tmp/build-structural-model-cache.mjs、tmp/structural-model-cache-main.js；raw／runner：tmp/provenance-structural-model-cache-update.json、同名.mjs，session89912 exit0、owned關閉。正式2053.80與存檔／設定未寫入。

### 原生還原重算的可觀察邊界（2026-11-22）

實際2.053核心（SHA256 a8813ec2ee97edf5ebff6a3ce2037dcb65c08abd13c123bb92efda89b06ef4f7）無UI初始化後驗證：CalculateGains每次替換effs，但就地寫入cookiesPsByType／cookiesMultByType；每次仍呼叫mouseCps及computeLumpTimes。原生來源4934–5184另包含成就判定、最高收益、wrinkler及時間分支，不能以恢復CPS數值視為等價。

反例：暫購「\"egg\"」再取消並原生重算，unbuffedCps已回基底，但cookiesPsByType['"egg"']仍是9。分類map不是每次新建；清空／替換map或恢復完整舊快照也會改變原生既有行為。raw及可重跑runner：tmp/native-refresh-boundary.json、同名.mjs；exit0。這只排除簡單數值／完整舊快照替代，不證明所有專用還原都不可行。

scripts/perf/core-smoke.mjs加入物件身分及mouse／lump呼叫檢查，使用實際main.js＋minigamePantheon.js重跑exit0；20建築、875升級及Pantheon閉包／creator檢查通過。測試只載入無UI核心，不讀存檔、不載共存模組，不提供完整副作用或效能等價保證。保留原生leaveSandBox刷新；後續先盤點原生升級候選種類及耗時，再評估受限升級投影，不能直接刪還原刷新。

### 升級候選成本及標籤重複算色（2026-11-22）

部署2053.80同hash bundle，16mods／bulk100／銀行／自購，15秒暖機、30秒候選觀察。CalculateGains身分保持不變，候選包裝保留原生結果與例外，觀察結束還原。建築3740次呼叫累計1524.685ms、單次max13.855ms；依pool/tier標記分組的cookie升級10217次累計491.595ms、max2.325ms，其餘tier標記升級9929次累計353.150ms、max1.865ms。包含cache hit及觀察負擔，不是每次原生重算耗時，也不能從分組名推論只有普通tier效果；沒有分離trial／restore成本。raw／runner：tmp/upgrade-candidate-cost/1795302577920/report.json、tmp/upgrade-candidate-cost.mjs，session60492 exit0、owned關閉。先不為這些低單次耗時升級擴張完整投影驗證。

標籤updateNotation已有nextColorValue供cache比對，寫入時colorSpanByValue卻再呼叫chroma。helper新增可選已算顏色，兩處寫入傳入該值；既有兩參數呼叫、首次算色錯誤後重試及被覆寫helper的呼叫仍保留。來源新增建築／升級兩個檢查。fresh dev.ps1 check／build exit0：176來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle403.5kb。

同bundle開關、36對完整updateUI，四buff／bulk1/10/100／amount123/199/200，全item、原生outputs、實際標籤HTML／color exact，前三／購買決策一致，未實購。old/new中位63.367／63.797ms，只有16對較快，不能宣稱整體改善。raw／runner：tmp/provenance-notation-color-update.json、同名.mjs，session26022 exit0。

另測81個標籤，每組50輪強制cache miss、12對交錯，兩組DOM exact；chroma呼叫8100降至4050，12對皆較快，中位22.760／19.928ms，局部約減少12.4%。這是固定相同score的密集標籤微量測，不代表自然cache命中率或FPS。raw／runner：tmp/notation-color-micro.json、同名.mjs，session43162 exit0。只保留省掉重複算色的小切片；未作自然六輪、不部署，不宣稱剩餘同步尖峰已解決。正式2053.80、存檔與設定未寫入。

### 倍率擷取限於釘選原生公式的升級依賴（2026-11-22）

captureProductionMultiplierSnapshot原先走訪全部875升級及查詢ownership，改由已釘選CalculateGains的literal Game.Has名稱產生私有需求清單，只擷取這些升級。動態cookie powers與goldenCookieUpgrades仍獨立捕獲；完整version／source／hook／全部升級資料guard保持不變，沒有跨候選或跨tick快取。已知名稱的accessor仍在執行前拒絕，缺少升級視為未持有，名稱不符拋錯回原生；未使用模組加入的升級不進倍率owned陣列，但仍接受完整guard。

新增逐項原生literal依賴、全持有及零倍率排除組合對照，保留既有800組native checkpoints及1200組production overlay檢查。首次typecheck發現ES2020未支援String.replaceAll型別，已改全域RegExp replace；修正版fresh check／build exit0：177來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle403.9kb。

初版及最終來源各36對同bundle完整updateUI（四buff／bulk1/10/100／amount123/199/200），全item／native outputs exact、前三及購買決策一致，未實購。初版25/36對較快，配對new−old差值中位−2.785ms；最終版26/36對較快，差值中位−3.275ms，去前4／12對仍−3.330／−3.320ms。兩組各自耗時中位數初版65.978／67.462ms、最終64.993／65.475ms，不能據配對差值宣稱自然更新或FPS加速。raw／runner：tmp/provenance-multiplier-owned-update.json、tmp/provenance-multiplier-owned-final-update.json（各同名.mjs），sessions4117／29985 exit0、owned關閉。最終診斷builder首次CRLF marker失配，未啟動遊戲；正規化後成功。候選先提交，正式2053.80不變；下一步六輪自然負載與實購驗收。

### 倍率依賴候選自然六輪：品質通過，暫不部署（2026-11-22）

27004e7／2053.91對正式2053.80，候選亦包含空fork及標籤省工。同快照、2.053、16mods固定順序、銀行／bulk100自購／astar，種子20261122，各3輪、15秒暖機／60秒量測；沒有並行build、測試或profiler。候選SHA256 82a6fc8b4c64653946b538979d8d153aa71d0ae190dd46a06bae2b794308636f。六輪有效，輪末exact／前三／購買決策皆通過；3600次購買呼叫、1988成功、48322單位，475次成功建築購買皆到100倍數，銀行／付款／輸入／倍數違規皆0，未截斷。

|指標ms（各三輪）|2053.80|27004e7候選|
|---|---|---|
|更新p95|48.045／47.525／49.455|52.710／40.805／42.680|
|更新max|75.085／77.145／73.995|133.060／73.160／68.565|
|frame p99|40.478／41.904／46.508|40.130／41.059／40.056|
|longtask max|75.380／77.245／74.115|133.370／73.445／68.770|

候選後兩輪p95與max較低，首輪133.060ms確實位於updateUI；不能當成update之外的事件排除，也沒有trace足以定位成因。自然進程分岔、首輪frame節奏不同，不能宣稱因果倍率或尾端已穩定改善。保留已驗來源切片與全部樣本，暫不部署；下一步定位候選更新尖峰，不能僅憑平均或後兩輪選擇性採用。

raw／彙整：tmp/multiplier-owned-natural/1795304394070/final-assessment.json，runner tmp/multiplier-owned-natural.mjs，彙整入口 tmp/assess-multiplier-owned-natural.mjs；session58752 exit0、owned正常退出。fresh CIM無遊戲主程序，正式main.js讀回hash仍為d210bfc30f5aec3c9daae9d5ef07fad56af89df468f80dbe669e1cdd7bed4cce；正式存檔／設定未寫入。外部任務未同步。

### 對齊尖峰task的trace／CPU採樣，接管私有capture（2026-11-22）

使用同27004e7 bundle及凍結info，16mods／bulk100／銀行／自購，15秒暖機、60秒原生CDP timeline＋1ms CPU採樣；保留Game.CalculateGains身分。未重現133ms，最大renderer RunTask為77.004ms，模組timer FunctionCall為76.936ms。同task MinorGC合1.138ms、MajorGC 0、Layout 0.276ms、UpdateLayoutTree 0.025ms，不能把主要阻塞歸因於layout或GC，也不能宣稱原133ms已解決。

以單調時鐘對齊該task的76.489ms CPU樣本：候選計算inclusive67.358ms、投影34.699ms、原生gains28.600ms、guard9.193ms、capture8.172ms、fork8.168ms；含重疊，不能相加。createProductionProjection self4.076ms。raw／摘要：tmp/multiplier-owned-trace/1795305037086/trace.json、cpu.cpuprofile、largest-task-costs.json，runners tmp/multiplier-owned-trace.mjs、tmp/analyze-multiplier-trace.mjs，session30113 exit0、owned關閉。含trace／profiler負擔，不作自然效能驗收。

候選改為只在projectionTrial移交新建、私有、純數值／boolean capture時略過JSON往返；輸入沒有Game物件引用，呼叫端不再使用或暴露它，fork也不修改該基底。一般呼叫維持預設複製及驗證；Object.prototype或Array.prototype含toJSON時仍走原本JSON路徑。沒有跨候選共用、跨tick模型或略過來源guard；對全域原生intrinsics遭改寫的任意環境不擴張支援保證。

既有1200組native overlay另對照移交模式，兩個新增檢查驗證Object／Array序列化hook回退及複製隔離。fresh dev.ps1 check／build exit0：179來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle404.0kb。初版及最終版各36對完整updateUI，全item／native outputs exact、前三／購買決策一致，未實購；初版24/36對較快，配對差值中位−1.290ms；最終27/36對較快，中位−2.838ms，去前4／12對仍−3.008／−3.177ms。最終old/new各自中位67.012／65.105ms。raw／runner：tmp/provenance-owned-capture-update.json、tmp/provenance-owned-capture-final-update.json（各同名.mjs），sessions17051／69731 exit0、owned關閉。只提交候選；新bundle仍欠自然六輪及實購驗收，不沿用27004e7結果作部署依據。正式2053.80不變。

### 私有capture候選六輪驗收及部署（2026-11-22）

f56360a／2053.93對正式2053.80，同快照、2.053、16mods固定順序、銀行／bulk100自購／astar，種子20261122，各3輪、15秒暖機／60秒量測，沒有並行build、測試或profiler。候選SHA256 4b34d3cf77233aa7b554d39310d7cbce4dde5a77ab7baa7a93746255629bf714。六輪有效，輪末exact／前三／購買決策皆通過；3443次購買呼叫、1894成功、44795單位，439次成功建築購買全到100倍數，銀行／付款／輸入／倍數違規皆0，未截斷。

|指標ms（各三輪）|2053.80|2053.93|
|---|---|---|
|更新p95|49.115／48.415／51.555|45.815／43.890／51.430|
|更新max|75.655／79.075／68.905|71.660／72.240／68.375|
|frame p99|51.794／40.301／40.330|49.974／40.307／43.381|
|longtask max|75.760／79.200／69.250|71.895／72.595／68.810|

採用省工切片：兩輪更新p95較低、一輪接近，三組更新max與longtask max較低，整體尾端範圍未擴大；frame p99沒有一致改善，不宣稱FPS提高。自然進程分岔，不能換算因果倍率；此前133ms未在本輪重現，不代表保證不再發生。更新仍有68–72ms尖峰，未達每次≤50ms。

raw／彙整：tmp/owned-capture-natural/1795305542849/final-assessment.json；runner tmp/owned-capture-natural.mjs，彙整入口 tmp/assess-multiplier-owned-natural.mjs，session50461 exit0、owned正常退出。保留既有嚴格預設及未知規則回退，近似仍false。

正式遊戲停止時，核對目標D:/SteamLibrary/steamapps/common/Cookie Clicker/resources/app/mods/workshop/BestDealHelper實際路徑及舊hash，備份main.js／info.txt後部署f56360a來源bundle與凍結2053.93 metadata，讀回兩檔hash一致。receipt tmp/owned-capture-deployment.json；backup tmp/production-backup-owned-capture-1795306130183；部署入口 tmp/deploy-owned-capture.mjs，exit0。正式程序未啟動，正式存檔／設定未寫入。後續文件commit會再bump儲存庫info，不能把它冒稱已部署版本；部署身分以receipt及凍結info為準。外部任務未同步。

### 升級guard成本診斷及無UI讀取集合（2026-11-22）

僅在ignored隔離原型以開關省略整段Upgrades驗證，估計該迴圈的成本；不是可採用的安全路徑，也不是數學效能上界。其餘來源guard及投影保留，autoBuy=false，沒有實購。36對完整updateUI於本組已知狀態全item／native outputs exact、前三／購買決策一致，32對較快，配對差值中位−6.070ms；去前4／12對−6.407／−6.600ms，old/new各自中位71.283／65.240ms。raw／摘要：tmp/provenance-skip-upgrade-guard-update.json、tmp/skip-upgrade-guard-summary.json；runner tmp/provenance-skip-upgrade-guard-update.mjs，session4552 exit0、owned關閉。沒有修改產品guard，不能以目前狀態一致推論未知getter安全。

實際2.053無UI核心逐一持有875升級，再測全持有（排除Occult obstruction）及ascensionMode1，共878情境、693673次Has，觀察到767種key。原生GetTieredCpsMult、Grandma、cookie／golden集合都有動態名稱，literal清單不是完整資料依賴。raw／runner：tmp/native-has-dependencies.json、同名.mjs，main SHA256 a8813ec2ee97edf5ebff6a3ce2037dcb65c08abd13c123bb92efda89b06ef4f7，exit0。沒有存檔、共存模組、Pantheon或buyFunction；缺少觀測不證明無依賴。

既有core-smoke的可選survey新增gainUpgradeReads，於原生收益計算（含mouse／lump）記錄Has key，每次finally還原，結束另核對函式身分；不把價格或buyFunction稱為已觀測。可重跑指令見scripts/perf/README.md。使用實際main.js＋minigamePantheon.js及tmp/upgrade-read-survey.json重跑exit0：875升級、673種觀測效果、745種gain讀取key，Pantheon／refresh邊界檢查通過。此情境與上述878情境不同，兩個集合大小不能互當完整性證明。正式2053.93與存檔／設定未寫入。

### 升級prototype缺口修正，保留全表guard（2026-11-22）

獨立唯讀審查不建議縮表：literal聯集127名之外，尚有cookie／golden清單、全部tier／unshackle、synergy／fortune／grandma與kitten pool等動態路徑；Has(undefined)仍查詢Upgrades['undefined']。未持有及目前未觸發分支不等於可以刪除。878情境觀察的767種key也不是完整性證明；蒐集並驗證完整動態集合的收益尚未成立。不採literal-only或省略全表guard原型，不進自然六輪、不部署該原型。

審查以實際main.js無UI核心證實完整正向反例：移除own Stevia Caelestis，在Object.prototype加入同名不可列舉getter，舊guard仍通過、projectBuildingTrial仍接管且getter未讀，稍後保留的原生CalculateGains才讀一次。原本for-in及own names檢查因此不能保證該繼承查詢沒有副作用。

最小修正：Upgrades直接繼承Object.prototype時，拒絕非標準own key，以及標準函式key改成accessor／非function的原型配置；標準__proto__ accessor另作區分，保留完整升級迴圈。這只是一道保守回退，不宣稱任意intrinsics、Function.prototype、Proxy或被替換的__proto__ accessor都受保護。

新增不可列舉升級getter與constructor accessor兩個回歸檢查，皆在呼叫前拒絕。fresh dev.ps1 check／build exit0：181來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle404.7kb。16mods的36對原生／投影完整updateUI，全item／native outputs exact、前三／購買決策一致；四buff、bulk1/10/100及amount123/199/200皆有覆蓋，未實購。raw／runner：tmp/provenance-prototype-fence-update.json、同名.mjs，session75229 exit0、owned關閉。此為回退安全修正，沒有對新bundle做自然六輪，不沿用2053.93數字宣稱新效能。

同一唯讀代理複核實際修正版VM：正常projected=true；getter注入後gate／fallback=upgradePrototype、projected=false、reads=0；constructor accessor亦拒絕；恢復後再次接管。原生Node stdin、esbuild write:false、實際main.js VM，exit0；無Electron、存檔或來源寫入。native host回報保存tmp/prototype-fence-review.json、派工身分tmp/guard-dependency-dispatch.json。主線獨立執行上述回歸、完整檢查及36對品質驗證；審查回報不代替這些檢查。

16b225a／2053.96安全修正已備份部署，目標仍是既有BestDealHelper目錄；先核對2053.93舊hash、正式程序停止、36對品質及獨立複核，再複製已建置bundle與凍結info並讀回兩檔hash。正式SHA256 de31f51ef7398472d4055216eb1b1c8a7ee3286e16bfe944ed3c53ead4d76fef；receipt tmp/prototype-fence-deployment.json，backup tmp/production-backup-prototype-fence-1795310842312，部署入口 tmp/deploy-prototype-fence.mjs，exit0。此修正只新增未知原型配置的回退，沒有把省略驗證原型納入產品；未重跑自然六輪，不宣稱2053.96的新耗時或FPS。最後自然效能證據仍屬2053.93。正式程序未啟動，存檔／設定未寫入。

### 省略投影逐棟輸出配置：拒採（2026-11-22）

檢查確認buildingCpsModel已重用無相依節點的result，沒有重寫現有增量機制。另一個ignored原型僅在createProductionProjection建構時讀一次診斷開關，fork加總時不配置逐棟buildings輸出；Cursor／Grandma、一般建築、浮點運算及加總順序全部保留，沒有略過驗證或原生刷新。正式adapter只讀總收益，但避免配置不代表必然降低完整更新耗時。

同bundle36對完整updateUI，四buff、bulk1/10/100、amount123/199/200，全item／native outputs exact、前三／購買決策一致，未實購。僅16/36對較快，配對差值中位new−old為+2.218ms；去前4／12對仍+2.218ms。old/new各自耗時中位69.168／68.010ms，不能挑選這組中位數作加速結論；配對結果沒有穩定收益。中途一次彙整讀到尚在執行的34對，未作結論；主runner exit0後重讀完整36對，保存最終摘要。

拒採，不加入產品選項、不改來源、不進自然六輪、不部署。原型／bundle：tmp/build-projection-rows.mjs、tmp/projection-rows-main.js；raw／runner：tmp/provenance-projection-rows-update.json、同名.mjs；最終摘要tmp/projection-rows-summary.json，session18589 exit0、owned關閉。正式2053.96與存檔／設定未寫入。此結果只拒採本條件式配置原型，不證明所有數值模型配置優化都無效。

### 銀行上界晚期捕獲原型與反例修正（2026-11-22）

本原型與已拒採eager實作不同：保留第一遍原生逐件價格ledger，整批價格可負擔且批量至少32，才在還原amount／bought／cookies後嘗試模型。enter前及捕獲前核對enter／leave／getBank為own data原生方法，config及效能旗標也只接受own data；所有旗標在捕獲前讀取。暫時將本次native sandbox的Win stub還原為sandbox.Win，執行現行完整source／data／buff／time gate，再以finally核對own writable descriptor及身分後還原stub。逐件pure價格須exact符合第一ledger；只有每個餘額嚴格大於固定ownership批末rawCps×bankSeconds的上界，才省略第二銀行loop；原生finally刷新及實際buy呼叫保留。診斷counter不作產品契約。

初版144對一般情境全部exact，但獨立唯讀VM審查找到兩個完整反例，故初版不可採：Array.prototype非enumerable toJSON在模型的JSON回退路徑執行49次，把bankingSeconds從1200改為1e80，helper仍回舊上界48000；另一例由buyBulk及amount的一次getter讓originalCookies與enter後ledger起始現金不同，兩getter隨即還原為data，late guard看不見歷史。old拒買，初版new卻proofs=1並呼叫buy(100)。這證明一般樣本exact及僅逐價一致都不足。

v2先拒絕Object／Array prototype任何toJSON，不呼叫其getter；以originalCookies逐件扣nativePrices並Object.is核對每一nativeBalance；最後ledger餘額不高於own-data基底銀行額時，不支付模型成本，仍保留原生第二loop。v3在已排除ages／Century後使用無時間checkpoint=0，避免新增Date.now callback。審查另要求v4在重算ledger前先確認originalCookies是primitive finite number，避免新增valueOf呼叫。所有版本僅存ignored tmp，src未改。

初版、v2、v3各144對預檢皆輸出exact，涵蓋Cursor／Grandma／Farm／You、amount123／199／200、bulk10／100、三種現金及無buff／雙buff；真buy以記錄參數替代，未實購。v3有40對上界成功，中位old/new 7.412／1.050ms；96對小批次0.232／0.277ms；8對未進捕獲0.097／0.130ms。這僅為預檢局部量測，沒有自然頻率加權，也不是FPS或整體倍率。raw：tmp/late-bank-144-paired.json、tmp/late-bank-v2-144-paired.json、tmp/late-bank-v3-144-paired.json；摘要tmp/late-bank-comparison-summary.json；各版本同名builder／paired runner，sessions11474／68024／8964 exit0、owned關閉。

v4另在16mods隔離副本作4類old/new完整auto邊界檢查：正常路徑proofs=1且buy(100)呼叫一致；Array toJSON getter不讀取並回原生預檢；現金位移與object cash皆拒買，未嘗試模型；object cash的valueOf次數與原生一致。Win／Logic皆還原，raw／cps及購買決策exact，沒有真買。raw／可重跑runner：tmp/late-bank-v4-boundary.json、同名.mjs，session55277 exit0、owned關閉。

同一獨立代理以原生Node stdin、esbuild write:false及實際main.js VM複驗v4正常proof、cash-ledger、toJSON data／getter及object cash，exit0；未寫來源、未啟動Electron或操作存檔，完整腳本已回傳。native host報告tmp/late-bank-v4-review.json。主線另執行上述16mods邊界檢查，不以審查回報代替自己的驗證。此範圍不保證任意intrinsics／Proxy環境，也不取代完整副作用及單調性證明。下一步才是最小產品接入、回歸及完整更新品質核對；未做新版自然六輪，不部署原型。正式仍2053.96。

### 晚期銀行上界產品接入：來源驗證通過，待自然驗收（2026-11-22）

產品沿用v4契約，移除診斷globals。僅批量至少32且enter前方法為own data原生身分時保存逐件價格；成功ledger後再確認方法身分、primitive finite原始現金、每步扣款exact、config／效能旗標及Win descriptor。基底銀行額已不能保留時不建立模型。完整source gate、時間排除、逐項價格exact及嚴格高於批末銀行上界全部成立才跳過第二loop；原生finally刷新、fallback、buy參數及後續 bookkeeping保留。

抽出private資料capture，normal adapter保留source gate、tier早退、capture、price、base agreement順序；排除ages／Century後checkpoints用0，避免新時計callback。新增13個來源回歸涵蓋成功proof、字串seconds、方法accessor、cash-ledger位移、object現金、銀行相等、整批不足、helper錯誤還原、逐價等總額錯配及serialization data／getter。fresh dev.ps1 check／build exit0：194來源／99工具、TypeScript通過、lint0 errors／1既有warning，bundle409.1kb。

用實際產品來源（只有受控scalar觀測點）重跑144對預檢，全原生outputs、cookies／amount／bought、Win／Logic還原及購買呼叫exact。原生oracle的captures皆0；40對上界成功old/new中位7.635／1.147ms、96對小批0.260／0.283ms、8對未進捕獲0.102／0.135ms。仍是局部預檢，未實購、未依自然頻率加權。raw／摘要：tmp/late-bank-product-144-paired.json、tmp/late-bank-product-summary.json；runner tmp/late-bank-product-paired.mjs，session61687 exit0、owned關閉。

實測hash bundle另36對完整updateUI，四buff／bulk1/10/100／amount123/199/200，全item／native outputs exact、前三／購買決策一致；不拿原生／投影既有差距當新增銀行改善。raw／runner tmp/provenance-late-bank-product-update.json、同名.mjs，session90606 exit0、owned關閉。

產品版四類16mods邊界測試亦全exact，正常new proof、old不capture；Array序列化getter不讀取並fallback，cash位移與object現金均拒買且不新增coercion，Win／Logic皆還原。第一次runner只替換到未執行區塊，兩側均proof，該次不作對照證據；另一次準備命令Node路徑重複bin/node而未執行。修正後新增old captures=0斷言並完整重跑；raw／runner tmp/late-bank-product-boundary-fixed.json、同名.mjs，session94180 exit0。無實購。

獨立唯讀代理複核產品實際source，原生Node記憶體VM（無prototype helper／gate注入）8情境通過exit0；正常與projection關閉皆原生buy參數正確，三類反例回退，Win／Logic／現金／數量還原。來源bytes fingerprint SHA256(lifecycle.ts || projectionTrial.ts)為099642bd7189c1848861a3149c2ff72e1ce30b89f1f94d827fa7fafb324d4012，主線已讀回核對。native回報tmp/late-bank-product-review.json；不代替主線上述驗證，也不擴張任意intrinsics／Proxy或自然效能保證。此階段僅提交候選，正式2053.96不變；下一步新hash自然六輪及實購驗收後才裁決部署。

### 版本數值進位修復（2026-11-22）

345c1e6的正常hook將2053.99寫成2053.100；JSON將它讀為2053.1，形成版本倒退。錯誤metadata未部署。修正bump腳本以百分位整數遞增、正常進位，驗證finite、非負、安全整數及新值確實增加；破損或無效輸入不覆寫。新增原生Node CLI回歸，涵蓋小數進位、整數、零與無效輸入；工具測試入口改為遞迴發現scripts/*.test.mjs。暫存測試清理前驗證目標為系統暫存目錄下的本次cpp-version-*目錄。

fresh .\scripts\dev.ps1 check exit0：TypeScript通過、lint 0 errors／1既有warning、194來源／101工具測試通過。此次不改產品來源，不需重建bundle。info先恢復上一合法值2053.99，再由正常commit hook進位為2054.00；GameVersion仍2.053。正式2053.96不變。

### 布林銀行秒數支援與回退六輪（2026-11-22）

先以345c1e6產品bundle、dc790eb／2054.00正確info對照正式2053.96，16mods／A*／銀行／自購／bulk100，同快照15秒暖機、60秒量測、各3輪打亂。發現config預設bankingSeconds=true，原生Number(true)=1；原產品late guard僅接受number／string，故本批只能驗證布林設定的回退，不能作銀行捷徑收益證據。

六輪品質exact、前三及購買決策皆通過，3223次購買呼叫、1795次成功；銀行、付款、輸入及倍數違規皆0，未截斷。候選update p95為49.890／61.555／48.850ms、max75.915／168.370／79.475ms；正式p95為46.745／106.105／49.330ms、max83.965／228.625／87.665ms。較大的尖峰兩版都有，不刪除樣本，不換算因果倍率。raw／final-assessment：tmp/late-bank-natural/1795315196403；runner tmp/late-bank-natural.mjs，session62264 exit0、owned關閉。另在兩版同樣包裝原autoBuyLogicHook，沒有替換原生gains或候選方法；hook耗時存於raw.timings.autoBuyLogic。

最小修正只讓布林primitive通過秒數型別guard，沿用Number轉換、完整模型與銀行證明；不接受object，不新增coercion callback。新增true／false兩項來源回歸；fresh dev.ps1 check／build exit0：196來源／101工具、TypeScript通過、lint0 errors／1既有warning、bundle409.1kb。144對實際產品診斷預檢覆蓋true／false、四建築、bulk10／100、三持有量／現金及buff；全部outputs／購買參數exact，old captures皆0。28對proof成功，old/new局部中位7.905／1.218ms；未實購，不代表自然效能。raw／summary：tmp/late-bank-boolean-144-paired.json、tmp/late-bank-boolean-summary.json；runner tmp/late-bank-boolean-paired.mjs，session15930 exit0、owned關閉。新產品bundle SHA256 d55fe1e67b12afa8be7e9c574b5787a3d03c438e7c72a44c4a8eaaae52520d32。下一步凍結新metadata再重跑六輪實購；未部署。

### 布林相容銀行候選六輪、實購及部署（2026-11-22）

來源2f8550a／凍結metadata2054.01，bundle SHA256 d55fe1e67b12afa8be7e9c574b5787a3d03c438e7c72a44c4a8eaaae52520d32；對照正式2053.96，兩版同快照、16mods固定順序、A*、銀行原設定true、自購及bulk100，15秒暖機／60秒量測／各3輪打亂。未並行建置、測試或CPU profiler；觀察保留CalculateGains及候選函式身分，兩版同樣包裝原autoBuyLogicHook。

| ms，每列各三輪 | 正式2053.96 | 候選2054.01 |
|---|---|---|
| update p95 | 48.245／50.650／47.130 | 50.915／45.025／50.875 |
| update max | 71.725／76.445／88.165 | 74.825／75.560／73.785 |
| auto-buy hook p99 | 11.680／11.070／11.465 | 4.635／3.375／3.395 |
| auto-buy hook max | 16.380／18.710／29.930 | 12.910／9.775／17.790 |
| frame p99 | 29.991／29.990／30.055 | 30.007／29.929／29.992 |
| longtask max | 71.915／76.575／88.375 | 74.990／75.705／73.965 |

六輪樣本有效、未截斷，端點同輸入原生／投影outputs exact、前三及購買決策一致。3243次實購呼叫、1806次成功、44280單位；436次成功建築購買皆到100倍數，銀行／付款／輸入／倍數違規皆0。觀察涵蓋暖機及量測，端點品質不是所有實購的逐次oracle。自然進程可能分岔，不換算因果倍率；自購hook三輪p99／max均降低，更新p95與frame尾端沒有一致改善，不宣稱整體FPS提高、消除卡頓或每次≤50ms。

raw／final-assessment：tmp/late-bank-boolean-natural/1795315882438；runner tmp/late-bank-boolean-natural.mjs，session28912 exit0、owned關閉。彙整命令node tmp/assess-multiplier-owned-natural.mjs tmp/late-bank-boolean-natural/1795315882438 exit0。保留上批回退的168／229ms尖峰證據，不因本批未重現而宣稱不再發生。

採用嚴格銀行省工；已備份部署實測2f8550a／2054.01到既有BestDealHelper目錄，讀回bundle及metadata SHA256一致。receipt tmp/late-bank-deployment.json；backup tmp/production-backup-late-bank-1795316479529；可重跑入口tmp/deploy-late-bank.mjs，exit0。部署前後正式主程序0、遊戲core與正式save.cki hash不變；正式程序未啟動，未操作正式存檔／設定。此部署不包含近似計算。後續文件commit的正常hook可遞增庫內metadata；正式仍保留本次凍結實測2054.01，不因此重部署。

### 已部署銀行版重採樣與空branch原型拒採（2026-11-22）

2f8550a／2054.01實測部署hash，16mods／A*／銀行／自購／bulk100，15秒暖機、30秒原生CDP CPU採樣、1ms interval，樣本有效。updateUI inclusive3569.878ms中，候選計算72.68%、projectBuildingTrial34.91%、原生CalculateGains28.60%、captureProjectionBase10.06%、projectionRuleFailure9.98%、fork7.33%、special4.38%、updateNotation9.78%；數字重疊，不可相加。Game.RebuildUpgrades與標籤還原另有成本，不在每個updateUI樹中，不能混作更新內百分比。raw／flamegraph：tmp/deployed-late-bank-cpu/1795316590914，update-functions.json保留更新樹分組；runner tmp/deployed-late-bank-cpu.mjs，session15628 exit0、owned關閉。含profiler負擔，不作自然效能驗收。

只在空patch時重用已暖基底branch的ignored原型，沒有刪除guard、模型驗證或輸出。36對同bundle完整更新，四buff／bulk1/10/100／amount123/199/200，item及native outputs exact、前三及購買決策皆一致；18/36較快，new−old配對中位−0.0525ms，去前4對亦相同。收益不穩定，不採用、不部署。raw／summary：tmp/empty-branch-update.json、tmp/empty-branch-summary.json；builder／runner tmp/build-empty-branch.mjs、tmp/empty-branch-update.mjs，session32420 exit0、owned關閉。

同步共用多候選capture也不能直接成立：每個成功投影後仍保留原生CalculateGains，會更新achievement／milk／mouse／lump等輸出；不能僅憑同一JS task認定後續基底不變。此輪未省略這些刷新。下一步僅評估單一模型內靜態特殊建築規則的預計算，不跨候選、跨tick共用。

### 特殊建築靜態倍率預計算候選（2026-11-22）

只在每個私有production模型建立時計算Cursor手指／基礎升級、Grandma固定升級／kitten乘法prefix；每次fork仍驗證amounts、tierMultiplier與Portal索引，維持原生乘加順序。Factory捕獲primitive值，不保留可變輸入array供後續查詢；cursorCps／grandmaCps原介面保留。未跨候選／跨tick快取，source gate與每候選原生CalculateGains刷新不變。

先以ignored直接內嵌原型36對，31/36較快、new−old中位−5.1725ms，品質exact；產品版保留動態驗證後36對26/36較快、中位−3.9925ms。最終再將Grandma驗證與prefix統一使用已解構primitive值，fresh check／build exit0：197來源／101工具、TypeScript通過、lint0 errors／1既有warning、bundle409.7kb。既有2000個seeded snapshots增加factory／wrapper exact對照，新增靜態輸入變更隔離、sparse／NaN／負數amount、錯誤tier與Portal長度回歸。

最終產品factory對2f8550a原純函式，同bundle交錯36對完整updateUI：四buff／bulk1/10/100／amount123/199/200，全部item／native outputs exact、前三及購買決策一致；26/36較快，配對中位−3.3925ms，去前4對−3.5700ms。此為固定輸入完整更新比較，未實購，不代表自然FPS。raw／summary：tmp/compiled-special-product-final-update.json、tmp/compiled-special-product-final-summary.json；builder／runner tmp/build-compiled-special-product-final.mjs、tmp/compiled-special-product-final-update.mjs，session15590 exit0、owned關閉。原型session65709與第一產品session72159亦exit0、owned關閉，前兩版證據分別保留compiled-special及compiled-special-product同名前綴檔案。

最終產品bundle SHA256 95b261d53b4b0a434637e79da3ad0d0c8c67aa9d34e52f659346d1eb10204266；SHA256(specialBuildingCps.ts bytes || productionProjection.ts bytes)為f4c23521197f71de768d9731f77b5dd9e5cd8164818c75deb63178c609ad9c28。下一步凍結metadata，以正式2054.01為對照做自然六輪及實購；目前未部署候選。

### 特殊建築預計算自然驗收與部署（2026-11-22）

來源4501bb6／凍結metadata2054.04，bundle SHA256 95b261d53b4b0a434637e79da3ad0d0c8c67aa9d34e52f659346d1eb10204266；對照正式2054.01，同快照、16mods固定順序、A*／銀行／自購／bulk100，15秒暖機／60秒量測／各3輪打亂。沒有並行建置、測試或CPU profiler；CalculateGains及候選方法身分保留。

| ms，每列各三輪 | 正式2054.01 | 候選2054.04 |
|---|---|---|
| update p95 | 53.720／54.405／46.040 | 46.250／51.415／49.340 |
| update max | 79.665／79.545／88.190 | 74.340／76.425／82.445 |
| frame p99 | 30.014／30.080／29.949 | 29.986／29.956／29.987 |
| longtask max | 79.995／79.800／88.385 | 74.540／76.720／82.600 |

六輪有效、未截斷，端點原生／投影已記錄的item／strategy／排序／購買輸入exact、前三／購買決策一致；狀態不變檢查涵蓋cash／CPS／持有量／buff等既有欄位，不涵蓋36對診斷擴充的全部native outputs。2913次實購呼叫、1634次成功、40901單位；404次成功建築購買皆到100倍數，銀行／付款／輸入／倍數違規皆0。購買觀察涵蓋暖機與量測，端點品質不等於每次實購逐一oracle。原始資料／final-assessment：tmp/compiled-special-natural/1795317347487；runner tmp/compiled-special-natural.mjs，session37678 exit0、owned關閉。彙整node tmp/assess-multiplier-owned-natural.mjs tmp/compiled-special-natural/1795317347487 exit0。

採用預計算省工：同輸入完整更新配對已有中位−3.3925ms，這批自然更新p95兩組降低一組升高、三組max較低，沒有一致frame尾端改善。自然進程可能分岔，不換算因果倍率、不宣稱FPS提高或每次≤50ms；候選仍有82.445ms同步更新尖峰，先前更大尖峰不因本輪未重現而刪除。

獨立唯讀代理複核最終source與diff，未見阻擋項，確認scalar隔離、原乘加順序、動態驗證及建立時baseSpecial驗證。實際只讀來源並跑git diff --check exit0，未執行測試／build／遊戲；不冒稱主線驗證為代理獨立證據。回報tmp/compiled-special-static-review.json。其指出alias測試未直接啟用Cat ladies；主線在自然量測結束後補齊啟用該升級並修改kittensOwned的斷言，focused Vitest specialBuildingCps.test.js 3/3通過exit0。此後產品source／bundle不變。

已備份部署實測4501bb6／2054.04至既有BestDealHelper目錄，bundle與metadata讀回hash一致。receipt tmp/compiled-special-deployment.json；backup tmp/production-backup-compiled-special-1795317932484；入口tmp/deploy-compiled-special.mjs，exit0。正式主程序0，遊戲core及正式save.cki hash前後不變；未啟動正式遊戲、未修改正式存檔／設定。文件與測試commit正常hook遞增庫內metadata，不重部署未經本批實測的metadata。

### 特殊tier靜態預計算：拒採（2026-11-22）

以4501bb6來源建立ignored原型，只在每個私有模型建立時驗證特殊tier／synergy資料並計算固定tier乘積；fork仍用當次amounts依原順序套用synergy及fortune。保留全部source gate、動態數量驗證及每候選原生刷新，未跨候選／tick共用模型。

同bundle交錯36對完整updateUI，四buff／bulk1/10/100／amount123/199/200，全部item／native outputs exact，前三及購買決策一致；17/36較快，new−old配對中位+0.475ms，去前4對−0.375ms，無穩定完整更新收益。不接產品、不進自然六輪、不部署。raw／summary：tmp/compiled-tier-update.json、tmp/compiled-tier-summary.json；builder／runner tmp/build-compiled-tier.mjs、tmp/compiled-tier-update.mjs，session12033 exit0、owned關閉。正式2054.04及存檔／設定未變。

### 標籤相同文字省略DOM寫入候選（2026-11-22）

updateNotation的cache同時比較文字、顏色及透明度，只有顏色變化也會重寫相同innerHTML／textContent。最小產品變更僅兩處：實際DOM文字與nextText相同時不指派；顏色、透明度、cache更新與文字確實改變時的寫入保留。沒有改演算法、時間估計、優先序或任何Game模擬。沿用modern-web-guidance performance的量測及減少DOM寫入原則，未新增dependency。

同bundle開關36對完整更新，四buff／bulk1/10/100／amount123/199/200，所有item／native outputs／標籤HTML與color exact、前三及購買決策一致。19/36較快，配對中位new−old −0.300ms，不能宣稱完整更新穩定改善。raw／summary：tmp/provenance-notation-text-update.json、tmp/notation-text-update-summary.json；runner tmp/provenance-notation-text-update.mjs，session10822 exit0、owned關閉。

77個標籤各50輪強制cache miss、12對交錯，DOM輸出全部一致，12/12較快，old/new中位24.605／17.465ms。相同MutationObserver診斷下，childList異動中位2250／350，chroma呼叫皆3850，收益來自減少相同文字重建。此為密集局部量測，包含觀察器負擔，不代表自然cache miss頻率、FPS或整體倍率。raw／summary：tmp/notation-text-micro.json、tmp/notation-text-micro-summary.json；runner tmp/notation-text-micro.mjs，session23920 exit0、owned關閉；builder tmp/build-notation-text.mjs。

新增建築／升級兩個回歸：只變色不重寫文字，文字改變仍寫入。fresh check／build exit0：199來源／101工具、TypeScript通過、lint0 errors／1既有warning、bundle409.8kb。實際無診斷產品bundle另36對原生／投影完整updateUI，全item／native outputs／HTML／color exact、前三／購買決策一致；不將既有投影差距當成本片收益。raw／runner tmp/provenance-notation-text-product-update.json、同名.mjs，session8062 exit0、owned關閉。產品SHA256 13a778f84fd29a18f6e5453a9d7a1a94b074e5f66c2a946150d0d3027624d663。正式2054.04未變；候選提交後再作自然六輪及實購驗收。

### 標籤文字省工自然驗收與部署（2026-11-22）

來源880aa2a／凍結metadata2054.07，bundle SHA256 13a778f84fd29a18f6e5453a9d7a1a94b074e5f66c2a946150d0d3027624d663；對照正式2054.04，同快照、16mods固定順序、A*／銀行／自購／bulk100，15秒暖機／60秒量測／各3輪打亂。沒有並行建置、測試或CPU profiler；原生gains及候選函式身分保留。

| ms，每列各三輪 | 正式2054.04 | 候選2054.07 |
|---|---|---|
| update p95 | 89.030／52.165／41.365 | 45.385／47.125／45.065 |
| update max | 250.630／70.740／67.955 | 75.055／104.945／73.275 |
| frame p99 | 79.978／29.985／29.900 | 29.994／30.003／30.027 |
| longtask max | 250.815／71.525／68.345 | 75.300／105.115／73.510 |

六輪樣本有效且未截斷，端點同輸入已記錄的推薦輸出、策略分數、排序、前三與購買輸入／決策exact；既有cash／CPS／持有量／buff等狀態檢查通過。自然端點沒有擴充36對診斷的全部native outputs及DOM，不能將其稱為全部原生輸出核對；那些欄位的一致性由獨立36對產品測試證明。同步修正前一節特殊建築自然驗收中過廣的端點措辭，不改原始結果。

3804次實購呼叫、2078次成功、48014單位；471次成功建築購買皆到100倍數，銀行／付款／輸入／倍數違規皆0。購買觀察包含暖機及量測，不等於每次實購都有逐項oracle。raw／final-assessment：tmp/notation-text-natural/1795318455658；runner tmp/notation-text-natural.mjs，session7573 exit0、owned關閉；彙整node tmp/assess-multiplier-owned-natural.mjs tmp/notation-text-natural/1795318455658 exit0。

採用的是兩行減少重複文字DOM寫入的局部省工，依據12/12局部較快及文字節點異動減少。自然更新p95兩組降低一組升高，max兩組升高，尾端沒有一致改善；正式250.630ms與候選104.945ms都保留，不歸因於未量測的外部負載、GC或特定模組。不能從首輪大差距換算因果倍率，也不宣稱FPS提高、卡頓消除或每次≤50ms。

已備份部署實測880aa2a／2054.07至既有BestDealHelper目錄，bundle及metadata hash讀回一致。receipt tmp/notation-text-deployment.json；backup tmp/production-backup-notation-text-1795319061469；入口tmp/deploy-notation-text.mjs，exit0。正式主程序0，core與正式save.cki hash前後不變；未啟動正式遊戲，正式存檔／設定未修改。後續文件commit的版本遞增不重部署。下一步應先對齊最新bundle的尖峰timeline與CPU成本，不能持續用零碎局部收益宣稱整體尖峰已改善。

### 對齊2054.07尖峰task與thread CPU（2026-11-22）

正式880aa2a／2054.07同hash隔離副本，16mods／A*／銀行／自購／bulk100，15秒暖機、30秒CDP timeline＋1ms CPU採樣，樣本有效。以BestDealHelper FunctionCall定位唯一CrRendererMain，CPU profile與trace單調時鐘覆蓋每個分析task，邊界sample只計交集；另保留tdur及大於5ms採樣間隔，不能把採樣權重當精確thread CPU分攤。

最大RunTask wall78.091ms、thread CPU75.431ms，差2.660ms；第二／三大task為77.861／75.899ms及74.961／73.048ms（wall／CPU）。前10大task沒有大於5ms的sample interval。最大task內MinorGC wall1.147ms／thread0.851ms、MajorGC0、Layout0.674／0.655ms、style0.057ms；此尖峰主要為同步CPU工作，不能歸因於GC、layout或執行緒等待。這不代表先前105／251ms的未對齊自然尖峰成因相同；本批未重現那些數值。

最大task對齊採樣78.091ms中，updateUI76.080ms、候選計算69.300ms、projectBuildingTrial35.686ms、原生CalculateGains33.614ms、leaveSandBox18.369ms、captureProjectionBase15.284ms為inclusive權重，父子不可相加。30秒整體updateUI採樣3468.672ms中，候選計算68.80%、原生gains28.17%、notation13.22%；不是自然效能或FPS比較。圖／raw：tmp/notation-text-stream-trace/1795319461050/flamegraph.html、trace.json、cpu.cpuprofile、aligned-task-costs.json；runner tmp/notation-text-stream-trace.mjs，session47851 exit0、owned關閉；分析tmp/analyze-notation-trace.mjs與既有flamegraph.mjs皆exit0。

首輪60秒ReportEvents版在Tracing完成事件逾時，exit1，僅有空partial trace，不能作分析證據；tmp/notation-text-trace/1795319246553保留。事後核對正式／隔離主程序皆0，owner receipt已正常移除，沒有因觀察逾時重啟既有程序。修正版改ReturnAsStream，以256KiB分塊IO.read，縮至30秒並移除不需要的frame／詳細v8.gc類別；收到完成stream後才分析，trace完整大小185728741 bytes與讀入累計相符，dataLossOccurred未為true。可重跑runner後續改FileHandle.writeFile確保每塊完整寫入，node --check通過；該IO細節未另作遊戲量測，不冒稱重新採樣。

下一步評估較大的guard／capture重複成本；僅同一task仍不能證明基底不變，每候選原生刷新必須保留。已派既有唯讀代理盤點連續純building候選共用capture所需的完整副作用契約，尚未採用新cache。正式bundle／metadata／存檔與設定未變。

### 共用capture拒採及輸出表別名回退修正（2026-11-22）

獨立唯讀代理指出：每候選之前尚有getSimulationKey／isIgnored／isVaulted等回呼，且native輸出物件未必與模型讀取圖互斥；同一task、空hooks、無time特例與已獲得CPS成就，不足以證明基底不變。這不是先前已拒採的JSON／結構比較cache再實作；本輪沒有接入任何共用context。複核範圍及限制tmp/shared-capture-boundary-review.json。

主線無UI VM複驗：載入實際main.js，以core-smoke初始化，再補釘選CCSE-compatible helpers、空hooks及必要numeric初始化。Farm amount0／bought100，isVaulted將Cheap hoes.bought設1並回false；兩側gate均通過、projectBuildingTrial均接管，base raw與凍結model base皆20，但Farm100的凍結／fresh raw為820／1620，推薦數值亦不同。故單比base raw或僅native fallback時清cache都不足。raw／assert runner tmp/shared-capture-vault-counterexample.json、同名.mjs，原生Node exit0；無Electron、存檔或產品source寫入。初次VM準備分別遇非array AchievementsById、漏傳fallback、原生helper與CCSE釘選來源不同及lumps初始化不足，均未形成有效反例；補齊後才有上述完整正向接管與斷言證據。

進一步驗出現行單次投影的直接輸出別名反例：cookiesPsByType與Upgrades共用物件，egg持有。初始gate通過、base raw29；原生中間刷新覆寫egg entry，Farm100 native raw820。純投影paid相同8611624689，但acceleration為0.00007701218108670412，原生為0.0000753191207727051。這是人工構造的已接受資料形狀，未在玩家正式存檔量測中重現。raw／runner tmp/current-projection-alias-counterexample.json、同名.mjs，修正前原生Node exit0。

最小保守修正：兩分類輸出map不能互為同一物件；既有欄位須為標準輸出名稱的own finite nonnegative數值，Reflect.ownKeys涵蓋非enumerable及Symbol。保留全部潛在輸出key的writableData檢查，不呼叫getter、不刪除metadata；未知欄位／不相容別名回原生。允許空表、部分欄位與殘留egg；保留既有missing/null處理。這只封住不相容輸出record，不宣稱完整read/write graph隔離，也不允許跨候選共用capture。

新增兩個來源回歸涵蓋標準／未知／非數值／getter／Symbol／互alias及Upgrades alias。fresh dev.ps1 check／build exit0：201來源／101工具、TypeScript通過、lint0 errors／1既有warning、bundle410.3kb；初版額外兩個無用escape warning已清除並重跑。修正後VM正常資料gate通過且可投影，別名反例回退output:cookiesPsByType；tmp/output-map-alias-fixed.json、同名.mjs，exit0。

16mods／四buff／bulk1/10/100／amount123/199/200，實際產品36對原生／投影完整更新，全item／native outputs／HTML／color exact、前三及購買決策一致；每對投影接管至少19項。raw／runner tmp/provenance-output-map-fence-update.json、同名.mjs，session92567 exit0、owned關閉，未實購。產品SHA256 b6eb0490b35748f38705f7fc0ba021118c1663c6bb98868c1155b848c65bd50b。此為回退安全修正，未做新自然六輪、不宣稱新效能；正式2054.07未變。另有minigame receiver與Game共用物件的feedback疑慮尚待獨立驗證。

### minigame receiver feedback回退修正（2026-11-22）

主線進一步以實際main.js core-smoke＋釘選CCSE-compatible helpers／空hooks驗證：Cursor amount0／bought100、Grandma100；Farm的獨立minigame提供cursorCps=2，而Cursor.minigame直接指向Game，初始Game.effs.cursorCps=1。CalculateGains會重新指派Game.effs，下一次minigame.effs也跟著改變。初始gate通過、base raw100不變、純capture得到cursorCps4；單次100單位純投影acceleration0.00012262489731122857，但原生逐步更新raw5.070602400912918e31、acceleration2.189451251808502e55，paid均117431291。這是人工構造的receiver feedback，未在正式存檔中觀察到。raw／runner tmp/minigame-feedback-counterexample.json、同名.mjs，原生Node exit0。最初試farmCps未影響釘選普通Farm公式，差異斷言失敗，該次不作反例；改用原生Cursor確實讀取的cursorCps才得到上述證據。

最小修正僅在captureProductionEffects讀取minigame data descriptor後，發現receiver與game同一物件即拋出Unsupported minigame effect owner；在讀effs前拒絕，現行adapter catch回原生。獨立minigame receiver即使引用舊Game.effs物件也不會跟隨Game.effs重新指派，保留此正常情況。來源gate、效果乘法與零值重設順序、原生刷新均未改；不是完整read/write graph隔離，也不批准共用capture。

新增receiver身分／獨立receiver／Game.effs重指派回歸。fresh dev.ps1 check／build exit0：202來源／101工具、TypeScript通過、lint0 errors／1既有warning、bundle410.4kb。修正後VM正常receiver仍接管，Game receiver被拒絕、projectBuildingTrial回退snapshot-or-projection。兩項alias固定檢查皆以最終來源重跑exit0：tmp/output-map-alias-fixed.json、tmp/minigame-feedback-fixed.json，各同名.mjs。無UI VM只驗證這些受控資料，不作16mods／存檔／效能證明。

最終bundle另16mods、四buff／bulk1/10/100／amount123/199/200的36對完整原生／投影更新，全item／native outputs／HTML／color exact、前三與購買決策一致；raw／runner tmp/provenance-minigame-owner-fence-update.json、同名.mjs，session88016 exit0、owned關閉，未實購。產品SHA256 f73c7340eb15571b4cb92fa14c2846847498c6c0331dcb97183f99e5db2091e8。獨立代理唯讀最終source／diff及主線反例JSON，未見阻擋項；未獨立執行遊戲／測試／build，回報tmp/minigame-owner-review.json。此為安全回退修正，沒有新自然六輪或效能加速宣告。提交後凍結metadata，再備份部署兩項已驗防護；正式2054.07暫不變。

### 兩項別名防護備份部署（2026-11-22）

最終10691f6／2054.11已部署到既有BestDealHelper目錄；bundle SHA256 f73c7340eb15571b4cb92fa14c2846847498c6c0331dcb97183f99e5db2091e8，metadata亦讀回一致。部署前確認正式主程序0、舊bundle／info仍為2054.07已知hash，兩個最終VM固定檢查及16mods36對品質皆通過，再備份寫入；失敗路徑保留還原。receipt tmp/alias-fences-deployment.json，backup tmp/production-backup-alias-fences-1795321444902，入口tmp/deploy-alias-fences.mjs，exit0。正式core及save.cki hash前後不變，正式程序未啟動，存檔／設定未修改。

交付是對已驗兩類人工資料別名的保守回退，不是新增效能改善、完整alias隔離或共用capture支援。2054.11沒有重跑自然六輪；最新自然與timeline／CPU證據仍屬2054.07，不移用數字宣稱新版耗時。每次≤50ms尚未達成。後續文件commit正常hook的metadata遞增不重部署。

### 單候選capture／fork局部四方案：無穩定收益，拒採（2026-11-22）

基於10691f6／2054.11產品來源，各ignored原型皆同bundle開關、交錯36對完整updateUI；16mods／四buff／bulk1/10/100／amount123/199/200，全item與已記錄native outputs exact、前三及購買決策一致，未實購。所有完整runner已exit0、owned正常關閉；沒有產品source改動、沒有部署原型。manifest tmp/capture-local-prototypes-manifest.json綁定base commit、正式產品及各診斷bundle hash。

| 原型 | 較快對數／36 | new−old中位ms | 去前4對中位ms |
|---|---|---|---|
| 同次capture重用鍵／Objects枚舉 | 19 | −0.1175 | −0.1175 |
| 私有building nodes省複製 | 18 | +0.0825 | +0.0825 |
| fork僅配置受影響節點Map | 17 | +0.9575 | −0.0150 |
| ownership enum改直接型別／數值比較 | 20 | −0.9400 | −1.2350 |

枚舉原型保留for-in／sparse／data descriptor檢查；節點借用只觀察私有模型情境，不能由此宣稱公開rebase／ownership API安全；稀疏fork保留基底entry並另存invalidated節點，未省略逐棟輸出；enum比較接受範圍仍為0／1／false／true。各自只驗上述固定輸入品質，沒有將不穩定耗時差當成改善。

enum另在同一實際Game的guard作12對交錯微量測，875個upgrade，每組50次暖機／200次量測，所有呼叫返回undefined。僅7/12較快，old/new中位67.435／66.925ms，局部收益亦不穩定，拒採。raw／summary tmp/direct-ownership-micro.json、tmp/direct-ownership-micro-summary.json；runner同名.mjs，session32645 exit0、owned關閉。

完整raw／summary依前綴capture-enumeration、borrow-building-nodes、sparse-fork、direct-ownership存tmp/*-update.json、*-summary.json；各builder tmp/build-*.mjs及runner tmp/*-update.mjs可追溯，sessions61181／81227／44059／1285 exit0。未為拒採原型加入選項或產品測試，不改已部署2054.11。下一步查UI更新budget／staleCount與批量重算的關聯；不以更多低占比配置微調代替整體尖峰成因。

### 集中到期覆蓋自適應預算：正式2054.11單輪診斷（2026-11-22）

從正式部署讀取bundle與metadata，核對既有receipt hash後，只複製到隔離遊戲。16mods、原快照、銀行／自購、bulk100、嚴格模式；暖機15秒、採樣60秒。包裝updateUI與候選方法，記錄更新起點的staleCount、調整後budget、cache entry替換數及候選耗時。觀察器有額外負擔；這是單輪成因診斷，不是方案比較、推薦品質驗收或新版加速證明。未改產品來源、正式部署、正式存檔或設定。

453次更新中，66次staleCount高於budget，且恰為全部computed高於budget的更新；這66次computed均等於staleCount。全部更新p95 46.285ms、最大85.550ms；覆蓋budget組p95 67.240ms，其他387次p95 19.450ms、最大33.485ms。最慢更新stale=122／items=122、budget=14、computed=122，候選部分80.530ms／總85.550ms。過期數最大177；單輪結果支持集中到期與同步尖峰相關，不能排除候選組成、模組狀態及觀察器造成的影響，也未證明每次到期均有同樣成本。

畫格p99 30.001ms／最大89.918ms、18個>50ms畫格，19筆longtask；全程visible、未截斷。維持maxStalenessMs=1000及現有計算路徑，未直接以砍budget或延長時效換取較小數字。後續若試提前分散刷新，必須先證明時效上限、未知效果回退與前三／購買決策，再作重複比較；不得將本診斷當作該方案已通過。

raw、before／after、summary：tmp/stale-budget-observe/1795323590227；runner tmp/stale-budget-observe.mjs，session72906 exit0。bundle仍為f73c7340eb15571b4cb92fa14c2846847498c6c0331dcb97183f99e5db2091e8。tmp/check-stale-budget.mjs以assert核對453筆、66次對應關係、16mods順序／版本一致、bulk100／嚴格設定及正式／隔離主程序皆0，exit0；owned PID16568已正常關閉。runner的node --check通過；本階段不另宣稱產品build或101工具測試已重跑。

### 剩餘預算提前刷新：一般時間線通過，未知效果反例拒採（2026-11-22）

隔離2054.11原型先跑正常候選，再用剩餘budget刷新age≥500ms的最舊項目，不延長1000ms上限。三個獨立planner instance共用同一同步遊戲輸入，凍結原生game loop，以100ms步進60次、餅乾依CPS增加、不實購；交錯baseline／prefetch順序，另以清除候選cache的planner對照。16mods／79項，三者各步實際策略前三及原始分數前三皆一致。清除候選cache的對照仍保留策略狀態，不是每步全新策略oracle；未含重生、自購進程、buff到期或未知效果，不能代替自然六輪。raw tmp/prefetch-quality/1795323933325/result.json，runner tmp/prefetch-quality.mjs，session41343 exit0、owned關閉。

另以實際native CalculateGains為底，加入四個人工升級試算效果。初始權重4／3／2／1；600ms後各試算增量等比例縮成0.01，live基底及所有simulation key不變。原先cached與全量新算的原始候選前三仍為100000／100001／100002；只提前刷新最舊第一項後，混合新舊值成100001／100002／100003，前三錯位。反例assert確認舊排序與全量一致、提前局部刷新不同且key未變，exit0。這是人工未知模組效果／原始候選排序反例，並非玩家存檔或最終策略UI錯序的觀察；足以否定「更早刷新一部分必然不損害排序」的假設，不能由一般時間線通過推得嚴格品質保證。

raw tmp/prefetch-counterexample/1795324050818/result.json；body tmp/prefetch-counterexample-body.mjs、runner tmp/prefetch-counterexample.mjs、產生入口tmp/build-prefetch-counterexample.mjs，session27226 exit0、owned關閉。兩runner的node --check通過。拒採無額外失效／一致性協議的提前局部刷新，不加產品選項、不改正式來源或部署；未作該原型效能改善宣告。

### 2054.11最終100ms驗收（2026-11-22）

使用者明確指定每次統計更新100ms門檻，取代先前尚未確認的50ms目標。從正式部署凍結2054.11 bundle／metadata，逐byte hash核對receipt；舊2054.04沿用已凍結對照。16mods固定載入順序、同隔離快照、原搜尋設定、銀行／自購開啟、bulk100、嚴格投影、近似關閉；每輪暖機15秒、採樣60秒，各三輪以種子20261123交錯。全程visible、未截斷、六輪均有效；沒有CPU profiler或並行build／tests干擾採樣。

| 版本 | 輪次 | 更新次數 | p95 ms | 最大ms | 畫格p99 ms |
|---|---:|---:|---:|---:|---:|
| 2054.11 | 1 | 396 | 44.830 | 84.200 | 29.960 |
| 2054.04 | 1 | 390 | 42.305 | 97.740 | 29.956 |
| 2054.11 | 2 | 331 | 48.955 | 70.750 | 29.964 |
| 2054.04 | 2 | 372 | 49.580 | 79.265 | 30.010 |
| 2054.11 | 3 | 383 | 47.455 | 83.280 | 29.984 |
| 2054.04 | 3 | 326 | 84.515 | 124.335 | 59.982 |

analyzer逐筆核對新版1,110筆原始updateUI耗時，全部finite且≤100ms，超標0、最慢84.200ms；符合本次已量測窗口的門檻。新版最長longtask84.445ms、畫格最大99.986ms，仍有50筆>50ms畫格；不能宣稱零卡頓。自然自購進程並不逐步相同，第三輪舊版較慢不構成因果倍率或普遍速度保證。

六輪各端點的原生／嚴格投影已記錄候選、策略、排序與購買輸入exact、前三及購買決策一致；此核對不涵蓋每次中間推薦，也不等同36對診斷的所有native outputs／DOM核對。新版三輪實際成功889次、建築207次，後者全部100倍數；六輪共3376次buy呼叫、1862次成功、45346單位，成功建築446次全部100倍數，銀行保留額／付款／輸入／倍數違規皆0，未截斷。實購安全由purchase observer另證，不以前述端點purchaseSafety=not-assessed當作實購驗收。

raw及final-assessment：tmp/final-strict-natural/1795324208806；runner tmp/final-strict-natural.mjs、凍結入口tmp/build-final-strict-natural.mjs、逐筆assert入口tmp/assess-final-strict-natural.mjs，session37020 exit0、所有owned正常關閉，正式主程序0。正式bundle／metadata讀回與部署receipt一致，本輪未改部署或回寫正式存檔。新版SHA256 f73c7340eb15571b4cb92fa14c2846847498c6c0331dcb97183f99e5db2091e8，舊版95b261d53b4b0a434637e79da3ad0d0c8c67aa9d34e52f659346d1eb10204266。

採樣結束後fresh dev.ps1 check exit0：TypeScript、lint0 errors／1既有warning、202來源及101工具測試通過。dev.ps1 build exit0，410.4kb；重建hash與正式2054.11一致。e4bf07f相對10691f6的src／scripts差異為空；本階段只更新驗收文件與正常hook metadata，不重部署文件commit的版本號。未知遊戲版本／來源／效果維持原生回退；不保證未測存檔、未來版本或任意第三方模組皆≤100ms。

### 2053.01發布建置核對（2026-11-23）

使用者指定正式tag／ModVersion／runtime version為2053.01，GameVersion維持2.053。以既有Yarn frozen lock安裝獨立worktree依賴，移除root Windows-only esbuild依賴，保留esbuild的optional平台選擇；CI改Node22／Yarn1.22.22並納入來源／工具檢查。local dev.ps1 check／build exit0：202來源／101工具、typecheck、lint0errors／1既有warning。local bundled Node實際為24.22.1；Linux Node22結果須由遠端CI另證。

新bundle 88e15251a64ad3fdbc0791e6b4667af22709df322d7e9b4924c38fa0708ea904；將前次已驗bundle的worktree依賴路徑../../node_modules/統一為node_modules/、runtime version改2053.01後，逐byte等於新bundle，沒有其他程式變動。16mods／四buff／bulk1/10/100／amount123/199/200的36對在固定寬裕搜尋budget下，全item／已記錄native outputs／notation exact、前三與購買決策一致；未實購。raw tmp/release-2053-01-deterministic-quality.json，runner同名.mjs，session67508 exit0、owned關閉；等價與品質摘要tmp/release-2053-01-verification.json。此為品質核對，不重稱為2053.01自然量測。

先前使用原搜尋budget的試跑於第8對失配：item數值及非notation native outputs相同，但baseline搜尋timeout、投影未timeout，導致策略前三／顏色不同。保留tmp/release-2053-01-quality.json及同名runner，session2035 exit1、owned正常關閉。固定budget核對只用於隔離計算等價，不變更玩家設定；已於Release說明time-budgeted策略在負載下可能選不同路徑，不把該初次失配隱藏為全部通過。
