import {test,expect} from '@playwright/test';

test('邀請管理可重複複製、撤銷與輪替；備用碼預設收起，不保存連結到 localStorage',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'教師名單',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:'示範教師乙'});await row.getByRole('button',{name:'管理綁定'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'產生綁定碼',exact:true})).not.toBeVisible();
 await dialog.getByRole('button',{name:'產生專屬邀請',exact:true}).click();const link=await dialog.getByLabel('專屬邀請連結').inputValue();
 expect(await page.evaluate(()=>localStorage.getItem('office-line-demo-v1'))).not.toContain(link);
 await dialog.getByRole('button',{name:'關閉',exact:true}).click();await row.getByRole('button',{name:'管理綁定'}).click();await expect(dialog.getByLabel('專屬邀請連結')).toHaveValue(link);
 await dialog.getByRole('button',{name:'重新產生',exact:true}).click();await expect(dialog).toContainText('舊連結立即失效');await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog.getByLabel('專屬邀請連結')).toHaveValue(link);
 await dialog.getByRole('button',{name:'重新產生',exact:true}).click();await dialog.getByRole('button',{name:'確認重新產生'}).click();await expect(dialog.getByLabel('專屬邀請連結')).not.toHaveValue(link);
 await dialog.getByRole('button',{name:'撤銷邀請'}).click();await expect(dialog.getByLabel('專屬邀請連結')).toHaveCount(0);await expect(dialog).toContainText('邀請已撤銷');
});

test('教師預覽不啟動辦公室登入或輪詢，手機可確認姓名再完成',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/bind#demo-preview');await expect(page.getByRole('heading',{name:'連結辦公室通知'})).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe('');
 await expect(page.getByRole('button',{name:'值班工作台',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'使用 LINE 繼續'}).click();await expect(page.getByRole('heading',{name:'確認教師身分'})).toBeVisible();await expect(page.locator('.invitation-identity')).toContainText('示範教師乙');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('teacher-confirm-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'確認綁定示範教師乙'}).click();await expect(page.getByRole('heading',{name:'身分綁定成功'})).toBeVisible();expect(requests.filter(u=>u.includes('/api/'))).toHaveLength(0);
});

test('工讀生沒有綁定管理入口',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'切換為工讀生'}).click();await page.getByRole('button',{name:'教師名單',exact:true}).click();await expect(page.getByRole('button',{name:'管理綁定'})).toHaveCount(0);
});
