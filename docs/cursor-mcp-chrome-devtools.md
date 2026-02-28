# Cursor MCP 整合：chrome-devtools-mcp

本專案已提供專案級 MCP 設定檔：`.cursor/mcp.json`。

## 一次設定（專案內）

設定檔內容使用：
- `npx -y chrome-devtools-mcp@latest`
- `--browser-url=http://127.0.0.1:9222`

這代表 MCP 伺服器會直接連到你本機已開啟的 DevTools target（本專案為 Cookie Clicker 的 9222）。

## 使用流程

1. 啟動遊戲並開 remote debugging：
   - `npm run inspect:auto`
2. 在 Cursor 重新載入視窗（確保 MCP server 被載入）
3. 對代理下自然語言指令，例如：
   - `請連線目前瀏覽器 target，列出 console 錯誤並分析是否由 Cookie Payback Planner 造成。`
   - `請對目前頁面做效能追蹤，找出最耗時的 script 與可優化點。`
   - `請重現一次購買流程，觀察 network 與 runtime 錯誤並回報。`

## Gemini CLI / 其他 MCP 客戶端對應

若是 Gemini CLI，可套用同樣核心設定（server 名稱可自訂）：

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

## 常見問題

- `fetch failed` / 無法連 9222：
  - 先跑 `npm run inspect:auto`，確認輸出有 `Auto inspect success`
- 找不到 Cookie Clicker target：
  - 讓遊戲視窗停在主畫面，重新執行 `npm run inspect:probe`
- MCP 已設定但看不到工具：
  - 重新載入 Cursor 視窗或重開 IDE
