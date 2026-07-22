// Renders a realistic tax-invoice PNG for Saffron Textiles Mills, used to shoot
// the live AI-read "ease" scene in the promo (same technique as expense's
// synthetic-receipt renderer — a real HTML invoice, screenshotted).
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'assets', 'sample-invoice.png');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#e8e8e4;font-family:'Georgia',serif;display:flex;justify-content:center;padding:30px}
  .inv{background:#fff;width:520px;padding:36px 40px;box-shadow:0 2px 14px rgba(0,0,0,.18)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:16px;margin-bottom:16px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{font-size:11px;color:#555}
  .tag{font-size:20px;font-weight:bold;letter-spacing:1px}
  .meta{display:flex;justify-content:space-between;font-size:12px;color:#333;margin-bottom:20px}
  .meta div{line-height:1.7}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
  th{text-align:left;border-bottom:1px solid #999;padding:6px 4px;font-size:11px;color:#555}
  td{padding:6px 4px;border-bottom:1px solid #eee}
  .r{text-align:right}
  .totals{width:260px;margin-left:auto;font-size:12px}
  .totals div{display:flex;justify-content:space-between;padding:3px 0}
  .grand{font-weight:bold;font-size:15px;border-top:1px solid #222;padding-top:6px;margin-top:4px}
  .foot{font-size:10px;color:#888;margin-top:20px;border-top:1px dashed #aaa;padding-top:10px}
</style></head><body>
  <div class="inv">
    <div class="top">
      <div><h1>Saffron Textiles Mills</h1><div class="sub">GSTIN: 07AATCS1234M1Z8 &middot; Ludhiana, Punjab</div></div>
      <div class="tag">TAX INVOICE</div>
    </div>
    <div class="meta">
      <div><b>Invoice No:</b> STM/2026/0847<br/><b>Invoice Date:</b> 18 Jul 2026<br/><b>PO Ref:</b> PO-INS-4471</div>
      <div><b>Bill To:</b><br/>In-Sync Procurement<br/>New Delhi, Delhi</div>
    </div>
    <table>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
      <tr><td>Cotton yarn — 40s combed, dyed</td><td class="r">180 kg</td><td class="r">&#8377;620</td><td class="r">&#8377;1,11,600</td></tr>
      <tr><td>Freight &amp; handling</td><td class="r">1</td><td class="r">&#8377;3,400</td><td class="r">&#8377;3,400</td></tr>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>&#8377;1,15,000</span></div>
      <div><span>CGST (2.5%)</span><span>&#8377;2,875</span></div>
      <div><span>SGST (2.5%)</span><span>&#8377;2,875</span></div>
      <div class="grand"><span>Total Payable</span><span>&#8377;1,20,750</span></div>
    </div>
    <div class="foot">Payment due within 30 days &middot; Bank: Axis Bank, Ludhiana &middot; A/C 917020xxxxxx4521</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 });
await page.setContent(HTML);
await page.locator('.inv').screenshot({ path: out });
await browser.close();
console.log('Saved', out);
