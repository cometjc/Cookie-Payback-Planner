# 增量收益模擬

目前狀態（2026-11-22）：已部署2053.80使用來源／資料guard保護的純產量投影，預設開啟；未知版本／規則回原生。近似`experimentalBatch`預設仍關閉。以下單sandbox cache與S15–S18段落保留為研究階段證據，不代表目前預設；目前契約見[比較設計](performance-design.md)，部署與完整量測見[結果](performance-results.md)。未實作跨tick模型或搜尋frontier共用，未移植Rust／WASM。

## 決策與目前證據

優先研究相依圖與局部重算，暫不移植Rust或切換搜尋。原型保留Game.CalculateGains外層，只快取單次sandbox中未受影響的building.cps；不跨tick、不改正式預設。

固定三負載各60對交替比較，去前10對，所有150對推薦數值、買量、等待、helper、strategy、排序、首選與遊戲狀態一致。完整updateUI p95 ms：無buff29.850→24.905、Frenzy35.030→26.030、雙buff60.315→40.690。資料tmp/partial-cps/1794023535829。另逐cache-hit呼叫原函式oracle，三負載各12對皆一致，tmp/partial-cps-oracle/1794023622386；oracle計時不代表候選速度。

原型沒有完整未知hook/資料結構guard，只證明此隔離輸入可行；不可部署，不能宣稱所有mod相容或自然幀已改善。

## 相依模型

以原始building.cps為節點，原生CalculateGains繼續按原順序計算storedTotalCps、加總與全域倍率。保留浮點運算順序；不以舊總CPS加delta取代原加總。

- Cursor：所有非Cursor建築amount、fingers upgrades、tier與effects。
- Grandma：自身amount、Portal amount、其他建築amount（Elder Battalion）、GrandmaSynergies、kitten、tier、aura、effects。
- 其他建築：自身baseCps、tier/unshackle、fortune、Grandma amount、synergy對偶amount、magicCpS與hooks。
- 任意upgrade試算、tier解鎖：首版全部失效；不靠upgrade名稱猜純局部效果。
- 時間、minigame effects、aura/god、ascension、函式或hook、集合結構變更：全部失效或fallback。

動態read tracing只作漏邊診斷。未執行分支、閉包原引用、列舉、getter/Proxy均可能逃過追蹤，不能用一次trace證明完整相依。

## 實作階段與驗收

1. 單sandbox cache：釘住已核對版本與函式來源；未知cps/helper/hook走原函式。呼叫保留this與參數，巢狀作用域隔離，finally只還原仍為自己wrapper的函式。將guard成本納入完整更新量測。不能把當下任意runtime source自動列入trusted。
2. 每次CalculateGains逐步oracle：比較所有building storedCps/total、raw/unbuffed/buffed/mouse CPS、effects、lump輸出及hook順序；涵蓋bulk1/10/100、tier臨界、Cursor/Grandma/Portal、雙向synergy、buff/bank、例外還原、未知函式/hook拒絕。最終推薦oracle另核對排序與首選。
3. 品質通過後同隔離快照與mod組合，15秒暖機、60秒量測、3次種子隨機自然更新；比較update p95/p99/max、長阻塞與rAF間隔，不能以同步微量測驗收卡頓。
4. 純數值overlay：immutable base保存primitive arrays；overlay保存變更amount/bought與dirty節點，讀取先查overlay再查base，完全不寫Game。保留原公式乘法/加總順序。
5. base generation更新：diff primitive inputs，沿反向相依失效；受影響推薦cache/frontier prune。cookies、價格、bank、click income、buff剩餘時間分開建模，不能以CPS沒變推論推薦仍有效。未知規則或mod效果立即全量fallback。

首版不跨tick快取，也不刪CalculateGains外層。完整overlay需逐步對照證明後擴展，WASM僅在純模型占比足夠且批次邊界明確時再比較。

## Overlay 與失效邊界

