# Build and test

CI validates the source, then runs separate Chromium and Firefox jobs. Each job
uploads its browser's ZIP as a separate artifact:

- **watchlater-plus-chrome** — load the extracted folder through `chrome://extensions`.
- **watchlater-plus-firefox** — load the extracted manifest through `about:debugging`.

These are unsigned development packages. Firefox temporary installations last
until the browser exits. No workflow submits to an extension store.

## Local checks

Node.js 22.13+:

```sh
npm ci
npm run validate
npx playwright install chromium firefox
npm run test:browser
npm run test:firefox
```

`npm run build` writes the two browser directories and ZIPs to `dist/` using a
runtime-file allowlist. The Firefox manifest includes its add-on ID and Firefox
142+ requirement. Tests use sample pages and isolated profiles, never your account.

CI uses Node 26.13.1. Actions are SHA-pinned and recorded in
`.github/actions-lock.json`; update both together. `npm run lint:actions` checks
the pins, and `.gitattributes` keeps Windows checkouts in LF format.

For a new version, update both `package.json` and `manifest.json`, then run
`npm install --package-lock-only` and the checks above.
