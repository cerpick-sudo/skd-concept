const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const site = path.resolve(__dirname, '../site');
const prefix = '/skd-concept/';
const scenes = ['intro', 'task', 'fleet', 'effect', 'tariff', 'launch', 'decision'];
const mime = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const file = path.resolve(site, relative);
  if (!url.pathname.startsWith(prefix) || !file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  const options = {headless: true};
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  let browser;
  try {
    browser = await chromium.launch(options);
    const context = await browser.newContext({reducedMotion: 'reduce'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if (response.status() !== 200) errors.push(`${response.status()} ${response.url()}`);});
    await page.route('**/*', route => {
      if (route.request().url().startsWith(base)) return route.continue();
      errors.push('Unexpected external request: ' + route.request().url());
      return route.abort();
    });
    for (const [width, height] of [[1366, 768], [390, 844], [683, 384]]) {
      await page.setViewportSize({width, height});
      await page.goto(base);
      await page.evaluate(() => document.fonts.ready);
      const overview = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        badImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length,
        font: document.fonts.check('16px Inter'),
        scenes: [...document.querySelectorAll('.scene')].filter(s => getComputedStyle(s).display !== 'none').map(s => s.id)
      }));
      assert.deepEqual(overview.scenes, scenes);
      assert(overview.content <= overview.width + 1);
      assert.equal(overview.badImages, 0);
      assert(overview.font);
      for (const model of ['rent', 'mixed', 'owned']) {
        await page.locator('#tab-' + model).click();
        assert.equal(await page.locator('.fleet-panel:visible').getAttribute('id'), 'panel-' + model);
      }
      await page.locator('#present-toggle').click();
      for (const [index, scene] of scenes.entries()) {
        if (index) await page.locator('#slide-next').click();
        const state = await page.evaluate(() => ({
          active: document.querySelector('.active-slide').id,
          focus: document.activeElement.id,
          counter: document.querySelector('#slide-count').textContent,
          visible: [...document.querySelectorAll('.scene')].filter(s => getComputedStyle(s).display !== 'none').map(s => s.id),
          overflow: [...document.querySelectorAll('.active-slide')].some(s => s.scrollWidth > s.clientWidth + 1)
        }));
        assert.equal(state.active, scene);
        assert.equal(state.focus, scene);
        assert.equal(state.counter, `0${index + 1} / 07`);
        assert.deepEqual(state.visible, [scene]);
        assert.equal(state.overflow, false);
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#present-toggle').getAttribute('aria-pressed'), 'false');
      console.log(`PASS ${width}x${height}: resources, layout, three fleet tabs, seven slides, focus, exit`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: no failed or external resource requests; no runtime errors');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
