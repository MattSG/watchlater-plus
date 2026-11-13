const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { build } = require('../scripts/build.cjs');

test('browser packages contain only runtime files and correct browser metadata', async () => {
  await build();
  const { version } = require('../package.json');
  for (const browser of ['chrome', 'firefox']) {
    const archive = unzipSync(
      await readFile(
        path.join(
          __dirname,
          '..',
          'dist',
          `watchlater-plus-${browser}-${version}.zip`,
        ),
      ),
    );
    assert.deepEqual(Object.keys(archive).sort(), [
      'LICENSE',
      'content.css',
      'content.js',
      'core.js',
      'manifest.json',
    ]);
    const manifest = JSON.parse(
      Buffer.from(archive['manifest.json']).toString(),
    );
    assert.equal(manifest.version, version);
    assert.deepEqual(manifest.content_scripts[0].matches, [
      'https://www.youtube.com/*',
    ]);
    if (browser === 'firefox') {
      assert.equal(
        manifest.browser_specific_settings.gecko.id,
        'watchlater-plus@mattsg',
      );
      assert.deepEqual(
        manifest.browser_specific_settings.gecko.data_collection_permissions
          .required,
        ['none'],
      );
    } else assert.equal(manifest.browser_specific_settings, undefined);
  }
});
