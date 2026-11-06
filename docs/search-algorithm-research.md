# 推薦搜尋演算法再評估

研究日期：2026-11-07。來源版本：本專案 a9f8b69；僅研究，不變更演算法或預設設定。

## 結論

目前沒有足夠證據將預設 beam 換成 A*。程式中的 `astar` 是限制節點數、記憶體及時間的啟發式 best-first 排序；沒有一般 A* 的最優性保證。先保留 beam 與既有 fallback，以小規模完整枚舉建立品質 oracle，再用同輸入比較 beam 與現有 best-first。效能主因必須由完整更新的 CPU／frame 證據判定，換搜尋名稱不會自動消除 `Game.CalculateGains` 的成本。

預編譯方向合理，但應先編譯已知版本的規則結構／依賴關係，不能把即時價格、增益或完整推薦答案固定。未知版本、函式變更與共存模組效果必須回退既有計算。

## 問題與方法

研究四題：目前實際最佳化什麼？A* 的理論條件是否成立？beam／best-first／完整枚舉／DP 各適合何處？哪些資料能預先建立索引？

直接核對 `src/search/algorithms.ts`、`src/strategy/engine.ts`、`src/data/config.ts`、`src/calc/sim.ts`，再閱讀搜尋教科書、ARA* 原論文、Cookie Monster 原始碼與官方遊戲 JS。沒有以一般理論推定本模組的實測速度。

既有四筆 HTTP Bing 查詢已逐筆檢查前三個結果（共12筆）：`A star admissible heuristic optimality artificial intelligence`、`Anytime Repairing A star Likhachev Gordon Thrun 2003`、`Cookie Monster payback period simulation CalculateGains`、`Chrome DevTools performance runtime long tasks JavaScript layout`。HTTP 200、每筆有10個結果，但結果明顯偏離查詢（例如航班、YouTube）；不採為研究證據。改直接取得下列一手來源。搜尋覆蓋因此有限，不能宣稱完成全面文獻調查。原始查詢與審查資料只留本機 `tmp/research-*`。

## 程式實際做法

| 項目 | 原始碼事實 | 含意 |
|---|---|---|
| 預設 | `defaultConfig.strategyAlgorithm = "beam"`，topK 9、width 5、depth 3 | 正式預設原本就不是 A*；候選另保留最便宜與最高 acceleration，最多可能11項 |
| 目標 | `evaluateCandidateUtility` 混合短／長 horizon 的估算 CPS 收益，扣等待及 gain×wait 懲罰；路徑按 0.7^depth 折扣 | 是自訂收益排序，並非到指定財富目標的最短時間問題 |
| 狀態 | `SearchPath` 僅 cookies、cps、elapsedSec、visited、score | 不是完整遊戲購買狀態；不含新建築數量、升級解鎖、協同倍率等 |
| 轉移 | 固定候選 `getPrice()`；gain 取 `SingleCps`、acceleration×wait、acceleration×BestWaitTime 最大值；同 token 不重買 | 搜尋結果最佳也只代表此近似模型；不能代表真實遊戲全域最優 |
| beam | `runBeamSearchCore` 每層只留 width 條，達 deadline 回傳 null，由策略層 fallback | 計算量可控，會剪掉後來可能較好的路徑 |
| astar | `runAStarSearchCore` 用 max heap 取最大 g+h；maxExpand、openLimit、depthLimit、deadline；中途更新首選分數 | 屬 bounded best-first；沒有明確 goal 與最優終止證明；截斷亦會丟候選 |
| heuristic | `estimateAStarHeuristic` 只取初始排序中兩個未訪問正 utility，加折扣再乘設定權重 | 未證明為剩餘收益 upper bound；未涵蓋後續因等待／CPS改變而提升的 utility；不能套用 A* 保證 |
| 去重 | stateKey 用有序 visited 字串加 elapsed 兩秒分桶 | 不會把不同順序的等價狀態合併；也不是完整遊戲狀態的等價證明 |
| 增量 | `getStrategyStateSignature` 只含 cookies bucket 與前四候選 token；`sanitizeFrontier` 保留舊數值 | engine 另有 buff／bulk 與週期保護，但不足以證明任意模組、價格或所有候選變更均失效；跨tick重用須另驗品質 |

