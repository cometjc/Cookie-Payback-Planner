---
name: 拆分主檔為TS模組
overview: 將 `main.js` 依功能拆分為多個 TypeScript 檔案，使用 esbuild 打包輸出根目錄 `main.js`，保留 Cookie Clicker mod 相容性。
todos:
  - id: map-sections
    content: 分析 main.js 功能區塊並拆分模組
    status: completed
  - id: create-modules
    content: 建立 TS 模組與 index 入口
    status: completed
  - id: build-setup
    content: 設定 esbuild/tsconfig 打包與檢查
    status: completed
  - id: verify-output
    content: 驗證打包輸出與相容性
    status: completed
---

# 拆分主檔為TS模組

## 目標

- 以功能為單位拆分，建立清晰模組邊界，保留既有行為。
- 入口改為 `src/index.ts`，用 esbuild 打包輸出根目錄 `main.js`。

## 依據與關鍵檔案

- 目前核心邏輯集中在 `main.js`；將拆分後的模組放在 `src/`，入口為 `src/index.ts`。
- 參考與維持 mod metadata：`info.txt`。
- 既有 JS 型別檢查配置：`tsconfig.json`（將調整為 TS 輸入/輸出設定）。

## 拆分策略（功能導向）

- 建議模組（名稱可微調）：
- `src/core/`：mod 註冊、初始化、全域狀態
- `src/ui/`：界面與顯示更新
- `src/calc/`：成本/回收期/數值計算
- `src/data/`：設定、常數、類型定義
- `src/events/`：Game hooks、事件綁定
- `src/index.ts` 負責組裝與啟動（對應原 `Game.registerMod` 與初始化流程）。

## 建置與輸出

- 新增/更新 esbuild 腳本（以 `src/index.ts` 為入口），輸出為根目錄 `main.js`。
- 調整 `tsconfig.json`：啟用 `strict`/`noEmit` 以供型別檢查，實際輸出由 esbuild 處理。

## 相容性與驗證

- 確保 `main.js` 的輸出仍為 mod loader 可用格式。
- 執行 `tsc --noEmit`（若可用）與 esbuild 打包，確認無錯。

## 檔案變更摘要

- 新增：`src/index.ts` 與各功能模組檔案。
- 更新：`tsconfig.json`、`package.json`（新增 build script）、`main.js`（由打包產物覆蓋）。

## 待辦事項

- 將 `main.js` 依功能切塊、映射到模組。
- 建立 `src/index.ts` 並串接模組啟動流程。
- 設定 esbuild 打包輸出與 TS 檢查流程。
- 驗證功能與輸出相容性。