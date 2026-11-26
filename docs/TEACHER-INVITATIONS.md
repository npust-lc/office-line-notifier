# 教師專屬邀請：操作、設定與升級

版本：2026.11.24.3。此更新先完成本機程式與 Mock 測試，**尚未部署正式網站，也尚未使用真實 LINE Login Channel 驗證**。原有 Messaging API／Webhook 及已綁定教師資料保留。

## 行政與教師怎麼使用

1. 管理員登入，前往「教師名單」→ 指定教師的「管理綁定」。
2. 按「產生專屬邀請」，複製連結，透過可信管道私下交給指定老師。也可下載同一邀請的 QR Code。
3. 老師方便時點開連結，按「使用 LINE 繼續」，完成 LINE 登入／授權。
4. 回到邀請頁，確認教師姓名及單位正確，按「確認綁定○○老師」。不是自己的資料時，關閉頁面並聯絡辦公室。
5. 若尚未加入或封鎖官方帳號，依頁面開啟官方帳號並加入／解除封鎖，再返回原網頁確認。已是好友的人不必重新加入。
6. 後端檢查好友狀態、實際 Messaging API 身分及一對一對應後，顯示綁定成功。行政網頁依原有輪詢更新為已綁定。此動作不主動發送 LINE 通知。

老師以後直接在原本 LINE 聊天室收發文字，不必登入辦公室網頁，也不用再次綁定。LINE 授權畫面及手機跳轉步驟由 LINE 決定，不能保證一次點擊完成。

## 邀請與備用碼的差異

|項目|專屬邀請|其他綁定方式：一次性綁定碼|
|---|---|---|
|教師操作|LINE 授權後確認姓名|在聊天室傳送綁定碼|
|效期|直到成功、撤銷或教師停用|預設七天|
|再次複製|管理員重新開啟視窗可複製同一連結|僅產生當次顯示；關閉後須重發|
|重新產生|舊邀請及其未完成授權立即失效|舊綁定碼立即失效|

兩種方式可同時存在；任一方式完成後，另一方式不能再綁定。解除綁定、教師停用再啟用，都不會讓舊邀請復活。換 LINE 帳號須先由管理員核實本人、解除綁定，再發新邀請。

長效的是**辦公室邀請**，不是 LINE OAuth 授權碼。開始授權後，本系統短效流程為 15 分鐘；LINE 自己的授權碼有其十分鐘、一次性的限制。逾時請老師重新點原邀請，不需行政補發。關閉瀏覽器、換裝置、Cookie 被阻擋或跨瀏覽器開啟回呼，也可能需要從原邀請重來。

專屬連結屬於持有即可申請的私密邀請，不能公開貼在教師名單或群組。LINE 授權證明 LINE 身分，確認姓名有助避免拿錯連結，**兩者不會獨立證明這個人是指定教師**；仍以行政可信的私下交付為身分核實基礎。若誤傳請立即撤銷。公開加入好友連結／follow 事件本身不會建立教師對應。

## LINE Developers 設定

網站：https://developers.line.biz/console/

1. 開啟目前 Messaging API Channel 所屬的 **Provider**，在同一 Provider 建立 **LINE Login Channel**，Application type 選擇包含 Web app。
2. 在 LINE Login → Basic settings → **Linked LINE Official Account**，連結目前辦公室官方帳號。需有相關管理權限。
3. 在 LINE Login → LINE Login settings → Callback URL 設定：

   ```text
   https://office-line-notifier.pages.dev/api/binding/callback
   ```

   若正式網址不同，使用 `ALLOWED_ORIGIN` 的實際網址加上 `/api/binding/callback`；包含協定及路徑必須完全一致，不加最後斜線。OAuth 回呼與原有 `/api/line/webhook` 不同，**不要改掉原 Webhook URL**。
4. 取得這個 **LINE Login Channel** 的 Channel ID、Channel secret。它與 Messaging API Channel 的 Secret 不同，勿互相覆蓋。
5. Developing 模式只允許指定管理員／測試者登入。先使用核准的測試帳號驗證；對實際老師開放前，需要將 Login Channel 發布，並完成 LINE 要求的應用程式及隱私權資訊。
6. 在 Cloudflare Pages 專案 → Settings → Variables and Secrets → Production 加入：

   |名稱|設定方式|
   |---|---|
   |`LINE_LOGIN_CHANNEL_ID`|LINE Login Channel ID，可設一般變數|
   |`LINE_LOGIN_CHANNEL_SECRET`|LINE Login Channel secret，必須設為加密 Secret|

   保留現有 `LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`、`AUTH_PEPPER`、`BINDING_PEPPER`、`DB` 與正式網址設定。兩個 Channel 必須同一 Provider；跨 Provider 的 User ID 不相同。Linked OA 也必須是辦公室實際使用的官方帳號。

