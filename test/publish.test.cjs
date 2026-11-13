const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publishChrome } = require('../scripts/publish-chrome.cjs');
const config = {
  clientId: 'id',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  publisherId: 'publisher',
  extensionId: 'item',
};

test('Chrome upload polls processing and does not publish by default', async () => {
  const calls = [];
  const replies = [
    { access_token: 'test-token' },
    { uploadState: 'IN_PROGRESS' },
    { lastAsyncUploadState: 'SUCCEEDED' },
  ];
  await publishChrome(
    config,
    Buffer.from('zip'),
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => replies.shift() };
    },
    async () => {},
  );
  assert.equal(calls.length, 3);
  assert.match(
    calls[1].url,
    /\/upload\/v2\/publishers\/publisher\/items\/item:upload$/,
  );
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');
});

test('Chrome review submission is explicit and blocks warnings', async () => {
  const calls = [];
  const replies = [
    { access_token: 'test-token' },
    { uploadState: 'SUCCEEDED' },
    {},
  ];
  await publishChrome(
    { ...config, publish: true },
    Buffer.from('zip'),
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => replies.shift() };
    },
  );
  assert.match(calls[2].url, /:publish$/);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    blockOnWarnings: true,
  });
});

test('Missing credentials and failed uploads cannot publish', async () => {
  await assert.rejects(publishChrome({}, Buffer.from('zip')), /Missing Chrome/);
  let count = 0;
  await assert.rejects(
    publishChrome(
      { ...config, publish: true },
      Buffer.from('zip'),
      async () => ({
        ok: true,
        json: async () =>
          ++count === 1 ? { access_token: 'test' } : { uploadState: 'FAILED' },
      }),
    ),
    /did not succeed/,
  );
  assert.equal(count, 2);
});
