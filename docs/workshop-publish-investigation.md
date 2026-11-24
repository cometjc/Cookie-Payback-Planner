# Steam 工坊縮圖分享失敗調查

日期：2026-11-24。範圍：Cookie Clicker 2.053、Greenworks 0.14.0、既有工坊項目2689045003、2053.01發布。

## 結論

已確認失敗點是Steam Cloud對`thumbnail.png`的FileShare，不是模組建置或本機找不到圖片。遊戲的發布流程把縮圖分享當成必要步驟；它失敗後根本不會執行工坊內容更新。Greenworks又把所有非成功結果轉成同一字串，遊戲介面因而只顯示泛用錯誤。

尚未證實Steam為何無法取得該縮圖的共享handle。不能將目前證據寫成「配額不足」「縮圖檔案損毀」或「Steam伺服器已確認有bug」。可驗證的修正方向是：用低階更新API只更新已共享的ZIP，保留既有預覽圖；目前沒有實際成功發布證據。

## 研究問題與證據

| 問題 | 證據與判定 | 信心 |
|---|---|---|
| 哪一步失敗？ | 2026-11-23日誌先有ZIP的FileShare OK，接著thumbnail.png Upload OK，最後FileShare File Not Found。兩次遊戲callback均failed。 | 高 |
| 本機圖片不存在或超過遊戲限制？ | CI解包與版本庫圖片皆595832 bytes、SHA1相同，低於遊戲的1MiB限制。這兩項假說不符證據。 | 高 |
| 是否有執行工坊更新？ | 本機greenworks.js僅於ZIP與圖片分享皆成功後呼叫updatePublishedWorkshopFile；失敗時未到此步。公開工坊更新時間亦未變。 | 高 |
| 為何只得到泛用字串？ | 與本機package metadata相符的上游commit中，FileShareWorker把所有非OK的m_eResult轉成`Error on sharing file on Steam cloud.`，沒有保留實際enum。 | 高 |
| 刪掉縮圖就能修好？ | 本版ugcPublishUpdate仍把空image_name放進saveFilesToCloud；FilesSaveWorker會嘗試讀每個路徑。空路徑可能先報`Error on reading files.`，不能直接套用此做法。 | 高（程式路徑）；未live驗證 |
| 能否保留既有預覽圖？ | 低階updatePublishedWorkshopFile文件說空image_path代表不更新；同commit的C++也僅在image_name非空時呼叫UpdatePublishedFilePreviewFile。 | 高（API契約）；未live驗證 |
| Cloud設定或配額是否正常？ | 舊遊戲回報帳號Cloud=true、使用量約1.25MB，但這不是剩餘配額，也沒有證明每遊戲Cloud設定。當前離線cache沒有thumbnail索引、local remote目錄卻有同一PNG，只能作為後續查核線索。 | 未確認 |

## 最小處理路徑

使用既有Steam登入及同一工坊ID，在可呼叫原生SDK的發布工具中分開執行：

1. 僅將已核對內容的ZIP存入Steam Cloud。
2. FileShare該ZIP，要求明確成功。
3. 呼叫低階`updatePublishedWorkshopFile(itemId, zipPath, "", "", "", success, error)`，保留原縮圖、名稱及描述。
4. 等待成功callback，再核對工坊更新時間及內容。失敗或結果不明時，保存該次操作，不盲目重送。

這不是將高階ugcPublishUpdate的圖片參數改空字串。Cookie Clicker目前的發布IPC沒有「保留預覽圖」參數，仍會進入同一高階包裝。要落地需使用可直接呼叫低階SDK的工具或由遊戲端提供該選項；本調查沒有修改遊戲或Greenworks核心檔案。

## 驗證與限制

`tmp/workshop-research/check-publish-flow.mjs`載入實際本機Greenworks JS，以mock native邊界驗證：縮圖分享失敗會阻止commit；高階空圖會先失敗；低階空預覽圖的呼叫參數可保留既有欄位。另斷言釘選C++的條件式預覽圖更新存在。Node assert exit0，結果為`tmp/workshop-research/publish-flow-check.json`。此測試不連線Steam，不是發布成功或後端根因證明。

原生Cloud狀態probe未取得live結果：遊戲主程序存在時CDP未就緒，控制器沒有重複啟動；逾時後只正常關閉該次owned程序。保留`tmp/workshop-research/probe-steam-cloud.mjs`與先前存檔備份，未還原或重設正式存檔，未重送工坊發布。不能據此宣稱配額或每遊戲Cloud設定正常。

原始資料與查詢摘要留ignored `tmp/workshop-research/`；先前上傳回覆及遮蔽後日誌在`tmp/release-2053-01/`。未提交存檔、帳號、憑證、完整Steam日誌或原始網頁。

## 來源與檢索

主要來源：

- [Valve ISteamRemoteStorage官方文件](https://partner.steamgames.com/doc/api/ISteamRemoteStorage#FileShare)：FileShare／RemoteStorageFileShareResult_t及FileWrite的不同責任。官方API契約，可信度高，但未解釋此帳號的個別失敗。
- [Greenworks釘選C++發布實作](https://github.com/greenheartgames/greenworks/blob/4fbf54accf4bde777e6f3b80e1ecfb86683b1568/src/greenworks_workshop_workers.cc)：FileShareWorker的泛用錯誤、低階更新的非空預覽圖條件。與本機package的resolved commit相同；未獨立驗證已編譯native binary是否完全等同此source。
- [同commit的Cloud讀寫實作](https://github.com/greenheartgames/greenworks/blob/4fbf54accf4bde777e6f3b80e1ecfb86683b1568/src/greenworks_async_workers.cc)：FilesSaveWorker無條件讀取傳入路徑，可解釋高階空圖的另一條失敗路徑。
- [同commit的Workshop文件](https://github.com/greenheartgames/greenworks/blob/4fbf54accf4bde777e6f3b80e1ecfb86683b1568/docs/workshop.md)：低階更新的空字串代表不更新該欄位。
- [Steamworks.NET issue584](https://github.com/rlabrecque/Steamworks.NET/issues/584)：2023-11-17有「檔案存在仍FileShare FileNotFound」案例，頁面沒有已驗修正；僅支持這類錯誤不能等同本機缺檔，不能移植為本案根因。

Firecrawl developer／search執行7組查詢，每組檢視最多前三個結果的URL與摘錄，再讀取上述相關一手來源。查詢包括精確錯誤、thumbnail共享、Steam FileShare回傳、Cookie Clicker相似問題、空圖片更新及後續兩組驗證；詳見`tmp/workshop-research/search-ledger.json`。無關的SMB、其他遊戲工具、重複鏡像不作證據。

Cookie Clicker Reddit相似帖僅取得搜尋摘錄：Firecrawl不支援該站，公開JSON另回403，本機也沒有cf CLI，故沒有採用未讀到的留言作為修正依據。調查可定位失敗階段與API流程缺口，尚不能區分Steam client cache與server端資料／權限狀態。
