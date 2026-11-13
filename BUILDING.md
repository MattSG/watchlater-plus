# Build and test

CI validates the source, then runs separate Chromium and Firefox jobs. Each job
uploads one browser package directly, without another ZIP wrapper:

- **watchlater-plus-chrome-YYYY.M.D.build.zip** — extract and load the folder through `chrome://extensions`.
- **watchlater-plus-firefox-YYYY.M.D.build.xpi** — select the XPI in `about:debugging` → **Load Temporary Add-on**.

These are unsigned development packages. Firefox temporary installations last
until the browser exits. No workflow submits to an extension store.

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
Firefox XPI files remain unsigned and temporary; renaming a ZIP to XPI does not
remove Mozilla's signing requirement. Store submission is disabled.
