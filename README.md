# 訊息中心 A 版下載（2026.11.24.2）

採用已選定的 A「聊天優先」：教師名單與聊天兩欄，領件、交接、備註以獨立工具列按需開啟。此分支提供下載；正式更新 PR 為 https://github.com/npust-lc/office-line-notifier/pull/5 ，尚未合併與部署。

## 先看可操作預覽

[下載 HTML 預覽 ZIP](https://github.com/npust-lc/office-line-notifier/raw/refs/heads/message-center-layout-a-download/office-line-notifier-layout-a-preview.zip)

解壓縮後用 Chrome 開啟 office-line-notifier-layout-a-preview.html。全部為虛構示範資料，可試回覆、草稿、領件與交接；不會發送真實 LINE。這是 A 版正式實作的離線展示，沒有 B／C 切換器。

## 更新包

[下載本次 8 檔更新包](https://github.com/npust-lc/office-line-notifier/raw/refs/heads/message-center-layout-a-download/office-line-notifier-layout-a-update.zip)

已有 2026.11.24.1 且已套用 0006 的專案可使用。無新增 Migration、套件、Secrets 或 Cloudflare 設定，不需重複套用 0006。建議透過 PR #5 合併，避免手動覆蓋；正式部署另行確認。不要將本下載分支整支合併進 main。

完整操作、先載入 fnm 的 PowerShell 指令與測試紀錄：
[docs/MESSAGE-CENTER-LAYOUT-A.md](docs/MESSAGE-CENTER-LAYOUT-A.md)

65 個瀏覽器情境已驗證：完整執行 64 通過、1 個測試埠號誤判，修正測試後，該案例、A 版及 HTML 預覽共 9 項全數通過。Cloudflare 正式建置、型別與原始 Logo 檢查通過，LINE HTTP 為 Mock。

選版來源：https://github.com/npust-lc/office-line-notifier/issues/4
技能：https://github.com/npust-lc/office-line-notifier/blob/install-prototype-skill/.agents/skills/prototype/SKILL.md
