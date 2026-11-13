# Watch Later+

A Chrome and Firefox extension that puts a cleanup toolbar and selection checkboxes directly on YouTube's desktop Watch Later playlist. No server, account setup, or API key.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open or refresh <https://www.youtube.com/playlist?list=WL> while signed into YouTube.

After changing extension files, click **Reload** on its Chrome extensions card and refresh YouTube.

For Firefox 142+, run `npm ci` and `npm run build`, then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Temporary installations last until Firefox exits. The Firefox ZIP in CI artifacts is unsigned; permanent installation requires AMO signing. See [publishing instructions](PUBLISHING.md).

## Features

- **Most popular** is the default. The dropdown also offers date published (newest/oldest), date added (newest/oldest), and manual playlist order through YouTube's native sort menu. These depend on the options YouTube exposes for your account and may retain YouTube's sort preference. Missing/unsupported menus report an error rather than inventing dates or popularity scores.
- Additional local sorts cover reverse playlist order, title, channel, and duration for loaded videos. These do not reorder the saved playlist.
- Search titles and channels; filter fully watched videos, videos with no visible progress, short videos, and long videos.
- Select individual checkboxes or **Select all** loaded videos, including videos hidden by the current filter. Selection survives filtering; the selected count includes hidden selections.
- **Select fully watched**, review the checkboxes, then **Remove selected**. Only videos with a visible 100% playback bar qualify. Partial progress and unknown progress are never treated as complete.
- **Select old** selects videos first seen by the extension more than your chosen number of days ago. YouTube does not reliably expose the original save date in the visible list, so existing videos start aging when first observed. This is not upload age or historical save age.
- Export loaded titles and links to a text file before cleaning up.
- Watch-time totals show the full combined duration of visible and selected videos. Unknown/live durations are counted separately; these are not remaining-playback estimates.
- Under **Cleanup & tools**, choose a channel and **Select channel** to select every loaded video from it, including filtered videos. Review selection before removal.
- Set **Session length (minutes)** to filter videos whose full duration fits your time budget. Unknown durations are excluded. You can also choose **Fits session** in the main filter dropdown.
- **Load entire playlist** follows YouTube's continuation markers automatically and reports the loaded count. **Stop loading** is available in the drawer and at the bottom. Loading stops on navigation or after 15 seconds without progress; it never removes videos.
- **Recovery list** saves each video's title, channel, link ID and timestamp locally before its removal is attempted. A failed save stops removal. Entries distinguish confirmed removals from attempts whose outcome needs checking. Open links to manually save videos back to Watch Later, export the list, or clear it with confirmation. This is not automatic undo.
- **Load more** clears search and filters, restores the current YouTube order when a local sort was active, and scrolls to YouTube's continuation marker to trigger lazy loading. Repeat until the videos you want are loaded.
- Removal asks for confirmation, runs sequentially, reports progress, and offers **Stop**. It stops on an unexpected page state or missing confirmation. There is no automatic undo; exported links are a reference, not an automatic restore.

Selection, cleanup, export and local sorts cover **loaded videos only**, not the entire account or unloaded portion of a playlist. Native YouTube sort options request the playlist order from YouTube. Fully watched detection depends on the progress YouTube renders; absent/stale indicators can miss watched videos. Refresh YouTube to reset the view to most popular.

The compact toolbar follows YouTube's light/dark theme. Open **Cleanup & tools** for watched/age selection and link export. **Load more** appears in both the toolbar and below the video list only while YouTube exposes a playlist continuation; both disappear at the end. History (`/feed/history`) is not modified; use the Watch Later link above.

## Compatibility and privacy

This first version supports desktop `www.youtube.com` and English **Remove from Watch later** menu text. Unsupported menu layouts/languages stop the queue rather than guessing. YouTube can change its markup, so real-account validation is required before relying on bulk removal.

The extension uses a Manifest V3 isolated content script and the `storage` permission. It loads on YouTube pages so it can notice navigation into Watch Later without a full refresh; controls appear only on `/playlist?list=WL`. It uses the existing page's native removal menu. No private write APIs, analytics, remote code, external requests, or credentials are used by the extension. YouTube handles its normal account requests.

Video IDs and first-seen timestamps are saved locally in Chrome's extension storage. Recovery entries also store titles, channel names, timestamps and removal outcomes; they stay until you clear the recovery list or uninstall the extension. No account tokens or browsing history are stored or sent elsewhere by the extension.

## Development

Node.js 22.13+. The browser harnesses use isolated test profiles and downloaded test browsers:

```sh
npm ci
npm run validate
npm test
npm run check
npx playwright install chromium firefox
npm run test:browser
npm run test:firefox
```

Tests cover parsing/filtering, unknown values, age boundaries, toolbar mounting, sorting, selection, native-menu removal, cancellation, and YouTube navigation using a simulated DOM. They do not establish compatibility with a live signed-in YouTube account.

The Playwright harness loads the **actual unpacked extension** into an isolated Chromium profile and intercepts YouTube page requests with controlled fixtures. It tests manifest injection, History exclusion, SPA navigation, sorting/filtering, checkboxes, removal confirmation, fixture removal, lazy-loaded rows, export, and responsive light/dark layouts. It never uses a signed-in account or deletes real videos. Screenshots and results are written to `output/playwright/`. Temporary test profiles also stay there; the directory is ignored by Git.

Before a release, load unpacked in Chrome and check: entering Watch Later via YouTube navigation; a long playlist loading more rows; native menu compatibility; one disposable removal; Stop; and light/dark modes. Do not publish a Chrome Web Store release based on fixture tests alone.

Platform references: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [YouTube's native removal workflow](https://support.google.com/youtube/answer/56101?ctx=topic&hl=en).

## License

[MIT](LICENSE). Privacy details are in [PRIVACY.md](PRIVACY.md).
