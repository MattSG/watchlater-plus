// Real unpacked extension + Chromium. YouTube responses are fixtures, never an account.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'playwright');
const fixture = require('node:fs').readFileSync(
  path.join(root, 'test/fixtures/youtube.html'),
  'utf8',
);

(async () => {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const passed = [];
  const check = async (name, run) => {
    await run();
    passed.push(name);
    console.log(`PASS ${name}`);
  };
  const panel = page.locator('#wlp-panel');
  const count = page.locator('.wlp-count');
  const button = (action) => panel.locator(`[data-action="${action}"]`);
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });
  // No content-script injection or storage mocks: the manifest must do this itself.
  await context.route('https://www.youtube.com/**', (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html', body: fixture })
      : route.abort(),
  );
  try {
    await check(
      'Direct Watch Later load hides the native notice before toolbar initialization',
      async () => {
        await page.goto('https://www.youtube.com/playlist?list=WL');
        assert.deepEqual(
          await page.evaluate(() => window.noticeBeforeToolbar),
          { display: 'none', toolbarMounted: false },
        );
      },
    );
    await check('History has no Watch Later controls', async () => {
      await page.goto('https://www.youtube.com/feed/history');
      // Let the document_idle content script settle before asserting the negative case.
      await page.waitForTimeout(500);
      assert.equal(await panel.count(), 0);
      assert.equal(
        await page.locator('ytd-sort-filter-sub-menu-renderer').isVisible(),
        true,
      );
      assert.equal(await page.locator('#sidebar aside').isVisible(), true);
    });
    await check(
      'SPA navigation to Watch Later mounts the real extension',
      async () => {
        await page.evaluate(() => window.navigateFixture('/playlist?list=WL'));
        await panel.waitFor();
        await until(
          () =>
            window.lastNativeSort === 'Most popular' &&
            !document.querySelector('#wlp-sort').disabled,
        );
        assert.equal(await page.locator('#wlp-sort').inputValue(), 'popular');
        assert.equal(await page.locator('.wlp-select').count(), 3);
        assert.equal(await page.locator('#wlp-tools').isVisible(), false);
        assert.equal(
          await page.locator('ytd-sort-filter-sub-menu-renderer').isVisible(),
          false,
        );
        assert.equal(
          await page.locator('yt-sort-filter-sub-menu-renderer').isVisible(),
          false,
        );
        assert.equal(
          await page.locator('#sort-filter-menu').isVisible(),
          false,
        );
        assert.equal(
          await page.locator('yt-dropdown-menu-view-model').isVisible(),
          false,
        );
        assert.equal(await page.locator('#sidebar aside').isVisible(), false);
        assert.equal(
          await page
            .locator('#primary')
            .evaluate((el) => getComputedStyle(el).marginLeft),
          '0px',
        );
        assert.equal(
          await panel
            .getByRole('button', { name: 'Play all', exact: true })
            .isVisible(),
          true,
        );
        await panel
          .getByRole('button', { name: 'Play all', exact: true })
          .click();
        assert.equal(await page.evaluate(() => window.playAllClicked), true);
        await panel
          .getByRole('button', { name: 'Shuffle', exact: true })
          .click();
        assert.equal(await page.evaluate(() => window.shuffleClicked), true);
        assert.equal(await panel.locator('.wlp-playback button').count(), 2);
        assert.equal(
          await page.locator('.immersive-header-background').isVisible(),
          false,
        );
        assert.equal(await page.locator('#sidebar button').count(), 3);
        const notice = panel.locator('.wlp-warning');
        assert.ok((await notice.boundingBox()).height <= 28);
        assert.equal(
          await page.locator('ytd-alert-with-button-renderer').isVisible(),
          false,
        );
        assert.match(await notice.textContent(), /2 unavailable videos/);
      },
    );
    await check(
      'Sort, filter and selection work through browser controls',
      async () => {
        for (const [value, label] of [
          ['publishedNewest', 'Date published (newest)'],
          ['publishedOldest', 'Date published (oldest)'],
          ['addedNewest', 'Date added (newest)'],
          ['addedOldest', 'Date added (oldest)'],
          ['popular', 'Most popular'],
        ]) {
          await page.locator('#wlp-sort').selectOption(value);
          await until(
            (label) =>
              window.lastNativeSort === label &&
              !document.querySelector('#wlp-sort').disabled,
            label,
          );
          assert.equal(await page.locator('#wlp-sort').inputValue(), value);
        }
        await page.locator('#wlp-sort').selectOption('title');
        assert.equal(
          await page.locator('a#video-title').first().textContent(),
          'Apple tutorial',
        );
        await page.locator('#wlp-filter').selectOption('watched');
        await button('all').click();
        assert.match(await count.textContent(), /1 visible · 3 selected/);
        await button('none').click();
        await page.locator('#wlp-filter').selectOption('all');
      },
    );
    await check(
      'Warning persists when YouTube removes its source, and dismissal sticks',
      async () => {
        await page.evaluate(() =>
          document.querySelector('ytd-alert-with-button-renderer').remove(),
        );
        await until(() =>
          document
            .querySelector('.wlp-warning-text')
            .textContent.includes('2 unavailable videos'),
        );
        assert.equal(await panel.locator('.wlp-warning').isVisible(), true);
        await button('dismissNotice').click();
        await page.locator('#wlp-search').fill('Apple');
        await page.locator('#wlp-search').fill('');
        assert.equal(await panel.locator('.wlp-warning').isVisible(), false);
      },
    );
    await check(
      'Wide layout is compact and cleanup is disclosed on demand',
      async () => {
        const bounds = await panel.boundingBox();
        assert.ok(bounds.height < 170, `Toolbar is ${bounds.height}px tall`);
        await page.screenshot({
          path: path.join(output, 'wide-dark.png'),
          fullPage: true,
        });
        await page.evaluate(() =>
          document.documentElement.removeAttribute('dark'),
        );
        await page.screenshot({
          path: path.join(output, 'wide-light.png'),
          fullPage: true,
        });
        await page.evaluate(() =>
          document.documentElement.setAttribute('dark', ''),
        );
        await button('tools').click();
        assert.equal(
          await button('tools').getAttribute('aria-expanded'),
          'true',
        );
        assert.equal(await page.locator('#wlp-days').isVisible(), true);
        await page.locator('#wlp-days').fill('90');
        await button('age').click();
        assert.match(await count.textContent(), /0 selected/);
        await button('tools').click();
      },
    );
    await check(
      'Drawer arrow, interrupted animation and reduced motion stay in sync',
      async () => {
        await until(() => document.querySelector('#wlp-tools').hidden);
        await button('tools').click();
        await until(
          () =>
            document.querySelector('#wlp-tools').getAnimations().length === 0,
        );
        assert.equal(
          await button('tools').getAttribute('aria-expanded'),
          'true',
        );
        assert.equal(
          await button('tools')
            .locator('span')
            .evaluate((el) => getComputedStyle(el).transform),
          'matrix(-1, 0, 0, -1, 0, 0)',
        );
        await page.evaluate(() => {
          const button = document.querySelector('[data-action=tools]');
          button.click();
          button.click();
          button.click();
        });
        await until(() => document.querySelector('#wlp-tools').hidden);
        assert.equal(
          await button('tools').getAttribute('aria-expanded'),
          'false',
        );
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await button('tools').click();
        assert.equal(
          await page
            .locator('#wlp-tools')
            .evaluate((el) => el.getAnimations().length),
          0,
        );
        await button('tools').click();
        assert.equal(
          await page.locator('#wlp-tools').evaluate((el) => el.hidden),
          true,
        );
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      },
    );
    await check(
      'Checkbox selection and cancelled removal preserve videos',
      async () => {
        await page.locator('.wlp-select').first().check();
        page.once('dialog', (dialog) => dialog.dismiss());
        await button('remove').click();
        assert.equal(
          await page.locator('ytd-playlist-video-renderer').count(),
          3,
        );
        await button('none').click();
      },
    );
    await check(
      'Confirmed native-menu removal removes only the selected fixture',
      async () => {
        await button('tools').click();
        await button('watched').click();
        await button('tools').click();
        page.once('dialog', (dialog) => dialog.accept());
        await button('remove').click();
        await until(() =>
          document
            .querySelector('[role=status]')
            .textContent.includes('1 video removed'),
        );
        assert.equal(
          await page.locator('ytd-playlist-video-renderer').count(),
          2,
        );
      },
    );
    await check(
      'Recovery links persist across pages and export successfully',
      async () => {
        await button('tools').click();
        await panel.locator('.wlp-recovery summary').click();
        assert.equal(await panel.locator('.wlp-recovery-list a').count(), 1);
        assert.match(
          await panel.locator('.wlp-recovery-list').textContent(),
          /Removed/,
        );
        const pending = page.waitForEvent('download');
        await button('exportRecovery').click();
        const downloaded = await pending;
        await downloaded.saveAs(path.join(output, 'recovery.txt'));
        assert.match(
          await fs.readFile(path.join(output, 'recovery.txt'), 'utf8'),
          /watch\?v=a/,
        );
        const anotherPage = await context.newPage();
        try {
          await anotherPage.goto('https://www.youtube.com/playlist?list=WL');
          await anotherPage
            .locator('.wlp-recovery-list a')
            .waitFor({ state: 'attached' });
          assert.match(
            await anotherPage
              .locator('.wlp-recovery-list a')
              .getAttribute('href'),
            /watch\?v=a/,
          );
        } finally {
          await anotherPage.close();
        }
        await button('tools').click();
      },
    );
    await check(
      'Channel selection and session filtering report watch time',
      async () => {
        await button('tools').click();
        await page.locator('#wlp-channel').selectOption('Example channel');
        await button('channel').click();
        assert.match(await count.textContent(), /2 selected/);
        assert.match(
          await panel.locator('.wlp-watch-time').textContent(),
          /Selected: 4m \+ 1 unknown/,
        );
        await button('none').click();
        await page.locator('#wlp-session').fill('10');
        assert.equal(await page.locator('#wlp-filter').inputValue(), 'session');
        assert.match(await count.textContent(), /1 visible/);
        await page.locator('#wlp-filter').selectOption('all');
        await button('tools').click();
      },
    );
    await check('Lazy-loaded rows receive checkboxes', async () => {
      await page.locator('#wlp-sort').selectOption('reverse');
      await page.locator('#wlp-search').fill('no matches');
      await page
        .locator('#wlp-footer')
        .getByRole('button', { name: 'Load more', exact: true })
        .click();
      assert.equal(await page.locator('#wlp-sort').inputValue(), 'original');
      assert.equal(await page.locator('#wlp-search').inputValue(), '');
      await page.evaluate(() => window.addFixtureRow());
      await until(() => document.querySelectorAll('.wlp-select').length === 3);
      assert.equal(
        await page
          .locator('#wlp-footer')
          .evaluate((el) => el.previousElementSibling.id),
        'playlist',
      );
      assert.equal(await panel.locator('[data-action=load]').count(), 1);
      assert.equal(await panel.locator('[data-action=load]').isVisible(), true);
      await page.evaluate(
        () =>
          (document.querySelector('ytd-continuation-item-renderer').hidden =
            true),
      );
      await until(() => document.querySelector('#wlp-footer').hidden);
      assert.equal(
        await panel.locator('[data-action=load]').isVisible(),
        false,
      );
      await page.evaluate(
        () =>
          (document.querySelector('ytd-continuation-item-renderer').hidden =
            false),
      );
      await until(() => !document.querySelector('#wlp-footer').hidden);
      await page.evaluate(() =>
        document.querySelector('ytd-continuation-item-renderer').remove(),
      );
      await until(() => document.querySelector('#wlp-footer').hidden);
      assert.equal(
        await panel.locator('[data-action=load]').isVisible(),
        false,
      );
    });
    await check(
      'Load entire playlist consumes continuations and supports Stop',
      async () => {
        await page.evaluate(() => {
          const list = document.querySelector('#playlist');
          const next = document.createElement('ytd-continuation-item-renderer');
          const trigger = document.createElement('button');
          trigger.textContent = 'Native load';
          next.append(trigger);
          list.append(next);
          let batch = 0;
          trigger.onclick = () => {
            if (!window.autoLoadFixture) return;
            window.autoLoadFixture = false;
            setTimeout(() => {
              const row = list
                .querySelector('ytd-playlist-video-renderer')
                .cloneNode(true);
              row.querySelector('.wlp-select')?.remove();
              row.removeAttribute('data-wlp-order');
              row.querySelector('a#video-title').href =
                '/watch?v=auto' + ++batch;
              list.insertBefore(row, next);
              next.remove();
            }, 100);
          };
        });
        await until(
          () => !document.querySelector('[data-action=loadAll]').hidden,
        );
        await button('tools').click();
        await button('loadAll').click();
        await page.locator('#wlp-footer [data-action=stopLoad]').click();
        await until(() =>
          document
            .querySelector('[role=status]')
            .textContent.includes('Loading stopped'),
        );
        await page.evaluate(() => (window.autoLoadFixture = true));
        await button('loadAll').click();
        await until(() =>
          document
            .querySelector('[role=status]')
            .textContent.includes('Playlist loaded: 4'),
        );
        assert.equal(await page.locator('.wlp-select').count(), 4);
        assert.equal(await page.locator('#wlp-footer').isVisible(), false);
        await button('tools').click();
      },
    );
    await check('Link export downloads a usable text file', async () => {
      await button('tools').click();
      const pending = page.waitForEvent('download');
      await button('export').click();
      const download = await pending;
      await download.saveAs(path.join(output, 'export.txt'));
      const exported = await fs.readFile(
        path.join(output, 'export.txt'),
        'utf8',
      );
      assert.match(exported, /https:\/\/www.youtube.com\/watch\?v=b/);
      await button('tools').click();
    });
    await check('Narrow dark and light layouts do not overflow', async () => {
      await page.setViewportSize({ width: 480, height: 1000 });
      for (const theme of ['dark', 'light']) {
        await page.evaluate(
          (dark) => document.documentElement.toggleAttribute('dark', dark),
          theme === 'dark',
        );
        await until(
          () =>
            document.querySelector('#wlp-panel').getBoundingClientRect().width <
            480,
        );
        const overflow = await panel.evaluate((el) => {
          const parent = el.getBoundingClientRect();
          return [...el.querySelectorAll('button,input,select')]
            .filter((child) => child.getClientRects().length)
            .some((child) => {
              const r = child.getBoundingClientRect();
              return r.right > parent.right + 1 || r.left < parent.left - 1;
            });
        });
        assert.equal(overflow, false);
        await page.screenshot({
          path: path.join(output, `narrow-${theme}.png`),
          fullPage: true,
        });
        await button('tools').click();
        assert.ok(await page.locator('#wlp-days').isVisible());
        await button('tools').click();
      }
    });
    await check(
      'Leaving Watch Later cleans up toolbar and checkboxes',
      async () => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.evaluate(() => window.navigateFixture('/feed/history'));
        await panel.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.wlp-select').count(), 0);
        assert.equal(await page.locator('#wlp-footer').count(), 0);
        assert.equal(
          await page.locator('ytd-sort-filter-sub-menu-renderer').isVisible(),
          true,
        );
        assert.equal(
          await page.locator('yt-sort-filter-sub-menu-renderer').isVisible(),
          true,
        );
        assert.equal(await page.locator('#sort-filter-menu').isVisible(), true);
        assert.equal(
          await page.locator('yt-dropdown-menu-view-model').isVisible(),
          true,
        );
        assert.equal(await page.locator('#sidebar aside').isVisible(), true);
        assert.equal(
          await page
            .locator('#sidebar')
            .getByRole('button', { name: 'Play all', exact: true })
            .count(),
          2,
        );
        assert.equal(
          await page.locator('.immersive-header-background').isVisible(),
          true,
        );
      },
    );
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify(
        {
          passed,
          errors,
          scope:
            'Actual unpacked extension on intercepted YouTube fixture pages; no signed-in account tested.',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await page.screenshot({
      path: path.join(output, 'failure.png'),
      fullPage: true,
    });
    throw error;
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
