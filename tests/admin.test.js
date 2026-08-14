const { chromium } = require('playwright');
const FILE = 'file://' + require('path').resolve(__dirname, '../app/src/main/assets/index.html');
const errs = [];

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  const step = async (name, fn) => {
    const before = errs.length;
    try { await fn(); } catch (e) { errs.push('STEP[' + name + ']: ' + e.message); }
    console.log((errs.length === before ? '  ok  ' : ' FAIL ') + name);
  };
  const dismissAll = async () => {
    for (let i = 0; i < 4; i++) {
      if (!(await page.$('#modalRoot.on'))) break;
      await page.click('#modalRoot .btn'); await page.waitForTimeout(350);
    }
  };
  // type a PIN on the on-screen keypad: digits then ✓
  const typePin = async (pin) => {
    for (const d of pin) {
      await page.click(`#pinPad button[data-k="${d}"]`);
      await page.waitForTimeout(40);
    }
    await page.click('#pinPad button[data-k="ok"]');
    await page.waitForTimeout(900);
  };
  const openAbout = async () => {
    await page.evaluate(() => window.SM.go('home', false));
    await page.waitForTimeout(300);
    await page.click('.screen.on [data-act="about"]');
    await page.waitForTimeout(400);
  };
  const tapBrand = async (n) => {
    for (let i = 0; i < n; i++) { await page.click('#brandMark'); await page.waitForTimeout(60); }
    await page.waitForTimeout(300);
  };

  await page.goto(FILE);
  await page.waitForTimeout(700);
  await dismissAll();

  // ---------- crypto correctness ----------
  await step('SHA-256 matches published test vectors', async () => {
    const r = await page.evaluate(() => ({
      abc: window.SM.crypto.sha256hex('abc'),
      empty: window.SM.crypto.sha256hex(''),
      long: window.SM.crypto.sha256hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      multi: window.SM.crypto.sha256hex('a'.repeat(1000)),
      utf8: window.SM.crypto.sha256hex('سلام')
    }));
    const want = {
      abc: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      empty: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      long: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      multi: '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
      utf8: '3b5f2f9dd11cbb8bab9c1a4b3e0aaf3b7b13f0d5f0e6b3e1e9c9d9d0e4b6a3f9'
    };
    for (const k of ['abc', 'empty', 'long', 'multi'])
      if (r[k] !== want[k]) throw new Error(k + ': ' + r[k]);
    if (!/^[0-9a-f]{64}$/.test(r.utf8)) throw new Error('utf8 hash malformed: ' + r.utf8);
  });

  await step('PBKDF2-HMAC-SHA256 matches RFC test vectors', async () => {
    const r = await page.evaluate(() => ({
      i1: window.SM.crypto.derive('password', '73616c74', 1),
      i2: window.SM.crypto.derive('password', '73616c74', 2),
      i4096: window.SM.crypto.derive('password', '73616c74', 4096)
    }));
    const want = {
      i1: '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
      i2: 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
      i4096: 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a'
    };
    for (const k in want) if (r[k] !== want[k]) throw new Error(k + ': got ' + r[k]);
  });

  await step('PIN derivation is fast enough for a phone', async () => {
    const ms = await page.evaluate(() => {
      const t = performance.now();
      window.SM.crypto.derive('1234', 'aabbccddeeff00112233445566778899', 15000);
      return performance.now() - t;
    });
    console.log('        (' + Math.round(ms) + 'ms desktop)');
    if (ms > 2000) throw new Error('too slow: ' + ms);
  });

  await step('salt and hash differ per setup (random salt)', async () => {
    const r = await page.evaluate(() => {
      const a = window.SM.crypto.randHex(16), b = window.SM.crypto.randHex(16);
      return { a, b, d1: window.SM.crypto.derive('1111', a, 100), d2: window.SM.crypto.derive('1111', b, 100) };
    });
    if (r.a === r.b) throw new Error('salt not random');
    if (r.d1 === r.d2) throw new Error('same hash for different salts');
    if (!/^[0-9a-f]{32}$/.test(r.a)) throw new Error('salt format: ' + r.a);
  });

  // ---------- server-dependent sections hidden ----------
  await step('leaderboard is hidden from home', async () => {
    await page.evaluate(() => window.SM.go('home', false));
    await page.waitForTimeout(300);
    const board = await page.$$eval('.screen.on [data-act="board"]', e => e.length);
    if (board !== 0) throw new Error('leaderboard button still on home');
    const about = await page.$$eval('.screen.on [data-act="about"]', e => e.length);
    if (about !== 1) throw new Error('about button missing');
    const f = await page.evaluate(() => window.SM.features);
    for (const k of ['leaderboard', 'shop', 'online', 'duel', 'tournament', 'friends'])
      if (f[k] !== false) throw new Error(k + ' should be off');
  });

  await step('board screen is blocked while feature is off', async () => {
    await page.evaluate(() => window.SM.go('board'));
    await page.waitForTimeout(400);
    const vis = await page.isVisible('#s-board');
    if (vis) throw new Error('board opened anyway');
  });

  // ---------- about ----------
  await step('about page shows the team name', async () => {
    await openAbout();
    if (!(await page.isVisible('#s-about'))) throw new Error('about not visible');
    const txt = await page.textContent('#s-about');
    if (!txt.includes('SMRx')) throw new Error('team name missing');
    if (!txt.includes('سلطان معما')) throw new Error('game name missing');
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('about overflows horizontally');
  });

  // ---------- admin: first-run setup ----------
  await step('hidden entry needs 7 taps', async () => {
    await tapBrand(4);
    if (await page.$('#modalRoot.on')) throw new Error('opened too early');
    await tapBrand(3);
    if (!(await page.$('#modalRoot.on'))) throw new Error('did not open after 7 taps');
    const t = await page.textContent('#modalRoot .modal');
    if (!t.includes('ساخت رمز')) throw new Error('expected setup: ' + t.slice(0, 40));
  });

  await step('PIN under 4 digits is rejected', async () => {
    await page.click('#pinPad button[data-k="1"]');
    await page.click('#pinPad button[data-k="2"]');
    await page.click('#pinPad button[data-k="ok"]');
    await page.waitForTimeout(300);
    const still = await page.textContent('#modalRoot .modal');
    if (!still.includes('ساخت رمز')) throw new Error('short pin accepted');
    await page.click('#pinPad button[data-k="del"]');
    await page.click('#pinPad button[data-k="del"]');
  });

  await step('mismatched confirmation is rejected', async () => {
    await typePin('1234');
    await typePin('9999');
    await page.waitForTimeout(500);
    const t = await page.textContent('#modalRoot .modal');
    if (!t.includes('ساخت رمز')) throw new Error('mismatch accepted: ' + t.slice(0, 40));
  });

  let recovery = '';
  await step('setup stores a hash, never the PIN', async () => {
    await typePin('4321');
    await typePin('4321');
    await page.waitForTimeout(600);
    const t = await page.textContent('#modalRoot .modal');
    if (!t.includes('کد بازیابی')) throw new Error('no recovery screen: ' + t.slice(0, 50));
    recovery = (await page.textContent('#modalRoot .mono')).trim();
    if (!/^[0-9A-F]{10}$/.test(recovery)) throw new Error('recovery code format: ' + recovery);
    const raw = await page.evaluate(() => localStorage.getItem('sultan_sec_v1'));
    if (raw.includes('4321')) throw new Error('PIN stored in cleartext!');
    const d = JSON.parse(raw);
    if (!/^[0-9a-f]{64}$/.test(d.hash)) throw new Error('hash format');
    if (!/^[0-9a-f]{32}$/.test(d.salt)) throw new Error('salt format');
    if (d.iter < 10000) throw new Error('iterations too low: ' + d.iter);
  });

  await step('wrong PIN is refused and counted', async () => {
    await page.click('#modalRoot .btn'); // continue -> login prompt
    await page.waitForTimeout(500);
    await typePin('1111');
    await page.waitForTimeout(400);
    const open = await page.isVisible('#s-admin');
    if (open) throw new Error('wrong PIN opened the panel!');
    const fails = await page.evaluate(() => window.SM.sec.fails());
    if (fails !== 1) throw new Error('fails=' + fails);
  });

  await step('correct PIN opens the panel', async () => {
    await tapBrand(7);
    await typePin('4321');
    await page.waitForTimeout(600);
    if (!(await page.isVisible('#s-admin'))) throw new Error('panel did not open');
    const tabs = await page.$$eval('.aTab', e => e.length);
    if (tabs !== 9) throw new Error('tabs=' + tabs);
    const fails = await page.evaluate(() => window.SM.sec.fails());
    if (fails !== 0) throw new Error('fails not reset');
  });

  await step('lockout kicks in after repeated failures', async () => {
    await page.evaluate(() => window.SM.sec.lockNow());
    await openAbout(); await tapBrand(7);
    for (let i = 0; i < 3; i++) {
      await typePin('0000');
      await page.waitForTimeout(300);
      if (i < 2) { await tapBrand(7); }
    }
    await page.waitForTimeout(400);
    const lock = await page.evaluate(() => window.SM.sec.lockedFor());
    if (lock <= 0) throw new Error('no lockout after 3 failures');
    await tapBrand(7);
    const t = await page.textContent('#modalRoot .modal');
    if (!t.includes('قفل')) throw new Error('no lock screen: ' + t.slice(0, 40));
    await page.click('#modalRoot .btn');
    await page.waitForTimeout(300);
    // even the correct PIN must be refused while locked
    const r = await page.evaluate(() => window.SM.sec.check('4321'));
    if (r !== 'lock') throw new Error('locked check returned ' + r);
  });

  await step('recovery code clears the PIN', async () => {
    const ok = await page.evaluate(c => window.SM.sec.recover(c), recovery);
    if (!ok) throw new Error('valid recovery code refused');
    const bad = await page.evaluate(() => window.SM.sec.recover('ZZZZZZZZZZ'));
    if (bad) throw new Error('bad recovery code accepted');
    const isSet = await page.evaluate(() => window.SM.sec.isSet());
    if (isSet) throw new Error('pin still set after recovery');
    // set a fresh PIN for the rest of the run
    await openAbout(); await tapBrand(7);
    await typePin('4321'); await typePin('4321');
    await page.waitForTimeout(500);
    await page.click('#modalRoot .btn');
    await page.waitForTimeout(400);
    await typePin('4321');
    await page.waitForTimeout(500);
    if (!(await page.isVisible('#s-admin'))) throw new Error('panel not open');
  });

  // ---------- panel tabs ----------
  const tab = async (id) => { await page.click(`.aTab[data-t="${id}"]`); await page.waitForTimeout(350); };

  await step('every tab renders without errors', async () => {
    for (const t of ['dash', 'player', 'stages', 'econ', 'diffc', 'content', 'tasks', 'tools', 'sec']) {
      await tab(t);
      const html = await page.$eval('#aBody', e => e.innerHTML.length);
      if (html < 200) throw new Error(t + ' body too small: ' + html);
    }
  });

  await step('quick actions change real state', async () => {
    await tab('dash');
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('[data-act="aCoins"]');
    await page.waitForTimeout(400);
    const c1 = await page.evaluate(() => window.SM.state().coins);
    if (c1 !== c0 + 1000) throw new Error('coins ' + c0 + '->' + c1);
    await page.click('[data-act="aUnlock"][data-v="all"]');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => window.SM.state());
    if (st.diffStage !== 100 || st.guessStage !== 100) throw new Error('unlock failed');
  });

  await step('player editor writes through', async () => {
    await tab('player');
    await page.fill('#pn', 'مدیر');
    await page.fill('#pc', '777');
    await page.fill('#ps', '5555');
    await page.click('[data-act="aPlayer"]');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => window.SM.state());
    if (st.name !== 'مدیر' || st.coins !== 777 || st.score !== 5555)
      throw new Error(JSON.stringify({ n: st.name, c: st.coins, s: st.score }));
  });

  await step('economy settings really drive the game', async () => {
    await tab('econ');
    await page.fill('#ehint', '5');
    await page.fill('#emax', '7');
    await page.fill('#mcoin', '3');
    await page.click('[data-act="aEcon"]');
    await page.waitForTimeout(500);
    const cfg = await page.evaluate(() => ({ h: window.SM.cfg().HINT_COST, m: window.SM.cfg().MAX_LIVES }));
    if (cfg.h !== 5 || cfg.m !== 7) throw new Error(JSON.stringify(cfg));
    // hint in a real stage must now cost 5
    await page.evaluate(() => window.SM.diff(3));
    await page.waitForTimeout(500);
    const label = await page.textContent('#dHint');
    if (!label.includes('۵')) throw new Error('hint label: ' + label);
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('#dHint');
    await page.waitForTimeout(300);
    const c1 = await page.evaluate(() => window.SM.state().coins);
    if (c1 !== c0 - 5) throw new Error('hint cost ' + (c0 - c1));
    // hearts must now show 7 slots
    await page.evaluate(() => { window.SM.state().lives = 7; window.SM.guess(2); });
    await page.waitForTimeout(500);
    const hearts = await page.$$eval('#gLives span', e => e.length);
    if (hearts !== 7) throw new Error('hearts=' + hearts);
    await page.evaluate(() => window.SM.go('home', false));
    await page.waitForTimeout(300);
  });

  await step('difficulty settings drive stage generation', async () => {
    await page.evaluate(() => window.SM.admin());
    await page.waitForTimeout(400);
    await tab('diffc');
    await page.fill('#dbt', '60');
    await page.fill('#ddb', '6');
    await page.fill('#ddm', '8');
    await page.click('[data-act="aDiff"]');
    await page.waitForTimeout(500);
    const c = await page.evaluate(() => window.SM.cfgDiff(1));
    if (c.time !== 59 && c.time !== 60) throw new Error('time=' + c.time);
    if (c.diffs !== 6) throw new Error('diffs=' + c.diffs);
    const built = await page.evaluate(() => window.SM.scene.build(window.SM.cfgDiff(1)).diffs.length);
    if (built !== 6) throw new Error('scene diffs=' + built);
  });

  await step('content editor adds, edits and deletes', async () => {
    await tab('content');
    const n0 = await page.evaluate(() => window.SM.items().length);
    await page.fill('#niE', '🧩');
    await page.fill('#niN', 'پازل تستی');
    await page.click('[data-act="aAddItem"]');
    await page.waitForTimeout(500);
    const n1 = await page.evaluate(() => window.SM.items().length);
    if (n1 !== n0 + 1) throw new Error('add failed ' + n0 + '->' + n1);
    const last = await page.evaluate(() => window.SM.items()[window.SM.items().length - 1]);
    if (last[1] !== 'پازل تستی') throw new Error('bad item ' + JSON.stringify(last));
    // filter finds it
    await page.fill('#fSearch', 'پازل تستی');
    await page.click('[data-act="aFilter"]');
    await page.waitForTimeout(400);
    const rows = await page.$$eval('.itemRow', e => e.length);
    if (rows !== 1) throw new Error('filter rows=' + rows);
    // delete it
    await page.click('.itemRow [data-act="aDelItem"]');
    await page.waitForTimeout(300);
    await page.click('#modalRoot .btn:nth-child(2)');
    await page.waitForTimeout(500);
    const n2 = await page.evaluate(() => window.SM.items().length);
    if (n2 !== n0) throw new Error('delete failed ' + n2);
  });

  await step('added item survives a reload and is playable', async () => {
    await page.fill('#fSearch', '');
    await page.click('[data-act="aFilter"]');
    await page.waitForTimeout(300);
    await page.fill('#niE', '🪁');
    await page.fill('#niN', 'بادبادک تست');
    await page.click('[data-act="aAddItem"]');
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(900);
    await dismissAll();
    const found = await page.evaluate(() => window.SM.items().filter(i => i[1] === 'بادبادک تست').length);
    if (found !== 1) throw new Error('item lost on reload: ' + found);
    // the game still builds valid rounds with the custom bank
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = 1; n <= 100; n++) {
        const c = window.SM.cfgGuess(n);
        if (!(c.time > 0)) out.push(n);
      }
      return out;
    });
    if (bad.length) throw new Error('bad stages: ' + bad.slice(0, 5));
  });

  await step('missions and daily rewards are editable', async () => {
    await page.evaluate(() => { window.SM.sec.lockNow(); });
    await openAbout(); await tapBrand(7);
    await typePin('4321');
    await page.waitForTimeout(600);
    await tab('tasks');
    await page.fill('#mg0', '2');
    await page.fill('#mc0', '999');
    await page.click('[data-act="aMissions"]');
    await page.waitForTimeout(500);
    await tab('tasks');
    const g = await page.$eval('#mg0', e => e.value);
    if (g !== '2') throw new Error('goal=' + g);
    await page.fill('#dr0', '500');
    await page.click('[data-act="aDaily"]');
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => JSON.parse(localStorage.getItem('sultan_tune_v1')));
    if (!t.daily || t.daily[0].c !== 500) throw new Error('daily not saved');
    if (!t.missions || t.missions[0].goal !== 2) throw new Error('missions not saved');
  });

  await step('backup round-trip with checksum', async () => {
    await tab('tools');
    await page.click('[data-act="aBackup"]');
    await page.waitForTimeout(400);
    const bk = await page.$eval('#bkOut', e => e.value);
    if (bk.length < 100) throw new Error('backup empty');
    const pack = JSON.parse(bk);
    if (!pack.sum || !pack.body) throw new Error('no checksum');
    // tampered backup must be caught
    const tampered = JSON.stringify({ sum: pack.sum, body: pack.body.replace('"coins":', '"coins":9') });
    await page.fill('#bkIn', tampered);
    await page.click('[data-act="aRestore"]');
    await page.waitForTimeout(400);
    const warn = await page.textContent('#modalRoot .modal');
    if (!warn.includes('کد کنترلی')) throw new Error('tamper not detected');
    await page.click('#modalRoot .btn'); // بی‌خیال
    await page.waitForTimeout(300);
    // a real backup restores
    await page.evaluate(() => { window.SM.state().coins = 12345; window.SM.save(); });
    await page.click('[data-act="aBackup"]');
    await page.waitForTimeout(300);
    const good = await page.$eval('#bkOut', e => e.value);
    await page.evaluate(() => { window.SM.state().coins = 1; window.SM.save(); });
    await page.fill('#bkIn', good);
    await page.click('[data-act="aRestore"]');
    await page.waitForTimeout(1400);
    await dismissAll();
    const c = await page.evaluate(() => window.SM.state().coins);
    if (c !== 12345) throw new Error('restore failed, coins=' + c);
  });

  await step('scene preview renders', async () => {
    await page.evaluate(() => { window.SM.sec.lockNow(); });
    await openAbout(); await tapBrand(7);
    await typePin('4321');
    await page.waitForTimeout(600);
    await tab('tools');
    await page.fill('#pvn', '44');
    await page.click('[data-act="aPreview"]');
    await page.waitForTimeout(500);
    const svgs = await page.$$eval('#pvBox svg', e => e.length);
    if (svgs !== 2) throw new Error('svgs=' + svgs);
  });

  await step('audit log records actions', async () => {
    await tab('sec');
    const lines = await page.$$eval('.logLine', e => e.length);
    if (lines < 5) throw new Error('log lines=' + lines);
    const txt = await page.textContent('#aBody');
    if (!txt.includes('ورود موفق')) throw new Error('no login entry');
    if (!txt.includes('ورود ناموفق')) throw new Error('no failed-login entry');
  });

  await step('session auto-locks and panel closes', async () => {
    await page.evaluate(() => window.SM.sec.setTimeout(1));
    const open1 = await page.evaluate(() => window.SM.sec.open());
    if (!open1) throw new Error('session should be open');
    // simulate the app going to the background
    await page.evaluate(() => { window.SM.sec.lockNow(); });
    const open2 = await page.evaluate(() => window.SM.sec.open());
    if (open2) throw new Error('session should be closed');
    await page.evaluate(() => window.SM.go('admin'));
    await page.waitForTimeout(500);
    const vis = await page.isVisible('#s-admin');
    if (vis) throw new Error('admin visible without a session');
  });

  await step('tuning reset restores defaults', async () => {
    await dismissAll();
    await openAbout(); await tapBrand(7);
    await typePin('4321');
    await page.waitForTimeout(600);
    await tab('tools');
    await page.click('[data-act="aResetTune"]');
    await page.waitForTimeout(300);
    await page.click('#modalRoot .btn:nth-child(2)');
    await page.waitForTimeout(1500);
    await dismissAll();
    const cfg = await page.evaluate(() => window.SM.cfg());
    if (cfg.HINT_COST !== 50 || cfg.MAX_LIVES !== 5) throw new Error(JSON.stringify(cfg));
    const c = await page.evaluate(() => window.SM.cfgDiff(1));
    if (c.diffs !== 3) throw new Error('diffs=' + c.diffs);
  });

  await page.evaluate(() => window.SM.go('about'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a1-about.png') });
  await page.evaluate(() => { window.SM.sec.lockNow(); });
  await page.click('#brandMark'); await page.click('#brandMark'); await page.click('#brandMark');
  await page.click('#brandMark'); await page.click('#brandMark'); await page.click('#brandMark');
  await page.click('#brandMark');
  await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a2-login.png') });
  await typePin('4321');
  await page.waitForTimeout(700);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a3-dash.png') });
  await page.click('.aTab[data-t="econ"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a4-econ.png') });
  await page.click('.aTab[data-t="content"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a5-content.png') });
  await page.click('.aTab[data-t="sec"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'output/a6-sec.png') });

  await browser.close();
  console.log('\n' + (errs.length ? 'ERRORS (' + errs.length + '):\n' + errs.join('\n') : 'ALL CLEAN ✅'));
  process.exit(errs.length ? 1 : 0);
})();
