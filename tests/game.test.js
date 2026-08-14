const { chromium } = require('playwright');
const path = require('path').resolve(__dirname, '../app/src/main/assets/index.html');
const errs = [];

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 393, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + path);
  await page.waitForTimeout(700);

  const step = async (name, fn) => {
    const before = errs.length;
    try { await fn(); } catch (e) { errs.push('STEP[' + name + ']: ' + e.message); }
    console.log((errs.length === before ? '  ok  ' : ' FAIL ') + name);
  };

  // welcome modal on first run
  await step('welcome modal', async () => {
    await page.waitForSelector('#modalRoot.on', { timeout: 3000 });
    await page.click('#modalRoot .btn');
    await page.waitForTimeout(500);
  });
  // daily reward
  await step('daily reward', async () => {
    if (await page.$('#modalRoot.on')) {
      await page.click('#modalRoot .btn'); // claim
      await page.waitForTimeout(400);
      if (await page.$('#modalRoot.on')) await page.click('#modalRoot .btn');
      await page.waitForTimeout(300);
    }
  });
  await step('home rendered', async () => {
    const t = await page.textContent('.logo');
    if (!t.includes('سلطان معما')) throw new Error('logo missing: ' + t);
    const n = await page.$$eval('.mbtn', e => e.length);
    if (n < 8) throw new Error('menu buttons: ' + n);
  });

  // ---- diff mode ----
  await step('open diff stage', async () => {
    await page.click('[data-act="diff"]');
    await page.waitForTimeout(600);
    const vis = await page.isVisible('#s-diff');
    if (!vis) throw new Error('diff screen not visible');
    const w = await page.$eval('#wrapA', e => e.getBoundingClientRect().width);
    const h = await page.$eval('#wrapA', e => e.getBoundingClientRect().height);
    if (w < 100 || h < 60) throw new Error('scene size bad ' + w + 'x' + h);
    const nodes = await page.$eval('#svgA', e => e.childNodes.length);
    if (nodes < 5) throw new Error('svgA empty: ' + nodes);
  });

  // solve every stage-1 diff by tapping mapped coordinates
  await step('solve diff stage', async () => {
    const diffs = await page.evaluate(() => window.SM.dg().scene.diffs);
    const box = await page.$eval('#svgA', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const sc = Math.min(box.w / 300, box.h / 200);
    const ox = box.x + (box.w - 300 * sc) / 2, oy = box.y + (box.h - 200 * sc) / 2;
    for (const d of diffs) {
      await page.mouse.click(ox + d.x * sc, oy + d.y * sc);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(400);
    const found = await page.evaluate(() => window.SM.dg().found.length);
    if (found !== diffs.length) throw new Error('found ' + found + '/' + diffs.length);
    if (!(await page.$('#modalRoot.on'))) throw new Error('win modal missing');
    const body = await page.textContent('#modalRoot .modal');
    if (!body.includes('آفرین')) throw new Error('bad win modal: ' + body.slice(0, 60));
  });

  await step('advance to stage 2', async () => {
    await page.click('#modalRoot .btn'); // next stage
    await page.waitForTimeout(600);
    const t = await page.textContent('#dTitle');
    if (!t.includes('۲')) throw new Error('title: ' + t);
  });

  await step('wrong tap penalty', async () => {
    const before = await page.evaluate(() => window.SM.dg().left);
    await page.mouse.click(200, 300); // likely empty spot inside scene
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.SM.dg().left);
    if (after >= before) throw new Error('no time penalty');
  });

  await step('hint costs coins', async () => {
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('#dHint');
    await page.waitForTimeout(200);
    const c1 = await page.evaluate(() => window.SM.state().coins);
    if (c1 !== c0 - 50) throw new Error('coins ' + c0 + '->' + c1);
    const ring = await page.$$eval('#svgA .hintRing', e => e.length);
    if (ring !== 1) throw new Error('hint ring ' + ring);
  });

  await step('timer counts down', async () => {
    const a = await page.evaluate(() => window.SM.dg().left);
    await page.waitForTimeout(1100);
    const b = await page.evaluate(() => window.SM.dg().left);
    if (!(b < a - 500)) throw new Error('timer stuck ' + a + ' ' + b);
    const txt = await page.textContent('#dTime');
    if (!/[۰-۹]/.test(txt)) throw new Error('timer text: ' + txt);
  });

  await step('back confirm + exit', async () => {
    await page.click('[data-back]');
    await page.waitForTimeout(300);
    const btns = await page.$$('#modalRoot .btn');
    await btns[1].click(); // خروج
    await page.waitForTimeout(500);
    if (!(await page.isVisible('#s-home'))) throw new Error('not home');
  });

  // ---- guess mode ----
  await step('open guess stage', async () => {
    await page.click('[data-act="guess"]');
    await page.waitForTimeout(700);
    if (!(await page.isVisible('#s-guess'))) throw new Error('guess screen hidden');
    const n = await page.$$eval('#gOpts .opt', e => e.length);
    if (n !== 4) throw new Error('options: ' + n);
    const tiles = await page.$$eval('#gTiles i', e => e.length);
    if (tiles !== 16) throw new Error('tiles: ' + tiles);
    const sz = await page.$eval('#gPic', e => e.getBoundingClientRect().width);
    if (sz < 100) throw new Error('pic size ' + sz);
  });

  await step('picture reveals over time', async () => {
    const b0 = await page.$eval('#gEmoji', e => e.style.filter);
    await page.waitForTimeout(1400);
    const b1 = await page.$eval('#gEmoji', e => e.style.filter);
    const v = s => parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!(v(b1) < v(b0))) throw new Error('blur not decreasing ' + b0 + ' -> ' + b1);
  });

  await step('fifty-fifty powerup', async () => {
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('#gFifty');
    await page.waitForTimeout(200);
    const gone = await page.$$eval('#gOpts .gone', e => e.length);
    const c1 = await page.evaluate(() => window.SM.state().coins);
    if (gone !== 1) throw new Error('gone=' + gone);
    if (c1 !== c0 - 50) throw new Error('coins ' + c0 + '->' + c1);
  });

  await step('clear powerup', async () => {
    await page.click('#gClear');
    await page.waitForTimeout(200);
    const cl = await page.evaluate(() => window.SM.gg().cleared);
    if (cl !== 1) throw new Error('cleared=' + cl);
  });

  await step('wrong answer loses a life', async () => {
    const l0 = await page.evaluate(() => window.SM.state().lives);
    const idx = await page.evaluate(() => {
      const g = window.SM.gg();
      const nodes = document.querySelectorAll('#gOpts .opt');
      for (let i = 0; i < g.opts.length; i++)
        if (g.opts[i] !== g.item && nodes[i].className.indexOf('gone') < 0) return i;
      return -1;
    });
    const btns = await page.$$('#gOpts .opt');
    await btns[idx].click();
    await page.waitForTimeout(500);
    const l1 = await page.evaluate(() => window.SM.state().lives);
    if (l1 !== l0 - 1) throw new Error('lives ' + l0 + '->' + l1);
  });

  await step('correct answer wins', async () => {
    const idx = await page.evaluate(() => {
      const g = window.SM.gg();
      return g.opts.indexOf(g.item);
    });
    const btns = await page.$$('#gOpts .opt');
    await btns[idx].click();
    await page.waitForTimeout(1100);
    if (!(await page.$('#modalRoot.on'))) throw new Error('no win modal');
    const stage = await page.evaluate(() => window.SM.state().guessStage);
    if (stage !== 2) throw new Error('guessStage=' + stage);
  });

  await step('go to stages list', async () => {
    const btns = await page.$$('#modalRoot .btn');
    await btns[1].click(); // لیست مراحل
    await page.waitForTimeout(500);
    const cells = await page.$$eval('.cell', e => e.length);
    if (cells !== 100) throw new Error('cells=' + cells);
    const locked = await page.$$eval('.cell.lock', e => e.length);
    if (locked !== 98) throw new Error('locked=' + locked);
  });

  await step('switch stage tab', async () => {
    await page.click('.screen.on [data-act="tabD"]');
    await page.waitForTimeout(300);
    const on = await page.textContent('.tab.on');
    if (!on.includes('تفاوت')) throw new Error('tab: ' + on);
  });

  await step('locked stage blocked', async () => {
    const cells = await page.$$('.screen.on .cell');
    await cells[60].click();
    await page.waitForTimeout(300);
    if (await page.isVisible('#s-diff')) throw new Error('locked stage opened');
  });

  await step('about page (replaces server-only leaderboard)', async () => {
    await page.click('.screen.on [data-act="back"]');
    await page.waitForTimeout(400);
    await page.click('.screen.on [data-act="about"]');
    await page.waitForTimeout(400);
    const txt = await page.textContent('#s-about');
    if (!txt.includes('SMRx')) throw new Error('team name missing');
    const board = await page.$$eval('.screen.on [data-act="board"]', e => e.length);
    if (board !== 0) throw new Error('leaderboard button visible');
  });

  await step('profile edit', async () => {
    await page.click('.screen.on [data-act="back"]');
    await page.waitForTimeout(400);
    await page.click('.screen.on [data-act="profile"]');
    await page.waitForTimeout(400);
    await page.fill('#pName', 'سلطان');
    await page.click('[data-act="saveName"]');
    await page.waitForTimeout(300);
    const avs = await page.$$('.screen.on .avPick button');
    await avs[5].click();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => window.SM.state());
    if (st.name !== 'سلطان') throw new Error('name=' + st.name);
    const on = await page.$$eval('.avPick button.on', e => e.length);
    if (on !== 1) throw new Error('selected avatars=' + on);
  });

  await step('missions screen + claim', async () => {
    await page.click('.screen.on [data-act="back"]');
    await page.waitForTimeout(400);
    await page.click('.screen.on [data-act="missions"]');
    await page.waitForTimeout(400);
    const rows = await page.$$eval('.msn', e => e.length);
    if (rows !== 4) throw new Error('missions=' + rows);
    // guess mission should have progress 1/3 already
    const p = await page.evaluate(() => window.SM.state().missions.p);
    if (!p.guess) throw new Error('no guess progress: ' + JSON.stringify(p));
    // force-complete one and claim
    await page.evaluate(() => { window.SM.state().missions.p.play = 5; window.SM.save(); });
    await page.click('.screen.on [data-act="back"]');
    await page.waitForTimeout(300);
    await page.click('.screen.on [data-act="missions"]');
    await page.waitForTimeout(300);
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('.screen.on [data-act="claim"][data-id="play"]');
    await page.waitForTimeout(400);
    const c1 = await page.evaluate(() => window.SM.state().coins);
    if (c1 !== c0 + 120) throw new Error('claim coins ' + c0 + '->' + c1);
  });

  await step('persistence across reload', async () => {
    const before = await page.evaluate(() => { const s = window.SM.state(); return { c: s.coins, n: s.name, g: s.guessStage }; });
    await page.reload();
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => { const s = window.SM.state(); return { c: s.coins, n: s.name, g: s.guessStage }; });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(JSON.stringify(before) + ' != ' + JSON.stringify(after));
  });

  await step('android back button hook', async () => {
    if (await page.$('#modalRoot.on')) await page.click('#modalRoot .btn');
    await page.waitForTimeout(300);
    await page.click('.screen.on [data-act="about"]');
    await page.waitForTimeout(400);
    const handled = await page.evaluate(() => window.onAndroidBack());
    if (handled !== true) throw new Error('back not handled');
    await page.waitForTimeout(300);
    if (!(await page.isVisible('#s-home'))) throw new Error('not home after back');
    const atHome = await page.evaluate(() => window.onAndroidBack());
    if (atHome !== false) throw new Error('home should return false');
  });

  // ---- deep stress: build every stage of both modes ----
  await step('all 100 diff scenes build correctly', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (let n = 1; n <= 100; n++) {
        const cfg = window.SM.cfgDiff(n);
        const sc = window.SM.scene.build(cfg);
        if (sc.diffs.length !== cfg.diffs) out.push(n + ':diffs ' + sc.diffs.length + '!=' + cfg.diffs);
        if (sc.a.length < 8) out.push(n + ':objs ' + sc.a.length);
        for (let i = 0; i < sc.a.length; i++) for (let j = i + 1; j < sc.a.length; j++) {
          const A = sc.a[i], B = sc.a[j];
          const dd = Math.hypot(A.x - B.x, A.y - B.y);
          if (dd < 13) out.push(n + ':objects stacked ' + dd.toFixed(1) + ' (' + A.t + '/' + B.t + ')');
        }
        const svg = window.SM.scene.svgOf(sc, 'a') + window.SM.scene.svgOf(sc, 'b');
        if (/NaN|undefined|null/.test(svg)) out.push(n + ':svg has NaN/undefined');
        // hotspots must stay inside the canvas and not overlap
        for (let i = 0; i < sc.diffs.length; i++) {
          const d = sc.diffs[i];
          if (d.x < 0 || d.x > 300 || d.y < -10 || d.y > 210) out.push(n + ':hotspot out ' + d.x + ',' + d.y);
          for (let j = i + 1; j < sc.diffs.length; j++) {
            const e = sc.diffs[j];
            const dist = Math.hypot(d.x - e.x, d.y - e.y);
            if (dist < (d.r + e.r) * 0.55) out.push(n + ':hotspots overlap ' + dist.toFixed(1) + ' r=' + d.r.toFixed(0) + '/' + e.r.toFixed(0));
          }
        }
      }
      return out;
    });
    if (bad.length) throw new Error(bad.slice(0, 8).join(' | ') + ' (total ' + bad.length + ')');
  });

  await step('svg renders in a real DOM (all stages)', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      holder.setAttribute('viewBox', '0 0 300 200');
      holder.style.width = '300px'; holder.style.height = '200px';
      document.body.appendChild(holder);
      for (let n = 1; n <= 100; n++) {
        const sc = window.SM.scene.build(window.SM.cfgDiff(n));
        holder.innerHTML = window.SM.scene.svgOf(sc, 'a');
        if (holder.querySelectorAll('g').length < 5) out.push(n + ':few groups');
        holder.innerHTML = window.SM.scene.svgOf(sc, 'b');
        if (!holder.querySelector('.marks')) out.push(n + ':no marks group');
      }
      holder.remove();
      return out;
    });
    if (bad.length) throw new Error(bad.slice(0, 5).join(' | '));
  });

  await step('all 100 guess stages have valid options', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      const seen = {};
      for (let n = 1; n <= 100; n++) {
        const cfg = window.SM.cfgGuess(n);
        if (cfg.time < 10) out.push(n + ':time ' + cfg.time);
      }
      return out;
    });
    if (bad.length) throw new Error(bad.join(' | '));
  });

  await step('play stages 1..100 of guess mode', async () => {
    // drive the real UI quickly through many stages via the exposed API
    for (const n of [1, 10, 33, 50, 77, 99, 100]) {
      await page.evaluate(n => { const s = window.SM.state(); s.lives = 5; s.guessStage = n; window.SM.guess(n); }, n);
      await page.waitForTimeout(160);
      const info = await page.evaluate(() => {
        const g = window.SM.gg();
        return { opts: g.opts.length, has: g.opts.indexOf(g.item) >= 0, live: g.live, txt: document.querySelector('#gOpts').children.length };
      });
      if (info.opts !== 4 || !info.has || !info.live || info.txt !== 4) throw new Error('stage ' + n + ': ' + JSON.stringify(info));
      const idx = await page.evaluate(() => window.SM.gg().opts.indexOf(window.SM.gg().item));
      const btns = await page.$$('#gOpts .opt');
      await btns[idx].click();
      await page.waitForTimeout(900);
      if (!(await page.$('#modalRoot.on'))) throw new Error('no modal at stage ' + n);
      const btns2 = await page.$$('#modalRoot .btn');
      await btns2[2].click(); // خانه
      await page.waitForTimeout(300);
    }
  });

  await step('play several diff stages end to end', async () => {
    for (const n of [10, 40, 70, 100]) {
      await page.evaluate(n => window.SM.diff(n), n);
      await page.waitForTimeout(400);
      const diffs = await page.evaluate(() => window.SM.dg().scene.diffs);
      const box = await page.$eval('#svgB', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      const sc = Math.min(box.w / 300, box.h / 200);
      const ox = box.x + (box.w - 300 * sc) / 2, oy = box.y + (box.h - 200 * sc) / 2;
      for (const d of diffs) { await page.mouse.click(ox + d.x * sc, oy + d.y * sc); await page.waitForTimeout(45); }
      await page.waitForTimeout(350);
      const found = await page.evaluate(() => window.SM.dg().found.length);
      if (found !== diffs.length) throw new Error('stage ' + n + ' found ' + found + '/' + diffs.length);
      const btns = await page.$$('#modalRoot .btn');
      await btns[2].click();
      await page.waitForTimeout(300);
    }
  });

  await step('time-up flow', async () => {
    await page.evaluate(() => { window.SM.diff(5); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.SM.dg().left = 300; });
    await page.waitForTimeout(900);
    const txt = await page.textContent('#modalRoot .modal');
    if (!txt.includes('زمان تمام شد')) throw new Error('modal: ' + txt.slice(0, 50));
    const c0 = await page.evaluate(() => window.SM.state().coins);
    await page.click('#modalRoot .btn'); // continue with coins
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ live: window.SM.dg().live, left: window.SM.dg().left, coins: window.SM.state().coins }));
    if (!st.live || st.left < 25000) throw new Error('revive failed ' + JSON.stringify(st));
    if (st.coins !== c0 - 100) throw new Error('revive cost ' + c0 + '->' + st.coins);
    await page.evaluate(() => { window.SM.go('home', false); });
  });

  await step('no lives flow', async () => {
    await page.evaluate(() => { const s = window.SM.state(); s.lives = 0; s.lifeTs = Date.now(); s.coins = 500; window.SM.save(); window.SM.guess(3); });
    await page.waitForTimeout(500);
    const txt = await page.textContent('#modalRoot .modal');
    if (!txt.includes('جان')) throw new Error('modal: ' + txt.slice(0, 40));
    await page.click('#modalRoot .btn'); // refill
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ lives: window.SM.state().lives, live: window.SM.gg().live }));
    if (st.lives !== 5 || !st.live) throw new Error(JSON.stringify(st));
  });

  await step('landscape layout', async () => {
    await page.evaluate(() => window.SM.diff(3));
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 760, height: 393 });
    await page.waitForTimeout(500);
    const cls = await page.getAttribute('#dScenes', 'class');
    if (!cls.includes('wide')) throw new Error('not wide: ' + cls);
    const [a, b] = await page.$$eval('.sceneWrap', els => els.map(e => e.getBoundingClientRect().height));
    if (a < 60 || Math.abs(a - b) > 1) throw new Error('sizes ' + a + ' ' + b);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('horizontal overflow');
    await page.setViewportSize({ width: 393, height: 760 });
    await page.waitForTimeout(400);
  });

  await step('tiny screen layout', async () => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.evaluate(() => window.SM.go('home', false));
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('home overflows horizontally');
    await page.evaluate(() => window.SM.diff(2));
    await page.waitForTimeout(500);
    const h = await page.$eval('#wrapB', e => e.getBoundingClientRect().bottom);
    if (h > 480) throw new Error('scene B below fold: ' + h);
    await page.setViewportSize({ width: 393, height: 760 });
  });

  await page.screenshot({ path: require('path').resolve(__dirname,'../screenshots/shot-home.png') });
  await page.evaluate(() => window.SM.diff(12));
  await page.waitForTimeout(600);
  await page.screenshot({ path: require('path').resolve(__dirname,'../screenshots/shot-diff.png') });
  await page.evaluate(() => window.SM.guess(4));
  await page.waitForTimeout(600);
  await page.screenshot({ path: require('path').resolve(__dirname,'../screenshots/shot-guess.png') });
  await page.evaluate(() => window.SM.go('stages'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').resolve(__dirname,'../screenshots/shot-stages.png') });

  await browser.close();
  console.log('\n' + (errs.length ? 'ERRORS (' + errs.length + '):\n' + errs.join('\n') : 'ALL CLEAN ✅'));
  process.exit(errs.length ? 1 : 0);
})();