未完成 Login 設定時，行政綁定視窗會提示並仍提供備用綁定碼，不影響原本老師接收通知。

## 升級順序（Windows PowerShell）

目前正式資料庫已套用 0006；此版**新增 0007**。不要先部署依賴新表的程式。以下指令在下載的新版本專案根目錄執行，該位置應有 `package.json`、`wrangler.jsonc`、`migrations`。

先載入 Node 環境，之後才執行其他指令：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
Get-Location
Test-Path .\wrangler.jsonc
npm.cmd ci
npm.cmd test
npm.cmd run build:cloudflare
```

`Test-Path` 必須為 True；若為 False，先 `Set-Location` 到實際專案資料夾，不要在 `C:\Users\admin` 直接執行。先做本機 Migration／測試，不會改正式資料庫：

```powershell
npx.cmd wrangler d1 migrations apply office-line-notifier --local
```

準備升級時，先備份正式 D1，再檢查待套用項目：

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
npx.cmd wrangler d1 export office-line-notifier --remote --output ".local\before-0007-$(Get-Date -Format yyyyMMdd-HHmmss).sql"
npx.cmd wrangler d1 migrations list office-line-notifier --remote
```

核對只有預期的待套用 Migration 後，再執行：

```powershell
npx.cmd wrangler d1 migrations apply office-line-notifier --remote
```

設定 LINE Login／Cloudflare 變數及 Secret 後，**另取得正式部署確認，再合併 main／部署**。本文件中的建置指令不會部署。不要上傳 `.local`、`.dev.vars` 或 SQL 備份。

本機開發的 Login 變數可填在專案根目錄 `.dev.vars`，參照 `.dev.vars.example`。若要實際手機授權測試，請使用隔離測試 D1 與 LINE 測試帳號、LINE 允許且能從手機連線的 HTTPS Callback 網址；不能直接用辦公室電腦的 localhost 當老師手機回呼。正式憑證不放進前端 `VITE_` 變數。

## 安全及資料維護

- 邀請為隨機識別搭配 HMAC 簽章，資料庫只保存整體邀請的 SHA-256；管理員經驗證後可由後端重建同一連結，無須保存明文 bearer token。
- 邀請放在 URL fragment（`#` 後），不送往靜態網頁伺服器，頁面讀取後立即從網址列移除；以同來源 JSON POST 傳給後端，不存 localStorage／Session Storage。勿在 Worker 記錄完整請求本文或 OAuth 回呼網址。
- GET／HEAD、掃描器及單純開啟邀請不會消耗邀請。只有驗證與確認成功後，D1 原子交易才消耗。
- OAuth 使用 state、nonce、PKCE S256、一次性回呼認領，以及獨立 HttpOnly／SameSite=Lax Cookie；正式環境另有 Secure／`__Host-` Cookie。與辦公室 Session 分開，教師端不啟動辦公室資料輪詢。
- 身分使用 LINE 後端 `/oauth2/v2.1/verify` 驗證結果；好友狀態使用 `/friendship/v1/status`，不採信前端 userId 或 `friendship_status_changed`。確認時也核對實際 Messaging API 能識別同一 userId。
- OAuth 的 user access token 僅供短效確認，以 AES-GCM 加密保存在獨立資料表；完成後立即清除。逾時資料在下一次綁定操作、辦公室資料輪詢或獨立 Worker 排程中刪除。Pages 本身不會執行 Worker cron，若完全無請求，不保證到秒清理，但程式始終拒絕過期流程。
- 每 IP 每十分鐘最多 120 次公開綁定請求；每邀請每十分鐘最多 30 次啟動；每授權流程最多 20 次確認。原有聊天室綁定碼限流保留。
- `binding_invitations`、`binding_oauth` 不加入網頁紀錄 ZIP 備份。完整 D1 SQL 備份仍可能含敏感授權資料，需加密及限制存取；隔離還原後先刪除全部 `binding_oauth`、`sessions`，撤銷未使用邀請再考慮對外開放。
- `BINDING_PEPPER` 也用於邀請簽章及授權資料加密。輪換會使未使用邀請與授權失效，另有原本訊息來源 HMAC 相依，不可任意更換。

官方文件：

- [Web Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
- [PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/)
- [連結官方帳號與好友狀態](https://developers.line.biz/en/docs/line-login/link-a-bot/)
- [LINE Login API](https://developers.line.biz/en/reference/line-login/)

## 驗收範圍

自動測試使用真正的本機 workerd／D1，LINE OAuth、好友檢查及 Messaging API HTTP 均為 Mock。包含長效邀請、撤銷／重發、身分驗證異常、Cookie/state/PKCE、重播、多人競爭、同 LINE 重複綁定、逾時、權限、備用碼，以及瀏覽器完整確認流程。真實手機的 LINE 授權、加入好友後返回瀏覽器，以及正式 Channel／Provider 設定仍需另外驗證。
