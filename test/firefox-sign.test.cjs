const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync } = require('fflate');
const { unpackPackage } = require('../scripts/sign-firefox.cjs');

const manifest = {
  version: '2026.11.13.4',
  browser_specific_settings: { gecko: { id: 'watchlater-plus@mattsg' } },
};
const archive = (extra) =>
  zipSync({
    'manifest.json': Buffer.from(JSON.stringify(manifest)),
    'content.js': Buffer.from('// code'),
    ...extra,
  });
test('Firefox signing verifies release identity and discards previous signatures', () => {
  const files = unpackPackage(
    archive({ 'META-INF/mozilla.rsa': Buffer.from('old') }),
    manifest.version,
  );
  assert.equal(files['META-INF/mozilla.rsa'], undefined);
  assert.ok(files['content.js']);
  assert.throws(
    () => unpackPackage(archive({}), '2026.11.13.99'),
    /does not match/,
  );
});
test('Firefox signing rejects archive path traversal', () => {
  assert.throws(
    () =>
      unpackPackage(
        archive({ '../bad.js': Buffer.from('bad') }),
        manifest.version,
      ),
    /Unsafe path/,
  );
});
