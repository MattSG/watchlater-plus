# Privacy

Watch Later+ runs on YouTube's desktop website. It has no server, analytics,
remote code, or external data collection.

It reads loaded playlist titles, channels, durations and visible playback
progress to provide sorting, filtering and cleanup. Video IDs and first-seen
timestamps are stored in the browser's local extension storage. Recovery links
also store titles, channel names, timestamps and removal outcomes locally.
Recovery data remains until cleared in Cleanup & tools or the extension is
uninstalled. Browser profiles do not share this data automatically.

Removing videos and native playlist sorting use YouTube's existing controls.
YouTube handles its normal signed-in account requests. The extension does not
read or store account credentials or tokens.

The `storage` permission saves local settings and recovery data. Access to
`www.youtube.com` lets the extension detect navigation into Watch Later and
modify that page. It does not modify watch history or other playlists.

Questions or issues: https://github.com/MattSG/watchlater-plus/issues