另須注意比較公平性：beam 最後以 frontier 路徑更新分數；best-first 可在不同深度更新首選，兩者不一定是在比較相同終端目標。`assignBaselineStrategyScores` 又把 acceleration 作初始下限；oracle 必須明確採用同一計分／深度／候選集，不能只比較函式標籤。

## 方案比較

| 方案 | 適用用途 | 限制與採用條件 |
|---|---|---|
| 現有 beam | 預設即時近似推薦 | 保留；測量完整更新耗時及同輸入品質，不因理論先擴 width |
| 現有 bounded best-first | 實驗不同展開次序、較早取得部分候選分數 | 與 beam 同模型、同預算比較；不能稱最優 A*；需比較截止時實際推薦 |
| 真正 A*／ARA* | 已定義目標、成本及可證明 heuristic 的規劃問題 | 目前 reward／狀態／剪枝不符直接套用條件。ARA* 有品質界限依賴其演算法假設，不是加一個 weight 即可取得 |
| 小深度完整枚舉 | 測試 oracle，量化剪枝損失 | 9候選深度3有9×8×7=504條完整序列（未含較短前綴）；最多11候選時990條。可在離線fixture窮舉，不能推論正式執行一定便宜 |
| DP／狀態合併 | 已證明兩條路徑後續行為等價時重用 | cookies／時間連續、動態buff、購買順序、解鎖與mod效果造成狀態膨脹；量化分桶是額外近似，須驗誤差 |
| 規則預索引／預編譯 | 已知版本的升級分類、倍率依賴、候選結構 | 必須版本／函式／hook guard、動態值即時讀取；整體量測有收益才啟用 |

## 預編譯的安全邊界

官方 JS 的 `Game.CalculateGains`、`Game.GetTieredCpsMult` 與建築價格程式顯示：固定版本可提供規則結構，但建築 amount/free、升級 bought、倍率、buff、bank 與外部 hook 都是執行期輸入。Cookie Monster 的 `CacheBuildingsPP` 同樣從即時價格、cookies、cookiesPs 與模擬 bonus 算回本期；其快取不等於離線固定答案，也不是本專案多步搜尋的品質 oracle。

可優先研究單次更新內共用的穩定資料、已知規則的依賴表；若要跨tick快取，先定義完整失效契約。不能只靠遊戲版本字串：其他模組可以改寫函式、閉包或衍生值。guard 本身亦有成本。本輪既有 tier index 候選即使公式對照一致，完整更新較慢，已拒採；這支持用實測決策，不能證明所有預編譯都無效。

## 最小後續實驗

1. 建立固定候選、固定 horizon、無 smoothing／增量重用的小fixture。完整枚舉深度1至3，分別計算每個首購 token 的最大同一目標值；先驗證兩種搜尋在無截斷時的語意差異。此 oracle 只證明近似模型內的品質。
2. 另在隔離遊戲以真實購買模擬驗證首購排序、CPS delta／等待與收益誤差，涵蓋連買、協同、buff到期、bank、價格變化、mod hook。固定允許誤差與平手規則，再測速度。不能用「與原版相等」單獨證明原版推薦正確。
3. 同快照、同mod版本／順序／設定、暖機15秒、量測60秒、三次、隨機順序。比較 strategy耗時、完整update p50/p95/p99/max、frame interval／最長阻塞、展開數／fallback率、首選與top-k一致率、oracle regret。配置或狀態漂移即標不可直接比較。
4. 先採推薦品質不退步且完整更新有穩定收益的最小候選；否則保留beam。未識別版本／規則／mod效果立即fallback。此研究不要求先重寫搜尋或增加新依賴。

## 信心與限制

已新增可重跑的離線實驗：`node scripts/perf/search-oracle.mjs`。使用既有esbuild載入實際搜尋函式，8組fixture涵蓋bank 0／25、cookies 0／100、深度2／3，5項固定價格候選。每組完整枚舉20或60個終端序列；assert核對無剪枝beam的terminal分數、無截斷best-first的any-prefix分數。2026-11-07執行exit0，所有核對通過。width5 beam在8組首選皆符合terminal oracle；其中2組各有一個次要候選分數不同。這只驗證目前純量近似模型；未涵蓋真實價格變動、buff、協同或mod hook。單次微小計時不作速度排名。正式預設不變。

