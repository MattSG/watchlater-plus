# Releases and store publishing

CI runs ESLint, formatting, unit tests, packaging, Mozilla validation, and Chrome
and Firefox browser harnesses. ZIP artifacts contain only the manifest, extension
code, styles and license. No tests, profiles, credentials or node_modules ship.

## Build a release

1. Bump `version` in both `package.json` and `manifest.json`, then run `npm install --package-lock-only`.
2. Run `npm run validate`, `npm run test:browser`, and `npm run test:firefox`.
3. Commit and push. Create a matching tag, for example `v0.1.0`, and push it.
4. Download the ZIPs from the CI artifact or use the files in `dist/`.

The store workflow is manually dispatched from **Actions → Publish extension**.
Select the version tag and store. Chrome defaults to uploading a draft; enable
**publish** to submit for review. Firefox submits only when **publish** is enabled.
It does not release on every push. Store review can still reject a submission.

## Chrome Web Store

Create a developer account, enable two-step verification, and upload the first
Chrome ZIP in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Complete the store listing, screenshots and Privacy tabs. Use
[PRIVACY.md](PRIVACY.md) as the privacy policy. The API updates an existing item;
it does not replace these initial dashboard steps.

Enable Chrome Web Store API in a Google Cloud project, configure an OAuth client,
and obtain a refresh token for the owning developer account with the
`https://www.googleapis.com/auth/chromewebstore` scope. Follow
[Google's API setup guide](https://developer.chrome.com/docs/webstore/using-api).

In the repository's **extension-stores** GitHub environment, set:

| Kind     | Name                   |
| -------- | ---------------------- |
| Secret   | `CHROME_CLIENT_ID`     |
| Secret   | `CHROME_CLIENT_SECRET` |
| Secret   | `CHROME_REFRESH_TOKEN` |
| Variable | `CHROME_PUBLISHER_ID`  |
| Variable | `CHROME_EXTENSION_ID`  |

The workflow uses API v2. It uploads the ZIP, checks processing, and submits only
if requested. Credentials stay in step environment variables and are not logged.
Google may retain existing listing visibility and rollout settings. Version
numbers must increase for each update.

## Firefox Add-ons

The Firefox build declares `watchlater-plus@mattsg` as its stable add-on ID,
requires Firefox 142+, and declares no external data collection. Once listed,
keep that ID unchanged. The Chrome build omits Firefox-only metadata.

Obtain credentials from [AMO API keys](https://addons.mozilla.org/developers/addon/api/key/)
and set these secrets in the **extension-stores** environment:

- `WEB_EXT_API_KEY`
- `WEB_EXT_API_SECRET`

The workflow runs `web-ext sign --channel listed` using `amo-metadata.json`.
The first submission may require additional listing details in the AMO dashboard.
See [Mozilla's signing reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign).

Unsigned ZIPs can be loaded temporarily through `about:debugging`. Permanent
installation in normal Firefox requires Mozilla signing; GitHub packaging alone
does not produce a signed XPI.
