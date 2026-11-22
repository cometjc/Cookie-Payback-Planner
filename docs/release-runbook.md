# 發布流程

目前發布：`2053.01`；遊戲支援：`2.053`；工坊項目：`2689045003`。

## 準備

1. 核對分支、工作樹、未提交修改與遠端 tags。未推送的同題 MVC 收斂後，保存 recovery tag、SHA 映射及 tree 相等證據。不要 push 私有 recovery tags。
2. 在隔離工作樹更新 `RELEASE.md`、`CHANGELOG.md`、`info.txt` 的 ModVersion／日期，以及 `src/core/predictor.ts` 的 runtime version。Tag 與 ModVersion 必須相同；遊戲版本獨立核對。
3. 使用 Node 22、Yarn 1.22.22 與既有 `yarn.lock`：

```powershell
yarn install --frozen-lockfile
.\scripts\dev.ps1 check
.\scripts\dev.ps1 build
git diff --check
```

`check` 包含型別、lint、來源與工具測試。檢查包裝清單只含 main.js、info.txt、thumbnail.png、CHANGELOG.md 及版本標記；不得包含 `.env`、存檔、診斷或原始採樣。效能邏輯改動須另依固定快照與共存模組流程驗收。

## GitHub

提交已驗內容，以 fast-forward 整合至 main。確認遠端尚無目標 tag，再明確推送 main 與該 tag：

```powershell
git tag -a 2053.01 -m "Cookie Payback Planner 2053.01"
git push --atomic origin main refs/tags/2053.01
```

版本字串依本次發布替換；不要重打已公開 tag，也不要使用 `--tags` 或 force push。GitHub `Releases` workflow 驗證版本、測試、建置、打包並建立 Release。核對該 tag 的 workflow SHA、所有 jobs 結果、Release ZIP 的檔案清單及 main.js／info.txt hash。CI 失敗先修正原因，保留失敗 run，不把本機測試當作遠端 CI 成功。

## Steam 工坊

1. 核對正式遊戲主程序與 CDP；已有主程序不得重開。只對本次 owned PID／建立時間相符的程序自動關閉。正式存檔與模組設定受保護。
2. 從已驗 Release ZIP 取出模組檔至獨立上傳目錄。核對 ID=`BestDealHelper`、Workshop=`2689045003`、ModVersion 與 tag 相同；main.js／info.txt hash 必須等於 Release。先備份正式模組，再更新所需本機檔案；不要直接執行使用不明 DEPLOY_MOD_PATH 的部署。
3. 在正式遊戲開啟「管理模組 → 發布模組 → 更新已發布模組」，選擇工坊 `2689045003`、上述上傳目錄，提交更新。可透過該視窗使用的原生 Steam IPC 執行相同流程：先 `get published mods` 核對擁有項目，再 `select mod` 核對目錄，最後 `publish mod` 明確指定 update=`2689045003`。授權只更新此項目，不建立重複項目。此版遊戲的更新視窗沒有 changelog 欄位，不能把 Release 說明誤稱為已同步至工坊。
4. 等待遊戲回報發布完成；核對工坊更新時間。若另有編輯工坊changelog，獨立記錄其結果。保存實際發布回覆、內容 hash、tag／CI／工坊連結於本機 ignored `tmp/`。沒有成功回覆或無法核對時，保留續接點，不宣稱發布成功。

## 收尾

刪除前先確認分支已合併、沒有唯一工作；保留未合併備份。含 ignored 量測資料的工作樹先保全資料，可保留為 detached checkout。發布完成後核對 main／tag／Release／工坊版本，回報實際檢查結果及限制。

連結：[CI](https://github.com/cometjc/Cookie-Payback-Planner/actions/workflows/release.yml)、[Release](https://github.com/cometjc/Cookie-Payback-Planner/releases/tag/2053.01)、[工坊](https://steamcommunity.com/sharedfiles/filedetails/?id=2689045003)。
