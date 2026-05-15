import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/MurkAnneKooistraKooi/.agents/skills/playwright/node_modules/playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 900 });

const logs = [];
page.on('console', m => { if (m.text().includes('cornerTrims')) logs.push(m.text()); });

await page.goto('http://localhost:5200', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// screenshot full app
await page.screenshot({ path: 'screenshot-app.png', fullPage: false });
console.log('Screenshot saved: screenshot-app.png');

// print group list if visible
const groupItems = await page.evaluate(() => {
  const items = document.querySelectorAll('[data-groupid]');
  return Array.from(items).map(el => ({ id: el.dataset.groupid, text: el.textContent.substring(0, 60) }));
});
console.log('Groups found:', JSON.stringify(groupItems));

// Check if there's a sidebar with groups
const sidebarText = await page.evaluate(() => {
  const sidebar = document.querySelector('[style*="overflow-y"]') || document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
  return sidebar ? sidebar.innerText.substring(0, 1000) : 'geen sidebar gevonden';
});
console.log('SIDEBAR:', sidebarText);

await browser.close();
