const { readFile } = require('node:fs/promises');
const { unzipSync } = require('fflate');
const { setTimeout: delay } = require('node:timers/promises');

async function publishChrome({
  bytes,
  version,
  publisher,
  item,
  credentials,
  request = fetch,
  wait = delay,
}) {
  if (!/^[a-p]{32}$/.test(item) || !/^[\da-f-]{36}$/i.test(publisher))
    throw new Error('Invalid Chrome publisher or item ID.');
  if (
    !credentials.clientId ||
    !credentials.clientSecret ||
    !credentials.refreshToken
  )
    throw new Error('Chrome OAuth credentials are missing.');
  const manifest = JSON.parse(
    Buffer.from(unzipSync(bytes)['manifest.json'] || []).toString(),
  );
  if (
    !version ||
    manifest.version !== version ||
    manifest.name !== 'Watch Later+' ||
    manifest.browser_specific_settings
  )
    throw new Error(
      'Chrome release package does not match the expected version or browser.',
    );
  async function json(url, options) {
    const response = await request(url, {
      ...options,
      signal: AbortSignal.timeout(60000),
    });
    // Do not print response bodies: OAuth failures can contain sensitive details.
    if (!response.ok)
      throw new Error(`Chrome API request failed (HTTP ${response.status}).`);
    return response.json();
  }
  const token = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!token.access_token)
    throw new Error('Google did not return an access token.');
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const resource = `v2/publishers/${publisher}/items/${item}`;
  const base = 'https://chromewebstore.googleapis.com/';
  let status = await json(`${base}upload/${resource}:upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: bytes,
  });
  for (
    let attempt = 0;
    status.uploadState === 'IN_PROGRESS' && attempt < 30;
    attempt++
  ) {
    await wait(2000);
    status = await json(`${base}${resource}:fetchStatus`, { headers });
  }
  if (status.uploadState !== 'SUCCEEDED')
    throw new Error(
      'Chrome upload did not succeed; publication was not requested.',
    );
  const result = await json(`${base}${resource}:publish`, {
    method: 'POST',
    headers,
  });
  return result;
}

if (require.main === module) {
  (async () => {
    const result = await publishChrome({
      bytes: await readFile(process.argv[2]),
      version: process.env.RELEASE_VERSION,
      publisher: process.env.CHROME_PUBLISHER_ID,
      item: process.env.CHROME_EXTENSION_ID,
      credentials: {
        clientId: process.env.CHROME_CLIENT_ID,
        clientSecret: process.env.CHROME_CLIENT_SECRET,
        refreshToken: process.env.CHROME_REFRESH_TOKEN,
      },
    });
    console.log(
      `Chrome submission accepted${result.state ? ': ' + result.state : '.'} Google review still applies.`,
    );
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { publishChrome };
