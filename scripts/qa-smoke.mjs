import { chromium } from '@playwright/test';

const base = 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/labelforge-qa/01-landing.png', fullPage: true });
console.log('title', await page.title());
console.log('h1', await page.locator('h1').first().innerText());

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/labelforge-qa/02-login.png', fullPage: true });
await page.getByRole('button', { name: 'Owner', exact: true }).click();
try {
  await page.waitForURL('**/workspaces', { timeout: 15000 });
} catch (error) {
  console.log('LOGIN URL', page.url());
  console.log('LOGIN BODY', (await page.locator('body').innerText()).slice(0, 2000));
  await page.screenshot({ path: '/tmp/labelforge-qa/02b-login-failed.png', fullPage: true });
  console.log('CONSOLE', errors);
  throw error;
}
await page.screenshot({ path: '/tmp/labelforge-qa/03-workspaces.png', fullPage: true });
console.log('workspaces url', page.url());
console.log('workspace links', await page.locator('.workspace-card').count());

await page.locator('.workspace-card').first().click();
await page.waitForURL('**/workspaces/**');
await page.screenshot({ path: '/tmp/labelforge-qa/04-workspace.png', fullPage: true });
console.log('workspace h1', await page.locator('h1').first().innerText());
const projectLinks = page.locator('.workspace-card');
console.log('projects', await projectLinks.count());
await projectLinks.first().click();
await page.waitForURL('**/projects/**');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/tmp/labelforge-qa/05-project.png', fullPage: true });
console.log('project h1', await page.locator('h1').first().innerText());
console.log('tabs', await page.locator('.project-tabs a').allInnerTexts());
console.log('errors', errors);
await browser.close();
