# 0007 未套用造成後台載入失敗：修復與相容保護

版本：2026.11.26.1。

## 本次已確認的原因

正式 D1 結構查詢只有原本的 `admins`、`pickup_items`、`system_meta`，缺少 `binding_invitations`、`binding_oauth`；重新取得正式 GitHub 版本的 SQL 後，遠端 Migration 清單仍列出 `0007_teacher_invitations.sql` 待套用。這證明 0007 當時尚未套用到這個遠端資料庫。使用者之後依備份、遠端套用順序執行，已回報 0007 成功，重新整理後後台內容已恢復。

舊程式在 `/api/data` 的清理批次直接執行 `DELETE FROM binding_oauth`，所以一張新表缺少就讓整個快照回傳 `DATABASE_SCHEMA_MISSING`。本機以真正的 D1 只套用 0001–0006，已重現相同 503，並新增回歸測試。

## 程式修正

- 過期授權清理先查表是否存在；缺少新表或相關欄位時，不阻斷既有後台資料載入。非結構類的資料庫錯誤仍回報，不假裝成功。
- 新邀請操作先檢查兩張新表的必要欄位及 `invalidate_teacher_invitation` 觸發器。不完整時不允許產生邀請或啟動授權，避免缺少一次性保護。
- 管理綁定視窗明確顯示 0007 未完成，並保留原有「其他綁定方式」。不將資料庫升級問題誤寫成 LINE Login Secret 未設定。
- 不自動建表，不改 Migration 管理紀錄，不降低 Session、CSRF 或管理員權限要求。
- 沒有新增 Migration，也不更動 Secrets、正式 D1 Binding 或 LINE 發送設定。

## 遠端資料庫修復步驟

在含 `wrangler.jsonc` 的正確專案根目錄開啟 PowerShell，先載入 Node：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
Test-Path .\wrangler.jsonc
Test-Path .\migrations\0007_teacher_invitations.sql
npx.cmd wrangler d1 migrations list office-line-notifier --remote
```

前兩個路徑必須存在。若本機缺少 0007，下載／切換到有這個檔案的新版本；不要只在舊資料夾執行 apply 後便認定已升級。

遠端清單確認待套用為預期的 0007 後，先備份，成功後才套用：

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
npx.cmd wrangler d1 export office-line-notifier --remote --output ".local\before-0007-repair-$(Get-Date -Format yyyyMMdd-HHmmss).sql"
npx.cmd wrangler d1 migrations apply office-line-notifier --remote
```

若顯示沒有待套用項目，但實際仍缺表，先核對本機 SQL、Pages 的 `DB` Binding、資料庫 ID 與 `d1_migrations` 紀錄，不能直接刪除資料庫、重跑全部 Migration 或修改管理紀錄冒充已升級。

可在 Cloudflare D1 Console 執行以下僅查結構的 SQL，無須回傳教師、聊天、帳號或憑證：

```sql
SELECT name, type
FROM sqlite_master
WHERE name IN ('binding_invitations', 'binding_oauth', 'invalidate_teacher_invitation')
ORDER BY name;
```

正確結果應包含兩張 table 與一個 trigger。套用完成後 Ctrl＋F5 重新整理並重新載入資料，不需重設帳密或解除真實教師綁定。資料庫套用本身即可修復本次缺表；防護程式仍須另經確認後部署才會進入正式站。

## 驗證

- 全部單元／本機 D1 整合測試：148 項通過。
- 新增 6 項相容測試：只有 0006 時的快照、Session 要求、備用碼、封鎖未完成的邀請、補上 0007 保留資料，以及觸發器缺漏時的保護。
- 瀏覽器針對邀請管理及 Cloudflare 完整流程、缺表後台與備用碼進行驗收：5 項通過。
- Cloudflare 正式模式建置及型別檢查通過。LINE HTTP 使用 Mock；未讀取正式教師／聊天資料、未由開發環境操作遠端 Migration 或發送真實 LINE。
