const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync } = require('fflate');
const { publishChrome } = require('../scripts/publish-chrome.cjs');
const options = {
  bytes: zipSync({
    'manifest.json': Buffer.from(
      JSON.stringify({ name: 'Watch Later+', version: '2026.11.14.6' }),
    ),
  }),
  version: '2026.11.14.6',
  publisher: '5ccd01dc-065c-420a-a91a-188a60ba504f',
  item: 'cdldkcnknmpifebmelhpncicccmgngmo',
  credentials: {
    clientId: 'client',
    clientSecret: 'secret',
    refreshToken: 'refresh',
  },
  wait: async () => {},
};
test('Chrome upload waits for processing before submitting', async () => {
  const calls = [];
  const replies = [
    { access_token: 'token' },
    { uploadState: 'IN_PROGRESS' },
    { uploadState: 'SUCCEEDED' },
    { state: 'PENDING_REVIEW' },
  ];
  const result = await publishChrome({
    ...options,
    request: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => replies.shift() };
    },
  });
  assert.equal(result.state, 'PENDING_REVIEW');
  assert.ok(calls[1].url.includes('/upload/v2/'));
  assert.equal(calls[1].init.body, options.bytes);
  assert.ok(calls[2].url.endsWith(':fetchStatus'));
  assert.ok(calls[3].url.endsWith(':publish'));
});
test('Chrome failed upload never publishes and errors do not expose response secrets', async () => {
  let calls = 0;
  await assert.rejects(
    publishChrome({
      ...options,
      request: async () => ({
        ok: true,
        json: async () =>
          ++calls === 1 ? { access_token: 'token' } : { uploadState: 'FAILED' },
      }),
    }),
    /upload did not succeed/,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    publishChrome({
      ...options,
      request: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ secret: 'private' }),
      }),
    }),
    /^Error: Chrome API request failed \(HTTP 401\)\.$/,
  );
});
test('Chrome package mismatch fails before contacting Google', async () => {
  await assert.rejects(
    publishChrome({
      ...options,
      version: '2026.11.14.7',
      request: async () => {
        throw new Error('Must not contact Google');
      },
    }),
    /does not match/,
  );
});