基底不是單一總CPS：它必須包含公式實際讀取的primitive輸入與規則身分。每次試算只覆蓋amount、bought等允許寫入欄位；從被覆蓋輸入沿反向相依標記dirty，依原計算順序重算。分支結果綁定base generation；舊分支不可直接套到新基底。只有相依輸入與規則身分都沒變的節點可以重用。

|輸入變動|最小失效範圍|推薦／搜尋處理|
|---|---|---|
|單一普通建築amount|該建築總產量、Cursor、Grandma的相關分支、雙向synergy鄰居、全域加總與衍生值|該建築價格及相依候選重估；不能只刪該建築候選|
|Grandma amount、tier、upgrade bought|所有讀取它的CPS節點；未證明依賴時全量|重估收益、價格、可購買集合與相關路徑|
|cookies／bank|通常可保留純CPS節點，但有銀行相依公式時須重算|等待時間、可負擔性、排序與路徑成本失效|
|buff時間／點擊收入|相應產量或等待時間節點|等待積分與評分失效；即使CPS倍率沒變也要處理到期時間|
|版本、函式、hook、mod效果未知|不使用純模型，完整原生fallback|丟棄模型分支；不沿用舊推薦快取|

dirty節點失效與搜尋prune不同。前者只是不重用舊數值；後者會刪除未來選項。收益或價格變動後不能只保留原top-k，也不能沿用過期的上界／下界來剪枝。未有可驗證的界限前，重算受影響路徑或重建frontier；增量計算本身不提供A*最優性。

第一階段實驗僅覆蓋「單一sandbox內普通building.cps重用」，仍修改並finally還原Game；尚非純overlay。跨tick generation、反向相依失效與frontier維護尚未實作。

第二階段buildingCpsModel提供純數值普通建築節點：fork(amount patches)隔離分支，rebase比較規則與相依amount，只失效受影響節點；舊分支保留舊基底。計算核心不讀寫Game。遊戲adapter仍在原sandbox中，每sandbox建立模型、每步只覆蓋被試算建築amount；tier改變回退原生，Cursor/Grandma與CalculateGains外層仍原生。這尚未消除Game sandbox，也未接跨tick rebase或搜尋frontier。

立即建模在固定自然更新三輪皆較慢，已拒採。現在延後到同sandbox第4次CalculateGains才建模，短試算走原公式；門檻屬實驗，尚無穩定自然收益，不能當最佳值。模型核心的rebase仍未接入跨tick遊戲基底。

S15進一步把完整來源guard與CPS wrapper安裝也延後至第4次CalculateGains，前三次僅計數、tier變動檢查與原生呼叫。首次啟用時先還原原CalculateGains身分，再檢查靜態來源；未知規則保持原生。安裝只執行一次，cleanup保留至body finally。此為避免短試算付建模前置成本，尚非refresh共用基底或跨tick增量整合。

離線真實16mods primitive輸入3,600次原公式對照完全一致；隔離遊戲bulk1/10/100各4對逐次模型oracle，225,936次回傳Object.is一致、完整推薦一致。資料tmp/pure-model/oracle.json及tmp/pure-model-live-oracle/1794033232971；離線耗時與oracle耗時皆不能代表自然幀改善。

## Rust／WASM 與相依圖的關係

WASM只改執行引擎，不能自動消除重算。JS Game.CalculateGains、物件與hooks若仍逐步被呼叫，跨境回呼還會增加成本。優先在JS建立可驗證的純數值相依模型，確定熱點與batch邊界；之後才用同輸入、同推薦品質比較JS與WASM。原生Node addon會增加平台/封裝限制，不適合作為兼容網頁版mod的首選。

相依圖不是搜尋演算法替代品：它降低每個狀態評估成本；beam/best-first決定要評估哪些狀態。只有完整狀態語意與失效契約可靠後，才可把跨tick frontier prune/recalc作為可證明的增量搜尋。

