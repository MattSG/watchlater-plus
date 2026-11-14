# Build and test

CI validates the source, then runs separate Chromium and Firefox jobs. Each job
uploads one browser package directly, without another ZIP wrapper:

- **watchlater-plus-chrome-YYYY.M.D.build.zip** — extract and load the folder through `chrome://extensions`.
- **watchlater-plus-firefox-YYYY.M.D.build.xpi** — select the XPI in `about:debugging` → **Load Temporary Add-on**.

Build artifacts are unsigned development packages. Firefox temporary
installations last until the browser exits. Firefox releases can optionally be
signed for self-distribution without a public store listing.

After both browser jobs pass on `main`, CI creates a GitHub Release with the two
files attached. Pull requests build and test packages without creating releases.

## Local checks

Node.js 22.13+:

```sh
npm ci
npm run validate
npx playwright install chromium firefox
npm run test:browser
npm run test:firefox
```

`npm run build` writes the two browser directories and packages to `dist/` using a
runtime-file allowlist. The Firefox manifest includes its add-on ID and Firefox
142+ requirement. Tests use sample pages and isolated profiles, never your account.

CI uses Node 26.13.1. Actions are SHA-pinned and recorded in
`.github/actions-lock.json`; update both together. `npm run lint:actions` checks
the pins, and `.gitattributes` keeps Windows checkouts in LF format.

Packages use UTC CalVer: `YYYY.M.D.build`. CI uses its workflow run number for
`build`; local builds use `0`. Both browsers receive the same version. Re-running
the same workflow on the same date produces the same version.

Chrome still requires **Load unpacked** for a local development extension.
Unsigned Firefox XPI files remain temporary; renaming a ZIP to XPI does not
remove Mozilla's signing requirement.

## Firefox signing

The **Sign Firefox release** workflow signs an existing GitHub release through
Mozilla's **unlisted** channel. It verifies the add-on ID and CalVer version,
checks permanent installation in Firefox, then replaces that release's unsigned
Firefox asset with the signed XPI. Chrome is unchanged.

Create [Mozilla API credentials](https://addons.mozilla.org/developers/addon/api/key/)
and set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` as secrets in the repository's
**firefox-signing** environment. Run the workflow with a release tag or `latest`.
Mozilla may queue a submission for review; a timeout leaves the existing asset
unchanged.

After the first successful signing, set repository variable
`FIREFOX_SIGNING_ENABLED` to `true` to sign future main-branch releases
automatically. Credentials are never used on pull requests.

Install a signed XPI through `about:addons` → **Install Add-on From File**.
Signing does not create a public AMO listing. See
[Mozilla's distribution guide](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

## Chrome Store deployment

The **Deploy Chrome release** workflow uploads an existing release ZIP and
submits it for Google review. It targets `cdldkcnknmpifebmelhpncicccmgngmo`.
The existing public listing and visibility are preserved.

Follow [Google's OAuth setup](https://developer.chrome.com/docs/webstore/using-api)
and add `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN`
as secrets in the **chrome-publishing** GitHub environment. Use your own OAuth
client in OAuth Playground with the `https://www.googleapis.com/auth/chromewebstore`
scope. Use an OAuth app in production for durable refresh tokens; external apps
in testing can issue tokens that expire after seven days.

Run the workflow manually with a release tag or `latest` for the first submission.
After success, set repository variable `CHROME_PUBLISHING_ENABLED=true` to submit
future main-branch releases automatically after both browser checks pass.
Publication still depends on Google review. Never put credentials in source files.
