# 訊息中心版面原型（可拋棄）

問題：行政人員回覆老師時，領件與交接資訊放在哪裡最順手？

依使用者已確認的方向，比較三種結構；保留暖黃配色、原始透明 Logo 及既有辦公室介面脈絡。

- A：聊天優先。教師名單及對話並排，領件／交接／備註以浮層開啟。
- B：工作並排。教師名單、對話、工作資訊三欄排列，領件及交接持續可見。
- C：單一對話。名單可開關，聊天占主要區域，工作資訊置於下方。

本原型只比較版面，使用固定虛構資料及記憶體狀態，沒有資料庫、LINE、登入或儲存功能。重新整理會重設。可模擬回覆、教師新訊息、領取與建立交接；細部業務規則仍以正式系統為準。底部切換器只在原型的開發模式或專用離線成品顯示，正常正式建置不載入原型。

## 開啟

最簡單的方式：下載同目錄的 `MessageCenter.prototype.preview.html`，用 Chrome 開啟，點擊底部箭頭切換 A／B／C。可直接開啟任何一版；查詢字串為 `?variant=A`、`?variant=B`、`?variant=C`。方向鍵也可切換，輸入框內保留原本的方向鍵行為。

使用本原型分支的原始碼時，在專案資料夾開啟 PowerShell，先載入 Node.js：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
npm.cmd ci
npm.cmd run prototype:messages
```

瀏覽 `http://127.0.0.1:5180/?variant=A`。產生單檔 HTML：

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 24
npm.cmd run prototype:messages:html
```

成品為 `.local/prototype/message-center-prototype.html`。

## 試用情境

1. 看教師甲的最新問題，回覆「明天領取也可以」。觀察待回覆變已回覆，以及名單與工作資訊的位置。
2. 按「模擬老師新訊息」，對話再變待回覆。
3. 看領件資訊，建立一筆交接，填入示範交接人及內容。
4. 切換其他教師，搜尋、切換待回覆／全部對話；比較哪一版最容易知道下一步。
5. 切換 A／B／C 時保留目前示範狀態，比較同一情境。按「重設情境」可重新開始。

目前結論：等待使用者試用及選擇；尚未將任一版套用至正式網站。選定後依 prototype 技能重寫正式實作及必要測試，原型保留在獨立分支作為比較依據。

技能安裝為另一筆獨立 commit／PR，只有 `.agents/skills/prototype` 的四個原始檔。本原型不應整支合併進 main。