- 高：目前 `astar` 不具一般 A* 最優性保證；由明確控制流程及heuristic／剪枝條件核對。
- 高：遊戲版本固定不足以固定即時數值；官方來源與本專案模擬流程均直接證明。
- 中：beam 是目前較保守的預設選擇，理由是既有相容性及缺乏優勝證據，並非已證明效能／品質最佳。
- 未確定：最終最佳搜尋、可安全跨tick重用的完整狀態、預編譯淨收益。需要上述oracle及公平live比較。
- 網頁版官方JS可能與Steam實際版本不同；只用以驗證動態規則存在，實作guard須核對實際遊戲函式。
- 本報告沒有新增或重跑正式live效能比較；現有觀測不能外推FPS改善。

## 一手來源

1. Poole、Mackworth，*Artificial Intelligence: Foundations of Computational Agents*, 3e，3.6：https://artint.info/3e/html/ArtInt3e.Ch3.S6.html 。作者教材，直接說明admissible heuristic及A*最優條件；高可信。
2. Likhachev、Gordon、Thrun，2003，*ARA*: Anytime A* with Provable Bounds on Sub-Optimality*：https://proceedings.neurips.cc/paper/2003/hash/ee8fe9093fbbb687bef15a38facc44d2-Abstract.html 。原論文摘要，說明可調品質界限與重用；高可信，但未用摘要推導本專案保證。
3. CookieMonsterTeam，`src/Cache/PP/Building.js`、`PP.js`：https://github.com/CookieMonsterTeam/CookieMonster/tree/ac7f630a8e7dd3c10db9f1f89426a43c191a3013/src/Cache/PP 。2026-11-07直接取得原始碼；可驗其回本公式與快取用途，無同環境效能保證。
4. Orteil 官方 Cookie Clicker `main.js`：https://orteil.dashnet.org/cookieclicker/main.js 。2026-11-07取得；`CalculateGains`、`GetTieredCpsMult`、`priceIncrease`／getPrice；規則一手來源，Steam版本差異如上。
5. Chrome DevTools Performance reference：https://developer.chrome.com/docs/devtools/performance/reference 。官方量測方法參考；載入CWV不能取代遊戲持續更新的runtime／frame觀測。

## 相近演算法選型補充（2026-11-07）

### 建議

正式暫留Beam；下一個值得比較的候選是「逐首購候選的截斷rollout」，而非改成另一種A*。每個首購候選都建立同一起點的分支，後續用相同貪婪規則模擬少量步驟，以同一時間horizon的終值比較；每次實際只買第一步，下一輪按最新狀態重規劃。這是receding-horizon使用方式，不是另一個搜尋演算法。可搭配每個首購各保留少量路徑的分組Beam，但分組Beam是本專案候選設計，不能冒稱文獻已證明勝出。

原因：目前全域beamWidth=5可能在第一層就刪除9至11個候選中的部分首購，最終只為仍存活的firstToken寫入路徑分數。逐首購rollout能讓所有被選入的首購接受相同深度與評分，比較更直接。這不保證較好：相同總預算下可分給每個分支的探索更少，候選池之外的行動依然會遺漏。

