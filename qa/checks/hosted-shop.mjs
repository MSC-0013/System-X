import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const dir = process.argv[2];
const cartOnly = process.argv[3] === 'hosted-cart';
const origin = 'https://automationexercise.com';
const expected = cartOnly ? 'A fresh hosted demo session adds two units, verifies the cart quantity and removes that item.' :
  'Real Chrome searches the published practice catalog and opens the exact matching product detail.';
const row = { featureId: cartOnly ? 'SX-HOSTED-CART-CHROME' : 'SX-HOSTED-SHOP-CHROME', runtimeMode: 'REAL-INTEGRATION', expected };
let browser;
let page;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const landing = await page.goto(origin + (cartOnly ? '/product_details/1' : '/products'), { waitUntil: 'domcontentloaded', timeout: 16000 });
  assert.equal(landing.status(), 200);
  if (!cartOnly) {
    await page.locator('#search_product').fill('Blue Top');
    await page.locator('#submit_search').click();
    await page.getByRole('heading', { name: 'Searched Products', exact: true }).waitFor();
    const product = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
    assert.equal(await product.count(), 1);
    await product.getByRole('link', { name: 'View Product', exact: true }).click();
  }
  await page.getByRole('heading', { name: 'Blue Top', exact: true }).waitFor();
  assert.equal(new URL(page.url()).origin, origin);
  assert.match(new URL(page.url()).pathname, /^\/product_details\/\d+$/);
  await page.getByText(/Availability:/).waitFor();
  if (cartOnly) {
    await page.locator('#quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    const dialog = page.locator('#cartModal');
    await dialog.getByText('Your product has been added to cart.').waitFor();
    await dialog.getByRole('link', { name: 'View Cart' }).click();
    const lineItem = page.locator('tr').filter({ has: page.getByRole('link', { name: 'Blue Top', exact: true }) });
    await lineItem.locator('.cart_quantity').waitFor();
    assert.equal((await lineItem.locator('.cart_quantity').innerText()).trim(), '2');
    await page.screenshot({ path: join(dir, 'hosted-cart.png'), timeout: 10000 });
    await lineItem.locator('.cart_quantity_delete').click();
    await lineItem.waitFor({ state: 'detached' });
    await page.getByText('Cart is empty!', { exact: true }).waitFor();
  } else {
    await page.screenshot({ path: join(dir, 'hosted-product.png'), timeout: 10000 });
  }
  assert.deepEqual(errors, []);
  row.result = 'PASS';
  row.observed = JSON.stringify({ browser: browser.version(), product: 'Blue Top', documentStatus: landing.status(),
    finalUrl: page.url(), uncaughtErrors: errors.length, ...(cartOnly ? { quantity: 2, removed: true } : { matchedCards: 1 }) });
} catch (error) {
  row.result = 'FAIL';
  row.observed = error.message;
  await page?.screenshot({ path: join(dir, 'hosted-failure.png'), timeout: 3000 }).catch(() => null);
} finally {
  await browser?.close();
  await writeFile(join(dir, 'observations.json'), JSON.stringify([row], null, 2));
}
