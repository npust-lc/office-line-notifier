import{defineConfig}from'@playwright/test';
const port=process.env.PLAYWRIGHT_PORT||'5173',origin='http://127.0.0.1:'+port;
export default defineConfig({testDir:'tests/e2e',use:{baseURL:origin,headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(process.platform==='linux'?'/usr/bin/chromium':undefined),args:['--no-sandbox']},trace:'retain-on-failure'},webServer:{command:`npm run dev -- --port ${port} --strictPort`,url:origin,reuseExistingServer:!process.env.PLAYWRIGHT_PORT},reporter:'list'});
