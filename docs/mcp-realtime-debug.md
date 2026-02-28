# MCP 即時偵測整合手冊

本文件定義 Cookie Clicker 專案的 MCP-ready 偵錯流程，目標是讓開發者只需設定一段 MCP 配置，即可用自然語言請代理執行即時追蹤與分析。

## 快速啟用

1. 啟動遊戲與 CDP 探測入口：
   - `npm run inspect:mcp`
2. 確認輸出有 `MCP session metadata` 與 target 的 `webSocketDebuggerUrl`
3. 在支援 MCP 的客戶端（例如 Cursor、Gemini CLI）使用自然語言下達追蹤任務

## MCP 客戶端設定

### 通用設定（npx 最新版）

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

### Cursor（專案內）

本專案已內建 [`.cursor/mcp.json`](../.cursor/mcp.json)，可直接使用，不需要再手動貼設定。

### Gemini CLI（示意）

將上方 `mcpServers.chrome-devtools` 配置加入 Gemini CLI 的 MCP 設定檔即可。

## 自然語言提示詞模板

- `請連線目前 Cookie Clicker target，列出最近 30 秒 console 錯誤，標記是否來自 mod 腳本並給修正建議。`
- `請執行一次效能追蹤，找出最耗時的 JavaScript 函式，輸出前三名與優化方向。`
- `請模擬一次購買流程，分析 network 與 runtime 錯誤，回傳可重現步驟與可能 root cause。`

## 端到端驗收流程（啟動、附加、追蹤、輸出）

1. 啟動：
   - 執行 `npm run inspect:mcp`
   - 驗證出現 `MCP inspect entry ready`
2. 附加：
   - 於 MCP 客戶端送出「連線目前 target」相關提示詞
   - 驗證代理能看到 `Cookie Clicker` target
3. 追蹤：
   - 送出 console/network/performance 任一追蹤提示詞
   - 驗證代理成功取得資料（錯誤列表、請求列表或 trace 摘要）
4. 輸出：
   - 驗證代理回傳分析結論、可能 root cause、重現步驟與修復建議

## 故障排除

- 連不到 `9222`：
  - 先跑 `npm run inspect:auto` 或 `npm run inspect:mcp`
  - 確認沒有其他程式占用該 port
- 找不到 Cookie Clicker target：
  - 將遊戲視窗切到前景後重新執行 `npm run inspect:probe`
- MCP server 無法啟動：
  - 確認 Node.js 版本符合 `chrome-devtools-mcp` 要求
  - 重新載入 IDE / MCP 客戶端
- 需避免自動啟動遊戲：
  - 設定 `COOKIE_MCP_SKIP_LAUNCH=1` 後執行 `npm run inspect:mcp`
