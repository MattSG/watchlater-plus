// Firefox installs the built add-on into a temporary profile. Only this test copy
// gains loopback access so fixtures need no YouTube account or HTTPS interception.
const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const { readFile, writeFile, mkdtemp, mkdir } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { zipSync } = require('fflate');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'output', 'firefox');
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, 'addon-'));
  const manifest = JSON.parse(
    await readFile(path.join(root, 'dist/firefox/manifest.json'), 'utf8'),
  );
  manifest.content_scripts[0].matches.push('http://127.0.0.1/*');
  const entries = { 'manifest.json': Buffer.from(JSON.stringify(manifest)) };
  for (const file of ['core.js', 'content.js', 'content.css', 'LICENSE'])
    entries[file] = await readFile(path.join(root, 'dist/firefox', file));
  const addon = path.join(temporary, 'test.xpi');
  await writeFile(addon, zipSync(entries));
  const fixture = await readFile(path.join(root, 'test/fixtures/youtube.html'));
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(fixture);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let driver;
  try {
    const options = new firefox.Options().addArguments('-headless');
    options.setBinary(
      process.env.FIREFOX_BINARY ||
        require('playwright').firefox.executablePath(),
    );
    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .build();
    await driver.installAddon(addon, true);
    const base = `http://127.0.0.1:${server.address().port}`;
    await driver.get(`${base}/playlist?list=WL`);
    await driver.wait(until.elementLocated(By.id('wlp-panel')), 15000);
    await driver.wait(
      () =>
        driver.executeScript(
          "return window.lastNativeSort === 'Most popular' && !document.querySelector('#wlp-sort').disabled",
        ),
      10000,
    );
    assert.equal(
      await driver.executeScript('return window.noticeBeforeToolbar.display'),
      'none',
    );
    await driver.findElement(By.css('[data-action=all]')).click();
    assert.match(
      await driver.findElement(By.css('.wlp-count')).getText(),
      /3 selected/,
    );
    await driver.findElement(By.css('[data-action=tools]')).click();
    await driver.findElement(By.id('wlp-session')).clear();
    await driver.findElement(By.id('wlp-session')).sendKeys('5');
    assert.match(
      await driver.findElement(By.css('.wlp-count')).getText(),
      /1 visible/,
    );
    await writeFile(
      path.join(output, 'firefox.png'),
      await driver.takeScreenshot(),
      'base64',
    );
    await driver.executeScript("window.navigateFixture('/feed/history')");
    await driver.wait(
      () =>
        driver.executeScript("return !document.querySelector('#wlp-panel')"),
      5000,
    );
    console.log(
      'PASS Firefox: real add-on injection, native sort, selection, session filter, navigation cleanup',
    );
  } catch (error) {
    if (driver)
      console.error(
        await driver.executeScript(
          "return {url:location.href, marker:document.documentElement.hasAttribute('data-wlp-watch-later'), rows:document.querySelectorAll('ytd-playlist-video-renderer').length}",
        ),
      );
    throw error;
  } finally {
    if (driver) await driver.quit();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
