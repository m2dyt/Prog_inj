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

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  console.log('1. Navigating to login...');
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });

  console.log('2. Logging in as cashier...');
  await page.waitForSelector('input[name="username"]', { timeout: 5000 });
  await page.type('input[name="username"]', 'cashier');
  await page.type('input[name="password"]', env.CASHIER_PASSWORD);
  await page.click('.login-form button.primary');
  await page.waitForSelector('.product-grid .product-card', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  console.log('3. Adding products to cart...');
  const addButtons = await page.$$('.product-card button.icon-button.add');
  console.log(`Found ${addButtons.length} add buttons`);
  if (addButtons.length > 0) {
    await addButtons[0].click();
    await new Promise(r => setTimeout(r, 400));
    await addButtons[0].click();
    await new Promise(r => setTimeout(r, 400));
  }
  if (addButtons.length > 1) {
    await addButtons[1].click();
    await new Promise(r => setTimeout(r, 400));
  }
  if (addButtons.length > 2) {
    await addButtons[2].click();
    await new Promise(r => setTimeout(r, 400));
  }
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${outDir}/05_cashier_cart.png` });

  console.log('4. Creating draft receipt and calculating cash change...');
  const createDraftBtn = await page.$('.cart-total button.primary');
  if (createDraftBtn) {
    await createDraftBtn.click();
    await page.waitForSelector('.payment-methods', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));
    const cashInput = await page.$('.cart-total input');
    if (cashInput) {
      await cashInput.type('1500');
      await new Promise(r => setTimeout(r, 800));
    }
    await page.screenshot({ path: `${outDir}/06_cash_payment_change.png` });
  }

  console.log('5. Capturing mobile viewport (390x844)...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[name="username"]', { timeout: 5000 });
  await page.type('input[name="username"]', 'cashier');
  await page.type('input[name="password"]', env.CASHIER_PASSWORD);
  await page.click('.login-form button.primary');
  await page.waitForSelector('.product-grid .product-card', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: `${outDir}/08_mobile_catalog.png` });

  await browser.close();
  console.log('REMAINING SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
