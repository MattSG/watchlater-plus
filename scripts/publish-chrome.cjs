const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function publishChrome(
  config,
  archive,
  request = fetch,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (const key of [
    'clientId',
    'clientSecret',
    'refreshToken',
    'publisherId',
    'extensionId',
  ]) {
    if (!config[key])
      throw new Error(`Missing Chrome store configuration: ${key}`);
  }
  async function json(url, options) {
    const response = await request(url, {
      ...options,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(
        `Chrome store request failed (HTTP ${response.status}). Check credentials and the developer dashboard.`,
      );
    return response.json();
  }
  const token = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!token.access_token)
    throw new Error('Google did not return an access token.');
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const name = `publishers/${encodeURIComponent(config.publisherId)}/items/${encodeURIComponent(config.extensionId)}`;
  let uploaded = await json(
    `https://chromewebstore.googleapis.com/upload/v2/${name}:upload`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/zip' },
      body: archive,
    },
  );
  for (
    let attempt = 0;
    uploaded.uploadState === 'IN_PROGRESS' && attempt < 30;
    attempt++
  ) {
    await pause(2000);
    const status = await json(
      `https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`,
      { headers },
    );
    uploaded = { uploadState: status.lastAsyncUploadState };
  }
  if (uploaded.uploadState !== 'SUCCEEDED')
    throw new Error(`Chrome upload did not succeed: ${uploaded.uploadState}`);
  if (config.publish) {
    await json(`https://chromewebstore.googleapis.com/v2/${name}:publish`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockOnWarnings: true }),
    });
  }
  return { submitted: !!config.publish };
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const { version } = require('../package.json');
  const config = {
    clientId: process.env.CHROME_CLIENT_ID,
    clientSecret: process.env.CHROME_CLIENT_SECRET,
    refreshToken: process.env.CHROME_REFRESH_TOKEN,
    publisherId: process.env.CHROME_PUBLISHER_ID,
    extensionId: process.env.CHROME_EXTENSION_ID,
    publish: process.env.CHROME_PUBLISH === 'true',
  };
  const result = await publishChrome(
    config,
    await readFile(
      path.join(root, 'dist', `watchlater-plus-chrome-${version}.zip`),
    ),
  );
  console.log(
    result.submitted
      ? 'Submitted to Chrome Web Store review.'
      : 'Uploaded to Chrome Web Store as a draft.',
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { publishChrome };