|方法|適合程度|判定|
|---|---|---|
|現有Beam|高，立即保留|已有品質/成本基準；先別因演算法名稱換掉|
|逐首購截斷rollout＋每次只執行第一步|最高優先實驗|確定性短視野、能共用amount overlay；須驗模型與終值，無本遊戲實測勝出證據|
|每個首購分組Beam|次優先實驗|避免單一首購壟斷全域beam；可能增加節點，須固定總預算比較|
|小深度完整枚舉|品質oracle優先|11候選深3有990葉、1111非根節點；模型便宜時亦可試線上，但不能先假設滿足延遲|
|Limited Discrepancy Search|備選|當貪婪排序通常好、少數轉折錯誤時補探索；目前尚未證明此分布|
|Beam-stack|暫不採|回溯可逐步改善，但遊戲狀態持續變動；被中止或剪裁後不能沿用原文完整性/最優保證|
|MCTS／UCT|暫不採|可處理較大/隨機決策，但rollout採樣成本與變異需預算；目前短深度、低延遲無勝出證據|
|D* Lite／LPA*|不直接套用|用於變動圖上的增量最短路徑；本案連續cookies/時間、自訂reward、升級解鎖不符直接套用前提|
|DP/Pareto支配剪枝|模型完整後再研究|同候選集合之外還需相同完整ownership、時間/事件與未來轉移，才能安全合併；cookies/CPS較高不自動保證支配|

### 最大限制：狀態模型比搜尋名稱重要

目前SearchPath只有cookies/cps/elapsed/visited，後續價格與gain仍由固定候選估計，且visited禁止同token重買。它沒有完整多步升級解鎖、價格變化與協同狀態。增量純模型目前加速的是單項BestCpsAcceleration試算，尚未接成多步搜尋轉移；不能因為已有fork就宣稱rollout已準備完成。任何搜尋在錯誤轉移上找最優，也不是遊戲最佳購買。

Rollout文獻的policy improvement條件不能直接套用截斷近似終值、候選剪枝及deadline版本。Beam-stack的完整性也依原文問題及足夠搜索條件；D* Lite的增量是搜尋圖更新，不等同本案依賴圖partial recalc。這些區別有高可信來源支援；「rollout最值得本專案試」是中等信心的工程判斷，不是已證明品質優於Beam。

### 驗收設計

保持相同候選、收益目標、horizon、起點、完整轉移及節點/時間預算。先用完整枚舉求小案例真值，分別測首購regret、相同深度終值差、未評估首購數、deadline時是否有可用完整答案，再測更新p95/max、longtask/frame與真實購買進度。先比較Beam、逐首購rollout、分組Beam三者；不加入WASM或新依賴。

本次重跑scripts/perf/search-oracle.mjs exit0，8個既有小fixture：Beam首選都與該近似模型枚舉相同，但2例其他候選分數不同；不能證明新方法必要或真實遊戲最優。研究未修改搜尋設定、未操作遊戲。

### 檢索與來源

沒有專用WebSearch工具，使用公開學術搜尋API加直接一手來源取得；共6個查詢（Crossref4、OpenAlex2，另補OpenAlex beam-stack），共檢視成功結果前三項。Crossref2筆429、其餘部分結果不相關；不採用不相關搜尋。原先猜測IJCAI PDF為視覺論文，核對標題後排除，從正式索引找到正確0080.pdf。資料留tmp/algorithm-alternatives，未提交原始PDF。

- Bertsekas, *Rollout, Policy Iteration, and Distributed Reinforcement Learning*，作者MIT公開書稿，第1章截斷rollout與policy improvement（pp.37–38）：https://web.mit.edu/dimitrib/www/Rollout_Complete%20Book.pdf 。已直接取得並讀取；高可信。
- Zhou & Hansen, 2005, *Beam-Stack Search: Integrating Backtracking with Beam Search*：https://cdn.aaai.org/ICAPS/2005/ICAPS05-010.pdf 。已讀原論文摘要與導論；高可信，並非本案品質實驗。
- Harvey & Ginsberg, 1995, *Limited Discrepancy Search*：https://www.ijcai.org/proceedings/1995/0080.pdf 。原論文；從IJCAI索引確認作者與標題，高可信。
- Browne et al., 2012, *A Survey of Monte Carlo Tree Search Methods*：https://repository.essex.ac.uk/4117/1/MCTS-Survey.pdf 。IEEE期刊綜述公開稿；高可信，未推定本案MCTS一定較慢。
- Koenig & Likhachev, 2002, *D* Lite*：https://cdn.aaai.org/AAAI/2002/AAAI02-072.pdf 。原論文摘要/導論；高可信。

結論：固定正式演算法時仍選Beam；若要做下一輪品質改進，優先驗「逐首購截斷rollout」，再決定是否替換，不建議現在全部換掉。
