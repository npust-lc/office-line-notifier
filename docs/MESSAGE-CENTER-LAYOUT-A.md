# 訊息中心 A 版（2026.11.24.2）

使用者於三版原型中選擇「維持 A」。本版將 A 的聊天優先排列重新實作為正式元件，原型保留在獨立分支，沒有將 B、C 或原型切換器帶進正式程式。

## 使用方式

- 左側保留教師名單、搜尋、待回覆／全部對話／未查看；右側主要區域為聊天內容及回覆框。
- 教師姓名與對話狀態位於上方。獨立工具列顯示「領件」「交接」「備註」及「新增交接」。
- 領件／交接顯示待辦筆數；按下後才開啟側邊面板。面板開啟時，聊天區寬度保持不變，訊息不因縮窄重新排版。
- 交接面板只顯示目前教師的待交接事項，可新增或標記完成。完成仍須填寫完成人姓名，沿用原本稽核、修改紀錄及快速復原流程。
- 關閉面板可按右上角叉號，或在面板內按 Escape；焦點回到原本工具按鈕。
- 回覆草稿、Ctrl＋Enter 送出、成功回覆自動已回覆、教師新訊息再次待回覆、分頁聊天歷史、常用回覆、領取／重新通知／取消及內部備註均沿用原流程。

## 選版依據

[設計決定與原型來源（Issue #4）](https://github.com/npust-lc/office-line-notifier/issues/4)

[固定原型版本](https://github.com/npust-lc/office-line-notifier/tree/79a21c3a896dfe25b2d1b139f77625f538c8b133)

依 [prototype 技能](https://github.com/npust-lc/office-line-notifier/blob/install-prototype-skill/.agents/skills/prototype/SKILL.md) 保留原型作為比較依據；正式版只保留已選定的排列方式。

## 更新

本版沒有新增 Migration、套件、Secrets 或 Cloudflare 設定。既有正式資料庫需已套用 0006；本次不需重複套用。

在含 package.json 的專案資料夾開啟 PowerShell，先載入 Node.js：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
npm.cmd ci
npm.cmd run build:cloudflare
```

程式先上傳更新分支與 PR，正式部署另行確認。LINE 測試仍使用 Mock，本次未對真實教師發送。

## 驗證紀錄

版本 `2026.11.24.2`：完整瀏覽器執行 65 個情境，64 通過；唯一失敗為既有 QR 測試將原始碼載入的測試埠 5190 誤判為對外請求。改為比對 Playwright 設定的同源網址後，重跑該案例、A 版與 HTML 預覽共 9 個情境，全數通過；共 65 個情境已驗證。新增 3 個 A 版案例涵蓋：面板不改變對話寬度、Escape／關閉焦點還原與草稿保留、交接只列目前教師且完成要求姓名、手機工具列及送出按鈕可見。

前後端型別檢查與 Cloudflare 正式建置通過；正式成品不含原型切換器。LINE HTTP 全為 Mock。沒有修改 D1 結構、LINE 發送、權限或 Session 規則，因此未額外重跑未變動的後端單元測試。