bulk1/10/100雙增益逐cache-hit原函式oracle各12對通過（tmp/partial-bulk-oracle/1794024096197）；oracle需額外執行原函式，計時不作效能排名。bulk100即使只核品質，原版完整更新約200ms以上，確認批量購買是重要驗收負載。實作guard不得以拒絕所有官方minigame/hasGod/power使實際遊戲永遠fallback，再宣稱改善。

早期自然交錯的候選包裝位於updateBestCpsAcceleration外層，快取命中也重跑來源guard與wrapper安裝。目前已移到sim.ts通過cache早退之後的實際sandbox計算區塊；helper未使用此cache。最新三輪自然觀測仍無穩定frame或最長阻塞收益，預設false，詳見performance-results.md。

S16 將純模型生命期擴至單次 PerformanceExperiment.withRefresh：候選之間重用 memo，每個 sandbox 完整來源／價格檢查成功後重新擷取 primitive nodes/amounts 並 rebase。未改公式、失效規則與 fallback；不保存 Game refs、wrapper 或 supported 結論。nested refresh 獨立、finally 還原外層；沒有 refresh 時仍建立獨立模型。跨 tick 基底及搜尋 frontier 尚未接入。

本輪 40 項來源／61 項工具測試、tsc、lint（0 errors／1 既有 warning）、build 通過。獨立複核 26 項測試通過，tmp/refresh-model-review.md 綁定來源 hash。隔離同快照 live oracle tmp/pure-model-live-oracle/1794035564407，bulk1/10/100 各4對，210,672 次模型回傳 Object.is 與原公式一致；完整推薦與狀態一致。oracle 額外執行原公式，不採其時間作效能證據。自然量測另用一般 bundle decebc1aafac81b4b19166baf9a4488009688d2569a416677ea19f7e1f1cd6b0。

S17離線前置已實作cursorCps/grandmaCps與productionMultipliers，未接Game adapter，故不影響正式或實驗更新。特殊公式4,000次釘住原函式Object.is對照；全域倍率830組釘住CalculateGains checkpoint對照。兩份獨立唯讀review無新增阻擋（tmp/special-building-review.md、tmp/production-multipliers-review.md）。fresh check45來源／61工具、tsc、lint0errors/1既有warning、build通過。尚須完整產量加總、純價格/等待、guard及live驗收；倍率API目前單一nowMs，原生ages與Century egg兩次讀時可能不同，整合須處理此時間契約，不可略過。

S18離線：完整projection1200＋100base對照、price4018對照、dual-clock邊界通過；獨立projection/price/dual-clock複核無新增阻擋。正式Electron缺structuredClone已實證，改受驗numeric/boolean graph JSON copy（replacer拒非有限/非primitive/null/sparse），兩項相容test通過、獨立review tmp/projection-compat-review.md；未來adapter仍須普通data descriptor守衛，JSON getter/toJSON與-0限制不能忽略。fresh check52來源／61工具、tsc/lint0errors/1既有warning；build通過。未接adapter，未證live改善。

## 已驗純模型的整批可負擔捷徑

只在來源／資料guard通過、固定tier所有權的productionProjection使用。raw amount公式只有非負加乘與固定因子，對單一持有量單調非減；時間依賴、Cursed finger與未知規則仍回原生。先算批末產量，價格逐步維持cookies -= price、paid += price原順序；批末持有量須仍為安全整數，價格／產量／銀行有限非負，批末餘額須嚴格大於批末銀行額。等值不採捷徑。

浮點證明：每步扣款後的捨入餘額至少等於批末餘額，且大於批末銀行額與每步銀行額。由round的單調性，精確的cookies-price大於該步銀行額；因此精確price+bank小於cookies，其捨入結果不會大於cookies。原生每步皆走可負擔首分支。付款逐價加法順序不改；只略過中間production，tier仍批末另付費、另更新。未知callback不適用，不能以抽樣代替此前提。
