const { chromium } = require('playwright');
const fs = require('fs');
const PANEL = 'file://' + require('path').resolve(__dirname, '../admin-panel/index.html');
const GAME = require('path').resolve(__dirname, '../app/src/main/assets/index.html');
const CFG = require('path').resolve(__dirname, '../app/src/main/assets/config.js');
const errs = [];

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const step = async (name, fn) => {
    const before = errs.length;
    try { await fn(); } catch (e) { errs.push('STEP[' + name + ']: ' + e.message); }
    console.log((errs.length === before ? '  ok  ' : ' FAIL ') + name);
  };

  await page.goto(PANEL);
  await page.waitForTimeout(600);

  await step('پنل روی لپ‌تاپ باز می‌شود و رمز می‌خواهد', async () => {
    if (!(await page.isVisible('#gate'))) throw new Error('gate not shown');
    const sub = await page.textContent('#gateSub');
    if (!sub.includes('بار اول')) throw new Error('first-run text: ' + sub);
  });

  await step('رمز کوتاه رد می‌شود', async () => {
    await page.fill('#pin', '12');
    await page.click('#gateGo');
    await page.waitForTimeout(300);
    if (!(await page.isVisible('#gate'))) throw new Error('short pin accepted');
  });

  await step('ساخت رمز و ورود', async () => {
    await page.fill('#pin', '2468');
    await page.click('#gateGo');
    await page.waitForTimeout(3200);
    if (!(await page.isVisible('#app'))) throw new Error('panel did not open');
    const raw = await page.evaluate(() => localStorage.getItem('smrx_admin_sec_v1'));
    if (raw.includes('2468')) throw new Error('PIN stored in cleartext!');
  });

  await step('رمز اشتباه بعد از قفل کردن رد می‌شود', async () => {
    await page.evaluate(() => window.ADMIN.sec.lockNow());
    await page.reload();
    await page.waitForTimeout(600);
    await page.fill('#pin', '9999');
    await page.click('#gateGo');
    await page.waitForTimeout(500);
    if (await page.isVisible('#app')) throw new Error('wrong pin opened panel');
    const fails = await page.evaluate(() => window.ADMIN.sec.data().fails);
    if (fails !== 1) throw new Error('fails=' + fails);
    await page.fill('#pin', '2468');
    await page.click('#gateGo');
    await page.waitForTimeout(600);
    if (!(await page.isVisible('#app'))) throw new Error('correct pin refused');
  });

  await step('هر ۹ بخش پنل رسم می‌شود', async () => {
    const tabs = await page.$$eval('#nav button', e => e.length);
    if (tabs !== 9) throw new Error('tabs=' + tabs);
    for (const t of ['game', 'econ', 'diff', 'content', 'tasks', 'feat', 'out', 'store', 'sec']) {
      await page.evaluate(x => window.ADMIN.go(x), t);
      await page.waitForTimeout(220);
      const len = await page.$eval('#view', e => e.innerHTML.length);
      if (len < 300) throw new Error(t + ' too small: ' + len);
    }
  });

  await step('ویرایش اقتصاد در فایل خروجی می‌نشیند', async () => {
    await page.evaluate(() => window.ADMIN.go('econ'));
    await page.waitForTimeout(250);
    await page.fill('#eHint', '25');
    await page.fill('#eMax', '7');
    await page.fill('#mCoin', '2.5');
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => window.ADMIN.P());
    if (p.cfg.HINT_COST !== 25 || p.cfg.MAX_LIVES !== 7 || p.mul.coin !== 2.5)
      throw new Error(JSON.stringify({ h: p.cfg.HINT_COST, m: p.cfg.MAX_LIVES, c: p.mul.coin }));
  });

  await step('پیش‌نمایش سختی زنده به‌روز می‌شود', async () => {
    await page.evaluate(() => window.ADMIN.go('diff'));
    await page.waitForTimeout(250);
    const before = await page.textContent('#pvBox');
    await page.fill('#dBt', '48');
    await page.waitForTimeout(350);
    const after = await page.textContent('#pvBox');
    if (before === after) throw new Error('preview did not update');
    if (!after.includes('۴۷') && !after.includes('۴۸')) throw new Error('preview: ' + after.slice(0, 80));
  });

  await step('افزودن، ویرایش و حذف تصویر', async () => {
    await page.evaluate(() => window.ADMIN.go('content'));
    await page.waitForTimeout(300);
    const n0 = await page.evaluate(() => window.ADMIN.P().items.length);
    await page.fill('#niE', '🪗');
    await page.fill('#niN', 'آکاردئون');
    await page.click('#btnAdd');
    await page.waitForTimeout(350);
    const n1 = await page.evaluate(() => window.ADMIN.P().items.length);
    if (n1 !== n0 + 1) throw new Error('add: ' + n0 + '->' + n1);
    await page.fill('#fq', 'آکاردئون');
    await page.click('#btnFilter');
    await page.waitForTimeout(300);
    const rows = await page.$$eval('#tb tr', e => e.length);
    if (rows !== 1) throw new Error('filter rows=' + rows);
    await page.click('#tb [data-ed]');
    await page.waitForTimeout(300);
    await page.fill('#edN', 'سازدهنی');
    await page.click('#modal .btn');
    await page.waitForTimeout(400);
    const nm = await page.evaluate(() => window.ADMIN.P().items[window.ADMIN.P().items.length - 1][1]);
    if (nm !== 'سازدهنی') throw new Error('edit failed: ' + nm);
    await page.fill('#fq', 'سازدهنی');
    await page.click('#btnFilter');
    await page.waitForTimeout(300);
    await page.click('#tb [data-del]');
    await page.waitForTimeout(300);
    await page.click('#modal .btn');
    await page.waitForTimeout(400);
    const n2 = await page.evaluate(() => window.ADMIN.P().items.length);
    if (n2 !== n0) throw new Error('delete: ' + n2);
  });

  await step('کلید قابلیت‌ها کار می‌کند', async () => {
    await page.evaluate(() => window.ADMIN.go('feat'));
    await page.waitForTimeout(250);
    await page.click('#f_leaderboard');
    await page.waitForTimeout(200);
    let f = await page.evaluate(() => window.ADMIN.P().features.leaderboard);
    if (f !== true) throw new Error('toggle on failed');
    await page.click('#f_leaderboard');
    await page.waitForTimeout(200);
    f = await page.evaluate(() => window.ADMIN.P().features.leaderboard);
    if (f !== false) throw new Error('toggle off failed');
  });

  await step('متن فروشگاه ساخته می‌شود', async () => {
    await page.evaluate(() => window.ADMIN.go('store'));
    await page.waitForTimeout(300);
    const short = await page.$eval('#stShort', e => e.value);
    const long = await page.$eval('#stLong', e => e.value);
    const tags = await page.$eval('#stTags', e => e.value);
    if (short.length < 40) throw new Error('short too small');
    if (long.length < 800) throw new Error('long too small: ' + long.length);
    if (!long.includes('SMRx')) throw new Error('team missing in long');
    if (!long.includes('سلطان معما')) throw new Error('game name missing');
    if (tags.split('،').length < 8) throw new Error('few tags');
    fs.writeFileSync(require('path').resolve(__dirname,'output/store.txt'),
      short + '\n\n=====\n\n' + long + '\n\n=====\n\n' + tags);
  });

  let configText = '';
  await step('config.js ساخته و دانلود می‌شود', async () => {
    await page.evaluate(() => window.ADMIN.go('out'));
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.click('#btnDl')
    ]);
    if (dl.suggestedFilename() !== 'config.js') throw new Error('name: ' + dl.suggestedFilename());
    const p = await dl.path();
    configText = fs.readFileSync(p, 'utf8');
    if (!configText.includes('window.SULTAN_CONFIG')) throw new Error('bad content');
    if (!configText.includes('"HINT_COST": 25')) throw new Error('edits missing from export');
  });

  await step('خواندن دوباره فایل ساخته‌شده', async () => {
    await page.evaluate(() => { window.ADMIN.P().cfg.HINT_COST = 999; });
    await page.evaluate(t => window.ADMIN.load(t), configText);
    await page.waitForTimeout(400);
    const h = await page.evaluate(() => window.ADMIN.P().cfg.HINT_COST);
    if (h !== 25) throw new Error('import failed: ' + h);
  });

  await step('کارها بعد از بستن و باز کردن پنل می‌مانند', async () => {
    await page.reload();
    await page.waitForTimeout(600);
    await page.fill('#pin', '2468');
    await page.click('#gateGo');
    await page.waitForTimeout(700);
    const h = await page.evaluate(() => window.ADMIN.P().cfg.HINT_COST);
    if (h !== 25) throw new Error('work lost: ' + h);
  });

  await step('SHA-256 و PBKDF2 پنل درست است', async () => {
    const r = await page.evaluate(() => ({
      a: window.ADMIN.crypto.sha256hex('abc'),
      b: window.ADMIN.crypto.derive('password', '73616c74', 4096)
    }));
    if (r.a !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
      throw new Error('sha: ' + r.a);
    if (r.b !== 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a')
      throw new Error('pbkdf2: ' + r.b);
  });

  await page.screenshot({ path: require('path').resolve(__dirname,'output/p-out.png') });
  await page.evaluate(() => window.ADMIN.go('diff')); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/p-diff.png') });
  await page.evaluate(() => window.ADMIN.go('content')); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/p-content.png') });
  await page.evaluate(() => window.ADMIN.go('econ')); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/p-econ.png') });

  // ---------- مهم‌ترین تست: خروجی پنل واقعاً روی بازی اثر بگذارد ----------
  await step('فایل ساخته‌شده واقعاً بازی را عوض می‌کند', async () => {
    // فایل اصلی همیشه برگردانده می‌شود، حتی اگر تست بشکند
    const backup = fs.readFileSync(CFG, 'utf8');
    process.on('exit', () => { try { fs.writeFileSync(CFG, backup); } catch (e) {} });
    fs.writeFileSync(CFG, configText);
    const g = await ctx.newPage();
    const gerr = [];
    g.on('pageerror', e => gerr.push('PAGEERROR: ' + e.message));
    g.on('console', m => { if (m.type() === 'error') gerr.push('CONSOLE: ' + m.text()); });
    await g.goto('file://' + GAME);
    await g.waitForTimeout(800);
    for (let i = 0; i < 4; i++) {
      if (!(await g.$('#modalRoot.on'))) break;
      await g.click('#modalRoot .btn'); await g.waitForTimeout(300);
    }
    const r = await g.evaluate(() => ({
      hint: window.SM.cfg().HINT_COST,
      lives: window.SM.cfg().MAX_LIVES,
      coinMul: window.SM.conf().mul.coin,
      time1: window.SM.cfgDiff(1).time,
      items: window.SM.items().length,
      hearts: 0
    }));
    if (r.hint !== 25) throw new Error('hint cost in game = ' + r.hint);
    if (r.lives !== 7) throw new Error('max lives in game = ' + r.lives);
    if (r.coinMul !== 2.5) throw new Error('coin multiplier = ' + r.coinMul);
    if (r.time1 !== 47 && r.time1 !== 48) throw new Error('stage-1 time = ' + r.time1);
    // در بازی هم دیده شود
    await g.evaluate(() => { window.SM.state().lives = 7; window.SM.state().guessStage = 1; window.SM.save(); window.SM.guess(1); });
    await g.waitForTimeout(500);
    const hearts = await g.$$eval('#gLives span', e => e.length);
    if (hearts !== 7) throw new Error('hearts on screen = ' + hearts);
    await g.evaluate(() => { window.SM.state().diffStage = 1; window.SM.save(); window.SM.diff(1); });
    await g.waitForTimeout(500);
    const label = await g.textContent('#dHint');
    if (!label.includes('۲۵') || label.includes('۵۰')) throw new Error('hint label: ' + label);
    await g.evaluate(() => { window.SM.state().guessStage = 1; window.SM.guess(1); });
    await g.waitForTimeout(400);
    const l2 = await g.textContent('#gFifty');
    const l3 = await g.textContent('#gClear');
    if (!l2.includes('۵۰') || !l3.includes('۸۰')) throw new Error('powerup labels: ' + l2 + ' / ' + l3);
    if (gerr.length) throw new Error('game console: ' + gerr.join(' | '));
    await g.close();
    fs.writeFileSync(CFG, backup);
  });

  await browser.close();
  console.log('\n' + (errs.length ? 'ERRORS (' + errs.length + '):\n' + errs.join('\n') : 'ALL CLEAN ✅'));
  process.exit(errs.length ? 1 : 0);
})();
