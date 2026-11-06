# 升級解鎖預測：條件索引與黑箱探測

同版本可重用的是條件規則，不是上一輪購買時間線。解鎖、購買、產量改變必須分開記錄；未知條件仍走原生計算。此文件是診斷設計，尚未啟用產品預測器。

## 已執行黑箱探測

`scripts/perf/unlock-probe.mjs` 在可丟棄副本呼叫實際 building.buyFunction，攔截 Unlock/Win 記錄事件；不解析函式內容來推門檻。掃描整數 0–1000，三背景：存檔現況、其他建築皆1000、其他建築皆1000且 Has 恆為1。最後一種是反事實探測，不代表合法存檔。保存回呼來源雜湊，輸出不含存檔。

16模組共存實跑：20建築、60,060次回呼、60列、1,121筆條件轉折；轉折數含成就及不同背景的重複，不是升級總數。Farm 在1/5/15/25依序請求 Cheap hoes / Fertilizer / Farmer grandmas / Cookie trees；其他建築達門檻後，15再出現 Future almanacs / Infernal crops，證明單變量門檻不足。完整原始資料保留本機 tmp/unlock-probe.json。

此工具不呼叫 Game.Logic、不推演全域計時及升級購買。任意模組回呼可能另有副作用，僅恢復直接改動的欄位，不能在正式遊戲執行。全範圍逐值掃描能捕捉非單調事件；不能將稀疏採樣無變化視為線性證明。

## 規則盤點

依據本機遊戲 resources/app/src/main.js 與 minigameGarden.js；下列為原生來源分類，尚未逐一覆蓋16模組新增規則。

| 類別 | 依賴／觸發 | 預測方式 |
|---|---|---|
| 建築階級、Cursor fingers | 建築 amount、tier unlock | 固定門檻索引 |
| Grandma、synergy | 多建築 amount、天堂 prerequisite | 多變量條件，逐依賴失效 |
| 一般餅乾、箱裝餅乾 | UnlockAt.cookies、cookiesEarned、require、season | 門檻＋先決條件；不是當前銀行餅乾 |
| Kitten、點擊升級、全建築餅乾 | milkProgress、handmadeCookies、最少建築量 | 各自索引；成就增加會改milk |
| 研究、誓約、龍、季節開關 | 研究鏈與倒數、pledges、dragonLevel、season | 確定性事件；計時及操作為依賴 |
| 天堂開通功能 | 已購天堂升級、ascensionMode | 規則保留，重算資格 |
| 情人節餅乾 | 季節、累計產量／前置 | 確定性，不能因屬季節而一律當隨機 |

來源定位：main.js UnlockTiered約9916、UnlockAt檢查約16334、Kitten約16203、點擊約16426、研究約16220。

## 必須獨立處理的隨機結果

| 系列 | 隨機處／條件 | 注意事項 |
|---|---|---|
| 萬聖節7餅乾 | 爆破wrinkler、季節、掉落率 | 已解鎖集合影響後續；抽到重複可能不掉落 |
| 復活節12普通＋8稀有蛋 | DropEgg、金餅乾／wrinkler事件 | 分支、重抽、Omelette、Starspawn、成就、神祇、dropRateMult |
| 馴鹿7餅乾 | 聖誕季馴鹿事件 | 掉落資格與結果分開，不能固定預言下一個 |
| Santa14禮物 | A festive hat、UpgradeSanta隨機選禮物 | Santa's dominion是最終等級固定解鎖，不能混入隨機池 |
| Garden7升級 | 成熟植物收穫的dropUpgrade | Wheat slims、Elderwort biscuits、Bakeberry cookies、Fern tea、Duketater cookies、Green yeast digestives、Ichor syrup；植物取得本身亦可能隨機 |
| Fortune | Fortune cookies開通後隨機ticker、玩家點擊 | O Fortuna改出現率；重生時另有40%保留判定，須讀實際結果 |
| Dragon4掉落 | Pet the dragon、dragonLevel、點擊機率 | seed及時鐘分鐘區段選種類；不是純建築門檻 |
| 隨機成就的間接影響 | 例如Just plain lucky | 屬shadow的成就不產milk；一般成就才可能間接開Kitten／改收益 |

種子固定也不代表跨重生可直接重播：事件順序、時鐘與隨機數消耗會改結果。只預測資格；掉落後才將實際升級納入確定性規劃。期望值可另做評分，不當作已擁有。

## 累積紀錄與重生失效

1. 規則庫綁遊戲版本、實際函式來源雜湊、模組版本／順序／規則；只綁版本不足。相同指紋重用已驗證門檻。
2. 每輪基底記有效天堂升級集合、永久欄位、挑戰模式、實際保留的Fortune、成就、季節、小遊戲狀態與當前ownership。天堂升級改變只重算相依資格，非刪掉全部門檻紀錄。
3. 以「依賴欄位 → 規則」反向索引處理 amount／ownership／milk／season／timer 改變。新的規則、未知模組效果或漏判立即失效、原生回退。
4. 黑箱單一路徑只能產生觀察事實；多背景、門檻前後、雙建築交互及獨立留出快照才可升格為可用預測。未觀察到不等於不可能。
5. 升級解鎖索引不足以取代 CalculateGains。已購synergy會讓普通購買持續改變其他建築產量；Pantheon、成就、動態倍率也要驗證。先以原生oracle比推薦排序、收益及每一步等待成本，再接管區間計算。

現有sim.ts僅預看附近tier，未執行完整buyFunction解鎖鏈。因此首個實作應是診斷條件索引與原生差異核對，不能直接把學到的所有解鎖加入正式推薦而宣稱品質不變。

## 先決升級介入實測

第二輪在全部ownership開啟的背景逐一關閉實際讀取的Has名稱，共100,100次回呼、100列、1,864條件轉折。由389筆建築／門檻／解鎖觀察中找到71筆在介入後消失或改變門檻的紀錄，來源為Synergies Vol. I／II。這些數量含同一升級從不同建築觸發的重複，不是獨立升級總數。

Farm15的Future almanacs／Infernal crops依賴Synergies Vol. I；Farm75的Fertile minds／Magical botany／Rain prayer依賴Synergies Vol. II。`summarizeUnlockGates`輸出necessaryInSample與observed-only，避免將單因子消融誤當完整布林規則。原始與摘要僅留tmp/unlock-probe.json、tmp/unlock-gates.json。下一項缺口是逐peer介入與獨立背景留出驗證；當前peer全1000無法定位是哪個建築及其門檻。

## 原生收益曲線黑箱初驗

2026-11-08隔離副本、16mods、凍結Date.now，逐建築呼叫原生CalculateGains取得n=0..100共2020點；所有20建築的unbuffedCps／cookiesPsRaw／bank與端點直線誤差接近浮點捨入。最大整段新增收益相對誤差約2.112e-11（Cursor），其他多數較低。這是當次背景的完整區間檢查，非三點猜測；但未涵蓋升級購買、tier自動購買、後期協同、動態時間或新版本。可進行跨狀態shadow模型研究，不能直接作產品線性保證。raw留tmp/native-curve.json、native-curve-gain-errors.json。銀行額需依試算後raw產量即時推進，不能忽略。
