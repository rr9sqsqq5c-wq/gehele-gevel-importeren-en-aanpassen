import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/MurkAnneKooistraKooi/.agents/skills/playwright/node_modules/playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto('http://localhost:5200', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(2000);

// close handleiding popup
const closeBtn = page.locator('button').filter({ hasText: '✕' }).first();
if (await closeBtn.isVisible()) { await closeBtn.click(); await page.waitForTimeout(500); }

await page.screenshot({ path: 'screenshot-app2.png', fullPage: false });
console.log('Screenshot 2 saved');
await browser.close();
