# Watch Later+

A cleaner YouTube Watch Later, for **Chrome and Firefox**.

![Watch Later+ sorting, selection and watch-time totals](docs/images/playlist.png)

_Preview with sample videos._

- Sort by popularity, published date, added date, title, channel or duration.
- Select videos with checkboxes and remove them in bulk.
- Clean up watched videos, old saves and individual channels.
- Filter by session length and see watch-time totals.
- Load the whole playlist and keep recovery links for removed videos.

<details>
<summary>See cleanup tools</summary>

![Cleanup drawer with channel selection, session length and recovery links](docs/images/cleanup.png)

</details>

## Install

Download your browser's file from the [latest release](https://github.com/MattSG/watchlater-plus/releases/latest).

**Chrome:** Extract the Chrome ZIP. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder.

**Firefox 142+:** For a signed release, open `about:addons` → **Install Add-on From File** and select the XPI. Unsigned builds use **Load Temporary Add-on** in `about:debugging` and last until Firefox exits. The release notes identify signed packages.

Open [Watch Later](https://www.youtube.com/playlist?list=WL). After updating, reload the extension and refresh YouTube.

Cleanup covers **loaded videos**. “Old” means first seen by the extension, not date saved. Recovery links let you add videos back manually. Native menus currently require English YouTube.

## Contribute

Node.js 22.13+:

```sh
npm ci
npm run validate
```

[Builds & browser tests](BUILDING.md) · [Privacy](PRIVACY.md) · [MIT license](LICENSE)
