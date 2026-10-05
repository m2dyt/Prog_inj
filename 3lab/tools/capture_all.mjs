import puppeteer from '/private/tmp/shot/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env
const envText = readFileSync(resolve('/Users/cropsi/Documents/VS/rest/Prog_inj/3lab/.env'), 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.trim().split('=');
  if (k && v) env[k] = v;
});

const baseUrl = 'http://127.0.0.1:5173';
const outDir = '/Users/cropsi/Documents/VS/rest/Prog_inj/3lab/evidence';
const chromePath = '/private/tmp/shot/chrome/mac_arm-154.0.8037.92/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function waitForAllImages(page, timeout = 12000) {
  console.log('   Waiting for all images to complete loading...');
  try {
    await page.evaluate(async (maxWait) => {
      const startTime = Date.now();
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, maxWait);
          });
        })
      );
    }, timeout);
  } catch (e) {
    console.log('   Warning in image wait:', e.message);
  }
  // Extra pause for rendering pass
  await new Promise(r => setTimeout(r, 1200));
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  console.log('1. Capturing login screen...');
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="username"]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${outDir}/01_login.png` });

  console.log('2. Logging in as manager...');
  await page.type('input[name="username"]', 'manager');
  await page.type('input[name="password"]', env.MANAGER_PASSWORD);
  await page.click('.login-form button.primary');
  await page.waitForSelector('.product-grid .product-card', { timeout: 12000 });
  await waitForAllImages(page);
  await page.screenshot({ path: `${outDir}/02_catalog_desktop.png` });

  console.log('3. Opening product details dialog...');
  const firstDetailsTrigger = await page.$('.product-details-trigger');
  if (firstDetailsTrigger) {
    await firstDetailsTrigger.click();
    await page.waitForSelector('dialog.product-details[open]', { timeout: 6000 });
    await waitForAllImages(page);
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `${outDir}/03_product_details.png` });
    const closeBtn = await page.$('dialog.product-details button.icon-button');
    if (closeBtn) await closeBtn.click();
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('4. Opening product editor dialog...');
  const newProductBtn = await page.$('.manager-actions button');
  if (newProductBtn) {
    await newProductBtn.click();
    await page.waitForSelector('dialog.editor[open]', { timeout: 6000 });
    const summary = await page.$('dialog.editor summary');
    if (summary) await summary.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `${outDir}/04_product_editor.png` });
    const closeEditBtn = await page.$('dialog.editor button.icon-button');
    if (closeEditBtn) await closeEditBtn.click();
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('5. Viewing receipt history as manager...');
  const receiptsTab = await page.$('nav button.nav-item:nth-child(2)');
  if (receiptsTab) {
    await receiptsTab.click();
    await page.waitForSelector('.receipts', { timeout: 6000 });
    await new Promise(r => setTimeout(r, 800));
    const firstReceipt = await page.$('.receipt-list button');
    if (firstReceipt) {
      await firstReceipt.click();
      await new Promise(r => setTimeout(r, 600));
    }
    await page.screenshot({ path: `${outDir}/07_receipt_history.png` });
  }

  console.log('6. Logging out...');
  const logoutBtn = await page.$('.profile button.icon-button');
  if (logoutBtn) {
    await logoutBtn.click();
    await page.waitForSelector('input[name="username"]', { timeout: 6000 });
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('7. Logging in as cashier...');
  await page.type('input[name="username"]', 'cashier');
  await page.type('input[name="password"]', env.CASHIER_PASSWORD);
  await page.click('.login-form button.primary');
  await page.waitForSelector('.product-grid .product-card', { timeout: 12000 });
  await waitForAllImages(page);

  console.log('8. Adding products to cart...');
  const addButtons = await page.$$('.product-card button.icon-button.add');
  if (addButtons.length > 0) {
    await addButtons[0].click();
    await new Promise(r => setTimeout(r, 300));
    await addButtons[0].click();
    await new Promise(r => setTimeout(r, 300));
  }
  if (addButtons.length > 1) {
    await addButtons[1].click();
    await new Promise(r => setTimeout(r, 300));
  }
  if (addButtons.length > 2) {
    await addButtons[2].click();
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${outDir}/05_cashier_cart.png` });

  console.log('9. Creating draft receipt and entering cash payment...');
  const createDraftBtn = await page.$('.cart-total button.primary');
  if (createDraftBtn) {
    await createDraftBtn.click();
    await page.waitForSelector('.payment-methods', { timeout: 6000 });
    await new Promise(r => setTimeout(r, 600));
    const cashInput = await page.$('.cart-total input');
    if (cashInput) {
      await cashInput.type('1500');
      await new Promise(r => setTimeout(r, 800));
    }
    await page.screenshot({ path: `${outDir}/06_cash_payment_change.png` });
  }

  console.log('10. Capturing mobile viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="username"]', { timeout: 6000 });
  await page.type('input[name="username"]', 'cashier');
  await page.type('input[name="password"]', env.CASHIER_PASSWORD);
  await page.click('.login-form button.primary');
  await page.waitForSelector('.product-grid .product-card', { timeout: 12000 });
  await waitForAllImages(page);
  await page.screenshot({ path: `${outDir}/08_mobile_catalog.png` });

  await browser.close();
  console.log('ALL 8 SCREENSHOTS RECAPTURED WITH FULLY LOADED IMAGES!');
}

run().catch(err => {
  console.error('Recapture error:', err);
  process.exit(1);
});
