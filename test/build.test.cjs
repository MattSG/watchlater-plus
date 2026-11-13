const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { unzipSync } = require('fflate');
const { build, calver } = require('../scripts/build.cjs');

test('CalVer uses UTC and a browser-compatible build sequence', () => {
  assert.equal(calver(new Date('2026-11-13T23:00:00Z'), 42), '2026.11.13.42');
  assert.equal(calver(new Date('2026-01-02T00:00:00Z'), 0), '2026.1.2.0');
  for (const sequence of [-1, 1.5, 'invalid', 65536])
    assert.throws(() => calver(new Date(), sequence), /Build number/);
});

test('browser packages contain only runtime files and correct browser metadata', async () => {
  const version = await build();
  for (const browser of ['chrome', 'firefox']) {
    const archive = unzipSync(
      await readFile(
        path.join(
          __dirname,
          '..',
          'dist',
          `watchlater-plus-${browser}-${version}.${browser === 'firefox' ? 'xpi' : 'zip'}`,
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
