# 教師專屬邀請測試報告

日期：2026-11-24（台灣時間）

版本：2026.11.24.3；以正式 main `f668a1cb19ce74d598ebb2403f636bea3f97eca3` 為基礎開發，分支 `teacher-invitation-login`。新增 Migration `0007_teacher_invitations.sql`，未對遠端 D1 套用。

## 結果

|檢查|結果|
|---|---|
|單元／本機 D1 整合測試|10 個檔案，142 項通過|
|瀏覽器驗收|69 個不同情境通過（完整回歸加上修正後針對性重跑）|
|TypeScript 前端及 Worker 型別檢查|通過|
|Cloudflare 正式模式建置|通過，僅建立 dist，未部署|
|辦公室及教師單檔 HTML 建置|通過|
|教師手機預覽|姓名／單位／確認／成功可操作，沒有頁面錯誤或水平溢出|
|行政預覽|產生／重開複製／輪替／撤銷／備用碼可操作|

使用真正的 Miniflare／workerd／D1 執行 Migration、HTTP、Cookie 及 SQL 交易。LINE OAuth、身分驗證、好友狀態及 Messaging API 全部為 Mock。測試身分、密碼、Token 及 pepper 為執行當次的隨機虛構資料。

新增 19 項後端測試，涵蓋：

- 管理員、工讀生、Session、CSRF 及公開端 Origin／方法限制。
- 長效邀請反覆複製、資料庫雜湊、舊邀請、連結預覽不消耗。
- PKCE、nonce、state、HttpOnly／SameSite Cookie、錯誤瀏覽器與回呼重播。
- LINE ID token 的 nonce、audience、issuer、到期與 sub 欄位異常。
- 未確認前不綁定、好友檢查、已是好友無須 follow、重複確認只記一筆成功。
- 同邀請兩個 LINE、同 LINE 兩位老師的並行競爭。
- 撤銷、輪替、停用再啟用、解除後重綁、短效授權逾期、速率限制。
- LINE 上游失敗不建立對應，兩種綁定方式任一成功會使另一方式失效。

新增 4 個瀏覽器情境，涵蓋行政邀請管理、教師手機預覽、工讀生權限及 Cloudflare 模式完整 OAuth→好友檢查→姓名確認→D1 綁定→重整成功結果。既有真實 Cookie 登入、Webhook→D1→三秒輪詢、通知及聊天回歸通過。

## 測試環境修正及限制

首次測試誤用了工作區既有的 5173 舊預覽服務，已增加 `PLAYWRIGHT_PORT` 選項，以獨立 5183 埠執行本次完整回歸。完整回歸先有 67／69 通過：一個情境受開發時 Vite 更新重載干擾；另一個是 Playwright 模擬外站 302 跳轉未攔截到回呼，改由 Mock 授權頁導回，以確保請求經過本機 Worker。修正後針對 Cloudflare 兩個檔案重跑，10／10 通過，合計 69 個不同瀏覽器情境均通過。最後建置及型別檢查通過。

受管理的 Chromium 禁止 `file://`，離線 HTML 使用相同文件內容攔截載入驗證，沒有變更瀏覽器安全政策。不能將此結果宣稱為真實 LINE 手機跳轉已驗證。

仍須設定真實的 LINE Login Channel、相同 Provider／Linked OA、Callback URL 及 Cloudflare Secret，再使用核准的測試身分驗證手機 LINE 及瀏覽器往返。正式部署及真實 LINE 發送均未執行。

## 在 Windows 重跑

先位於本版專案根目錄：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
$env:PLAYWRIGHT_PORT = "5183"
npm.cmd run test:e2e -- --workers=2
Remove-Item Env:PLAYWRIGHT_PORT
npm.cmd run build:cloudflare
npm.cmd run build:html-preview
```

Linux 本開發環境使用 `/usr/bin/chromium`；Windows 使用上方安裝的 Playwright Chromium。若需指定其他瀏覽器，可將 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 設為實際執行檔路徑；一般網站使用及建置不受此設定影響。

部署與 Migration 的正確順序請看 [設定與升級文件](TEACHER-INVITATIONS.md)。
