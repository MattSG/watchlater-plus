(() => {
  'use strict';
  const extension = globalThis.browser || globalThis.chrome;
  const ROW = 'ytd-playlist-video-renderer';
  const selected = new Set();
  const notices = new Set();
  let noticeText = '',
    dismissedNotice = '';
  let noticeSettled = false,
    noticeTimer;
  let drawerAnimation;
  let recovery = [],
    loadingAll = false,
    loadStopped = false,
    loadRun = 0;
  const playback = new Map();
  const nativeSorts = new Set();
  const nativeOrder = {
    popular: 'Most popular',
    publishedNewest: 'Date published (newest)',
    publishedOldest: 'Date published (oldest)',
    addedNewest: 'Date added (newest)',
    addedOldest: 'Date added (oldest)',
    original: 'Manual',
  };
  let sortChoice = 'popular',
    defaultSortAttempted = false,
    sorting = false;
  let panel,
    footer,
    list,
    records = [],
    nextOrder = 0,
    busy = false,
    stopped = false,
    timer;
  let firstSeen = {},
    ready = false;
  const active = () =>
    location.pathname === '/playlist' &&
    new URLSearchParams(location.search).get('list') === 'WL';
  document.documentElement?.toggleAttribute('data-wlp-watch-later', active());
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const status = (text) => {
    if (panel) panel.querySelector('[role=status]').textContent = text;
  };
  extension.storage.local
    .get(['firstSeen', 'recovery'])
    .then((data) => {
      firstSeen = data.firstSeen || {};
      recovery = Array.isArray(data.recovery) ? data.recovery : [];
      ready = true;
      refresh();
    })
    .catch(() => status('Local storage unavailable. Reload the extension.'));

  function read(row) {
    const link = row.querySelector('a#video-title');
    let id;
    try {
      id = new URL(link?.href).searchParams.get('v');
    } catch {
      return null;
    }
    if (!id) return null;
    const bar = row.querySelector(
      'ytd-thumbnail-overlay-resume-playback-renderer #progress',
    );
    // YouTube supplies a percentage width for its resume indicator. Unknown progress is not watched.
    const width = bar?.style.width || '';
    return {
      row,
      id,
      title: link.textContent.trim(),
      channel: row.querySelector('ytd-channel-name')?.textContent.trim() || '',
      duration: WLP.duration(
        row.querySelector('ytd-thumbnail-overlay-time-status-renderer')
          ?.textContent || '',
      ),
      progress: width.endsWith('%') ? Number.parseFloat(width) || 0 : 0,
      order: Number(row.dataset.wlpOrder),
    };
  }

  function mount() {
    panel = document.createElement('section');
    panel.id = 'wlp-panel';
    panel.setAttribute('aria-label', 'Watch Later Plus controls');
    panel.innerHTML = /* HTML */ ` <div class="wlp-heading">
        <div class="wlp-playback">
          <button data-action="play" hidden>Play all</button
          ><button data-action="shuffle" hidden>Shuffle</button>
        </div>
        <div class="wlp-summary">
          <span class="wlp-count"></span>
          <span class="wlp-watch-time"></span>
          <div class="wlp-notices">
            <div class="wlp-warning" role="note" aria-live="polite" hidden>
              <span class="wlp-warning-text"></span
              ><button
                type="button"
                data-action="dismissNotice"
                aria-label="Dismiss unavailable videos warning"
              >
                ×
              </button>
            </div>
          </div>
        </div>
        <div class="wlp-utilities">
          <button data-action="load">Load more</button
          ><button
            data-action="tools"
            aria-expanded="false"
            aria-controls="wlp-tools"
          >
            Cleanup &amp; tools <span aria-hidden="true">▾</span>
          </button>
        </div>
      </div>
      <div class="wlp-tools">
        <label class="wlp-search"
          ><span class="wlp-sr-only">Search title or channel</span
          ><input
            id="wlp-search"
            type="search"
            placeholder="Search this playlist"
        /></label>
        <label
          ><span class="wlp-sr-only">Sort videos</span
          ><select id="wlp-sort">
            <optgroup label="YouTube playlist order">
              <option value="popular">Most popular</option>
              <option value="publishedNewest">Date published (newest)</option>
              <option value="publishedOldest">Date published (oldest)</option>
              <option value="addedNewest">Date added (newest)</option>
              <option value="addedOldest">Date added (oldest)</option>
              <option value="original">Manual playlist order</option>
            </optgroup>
            <optgroup label="Loaded videos">
              <option value="reverse">Reverse playlist order</option>
              <option value="title">Title A–Z</option>
              <option value="channel">Channel A–Z</option>
              <option value="shortest">Shortest first</option>
              <option value="longest">Longest first</option>
            </optgroup>
          </select></label
        >
        <label
          ><span class="wlp-sr-only">Filter videos</span
          ><select id="wlp-filter">
            <option value="all">All videos</option>
            <option value="watched">Fully watched</option>
            <option value="unwatched">No visible progress</option>
            <option value="short">10 minutes or less</option>
            <option value="long">30 minutes or more</option>
            <option value="session">Fits session</option>
          </select></label
        >
        <button
          data-action="all"
          title="Select all loaded videos, including filtered videos"
        >
          Select all</button
        ><button data-action="none">Clear selection</button>
        <button data-action="remove" class="wlp-danger" disabled>
          Remove selected</button
        ><button data-action="stop" hidden disabled>Stop</button>
      </div>
      <div id="wlp-tools" hidden>
        <div class="wlp-actions">
          <button data-action="watched">Select fully watched</button>
          <div class="wlp-age">
            <label for="wlp-days">First seen over</label
            ><input
              id="wlp-days"
              type="number"
              min="1"
              step="1"
              value="90"
              aria-label="First seen more than this many days ago"
            /><span>days ago</span><button data-action="age">Select old</button>
          </div>
          <button data-action="export">Export links</button>
          <button data-action="loadAll" hidden>Load entire playlist</button>
          <button data-action="stopLoad" hidden>Stop loading</button>
        </div>
        <div class="wlp-actions wlp-extra-tools">
          <label class="wlp-field"
            >Channel<select id="wlp-channel">
              <option value="">Choose a channel</option>
            </select></label
          >
          <button data-action="channel">Select channel</button>
          <label class="wlp-field"
            >Session length (minutes)<input
              id="wlp-session"
              type="number"
              min="1"
              max="1440"
              value="15"
          /></label>
        </div>
        <details class="wlp-recovery">
          <summary>
            Recovery list (<span class="wlp-recovery-count">0</span>)
          </summary>
          <p>
            Open a saved link to add the video back to Watch Later manually.
          </p>
          <div class="wlp-actions">
            <button data-action="exportRecovery">Export recovery list</button
            ><button data-action="clearRecovery">Clear recovery list</button>
          </div>
          <ul class="wlp-recovery-list"></ul>
        </details>
        <p class="wlp-note">
          Age means first seen here, not date saved. Fully watched requires a
          100% progress bar. Local sorts and cleanup cover loaded videos only.
        </p>
      </div>
      <p role="status" aria-live="polite"></p>`;
    list.before(panel);
    const loadingNotice = document.createElement('div');
    loadingNotice.className = 'wlp-notice-loading';
    loadingNotice.setAttribute('role', 'note');
    loadingNotice.setAttribute('aria-label', 'Checking for unavailable videos');
    loadingNotice.setAttribute('aria-busy', 'true');
    panel.querySelector('.wlp-notices').prepend(loadingNotice);
    if (!noticeSettled && !noticeTimer) {
      // YouTube has no explicit "no unavailable videos" event; do not leave an endless skeleton.
      noticeTimer = setTimeout(() => {
        noticeSettled = true;
        noticeTimer = null;
        renderNotice();
      }, 5000);
    }
    footer?.remove();
    footer = document.createElement('div');
    footer.id = 'wlp-footer';
    footer.hidden = true;
    const load = document.createElement('button');
    load.textContent = 'Load more';
    load.addEventListener('click', () => handle('load'));
    footer.append(load);
    const stopLoading = document.createElement('button');
    stopLoading.textContent = 'Stop loading';
    stopLoading.dataset.action = 'stopLoad';
    stopLoading.hidden = true;
    stopLoading.addEventListener('click', () => handle('stopLoad'));
    footer.append(stopLoading);
    list.after(footer);
    panel.querySelector('#wlp-sort').value = sortChoice;
    renderRecovery();
    panel.addEventListener('input', (event) => {
      if (!event.target.matches('input')) return;
      if (event.target.id === 'wlp-session')
        panel.querySelector('#wlp-filter').value = 'session';
      apply();
    });
    panel.addEventListener('change', (event) => {
      if (event.target.id === 'wlp-sort') {
        sortChoice = event.target.value;
        defaultSortAttempted = true;
        if (nativeOrder[sortChoice]) {
          changeNativeOrder(sortChoice);
          return;
        }
      }
      apply();
    });
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.action;
      if (action) handle(action);
    });
  }

  function refresh() {
    document.documentElement?.toggleAttribute('data-wlp-watch-later', active());
    if (!active()) {
      loadStopped = true;
      loadRun++;
      loadingAll = false;
      for (const control of nativeSorts)
        control.classList.remove('wlp-native-sort');
      nativeSorts.clear();
      unmount();
      records.forEach((v) => {
        v.row.hidden = false;
        v.row.querySelector('.wlp-select')?.remove();
      });
      // Restore the native order when YouTube keeps the old DOM during SPA navigation.
      records
        .sort((a, b) => a.order - b.order)
        .forEach((v) => v.row.parentElement?.append(v.row));
      records.forEach((v) => {
        v.row.classList.remove('wlp-selected');
        delete v.row.dataset.wlpOrder;
      });
      records = [];
      selected.clear();
      list = null;
      nextOrder = 0;
      sortChoice = 'popular';
      defaultSortAttempted = false;
      noticeText = '';
      dismissedNotice = '';
      clearTimeout(noticeTimer);
      noticeTimer = null;
      noticeSettled = false;
      return;
    }
    if (!ready || busy || sorting) return;
    const firstRow = document.querySelector(ROW);
    if (!firstRow) {
      if (panel?.isConnected && list?.isConnected) {
        records = [];
        selected.clear();
        apply();
      }
      return;
    }
    const currentList = firstRow.parentElement;
    if (list !== currentList) {
      unmount();
      list = currentList;
      records = [];
      selected.clear();
      nextOrder = 0;
    }
    if (!panel?.isConnected) mount();
    syncNativeControls(list.closest('ytd-browse') || document);
    let changed = false;
    records = [...list.querySelectorAll(`:scope > ${ROW}`)]
      .map((row) => {
        if (!row.hasAttribute('data-wlp-order'))
          row.dataset.wlpOrder = nextOrder++;
        const video = read(row);
        if (!video) return null;
        if (!Object.hasOwn(firstSeen, video.id)) {
          firstSeen[video.id] = Date.now();
          changed = true;
        }
        if (!row.querySelector('.wlp-select')) {
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.className = 'wlp-select';
          box.addEventListener('click', (e) => e.stopPropagation());
          box.addEventListener('change', () => {
            const current = read(row);
            if (!current) return;
            box.checked
              ? selected.add(current.id)
              : selected.delete(current.id);
            apply();
          });
          row.prepend(box);
        }
        row
          .querySelector('.wlp-select')
          .setAttribute('aria-label', `Select ${video.title}`);
        return video;
      })
      .filter(Boolean);
    const ids = new Set(records.map((v) => v.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    if (changed)
      extension.storage.local
        .set({ firstSeen })
        .catch(() => status('Could not save first-seen dates.'));
    const channelSelect = panel.querySelector('#wlp-channel');
    const channels = [
      ...new Set(records.map((v) => v.channel).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
    if (
      channelSelect.options.length !== channels.length + 1 ||
      channels.some(
        (channel, index) => channelSelect.options[index + 1]?.value !== channel,
      )
    ) {
      const previous = channelSelect.value;
      channelSelect.replaceChildren(
        new Option('Choose a channel', ''),
        ...channels.map((channel) => new Option(channel, channel)),
      );
      channelSelect.value = channels.includes(previous) ? previous : '';
    }
    apply();
    if (!defaultSortAttempted && nativeSortButton()) {
      defaultSortAttempted = true;
      changeNativeOrder(sortChoice);
    }
  }

  function syncNativeControls(scope) {
    for (const control of nativeSorts)
      if (!control.isConnected) nativeSorts.delete(control);
    for (const notice of notices)
      if (!notice.isConnected) notices.delete(notice);
    playback.clear();
    for (const button of scope.querySelectorAll(
      'ytd-playlist-header-renderer button, ytd-playlist-header-renderer a, ytd-playlist-sidebar-renderer button, ytd-playlist-sidebar-renderer a',
    )) {
      const label =
        button.textContent.trim() || button.getAttribute('aria-label') || '';
      const kind = /^Play all$/i.test(label)
        ? 'play'
        : /^(?:Shuffle|Shuffle play)$/i.test(label)
          ? 'shuffle'
          : null;
      if (kind && !playback.has(kind)) playback.set(kind, button);
    }
    // Keep YouTube's managed nodes in place; moving them can trigger Polymer re-rendering.
    for (const kind of ['play', 'shuffle'])
      panel.querySelector(`[data-action=${kind}]`).hidden = !playback.has(kind);
    // Some YouTube layouts render the sort as a plain button rather than a sort renderer.
    for (const button of scope.querySelectorAll('button')) {
      if (
        panel.contains(button) ||
        !/^(?:Date (?:published|added) \((?:newest|oldest)\)|Manual|Most popular)$/i.test(
          button.textContent.trim().replace(/\s+/g, ' '),
        )
      )
        continue;
      const control =
        button.closest(
          'yt-dropdown-menu, ytd-dropdown-menu, yt-dropdown-menu-view-model, ytd-sort-filter-sub-menu-renderer, yt-sort-filter-sub-menu-renderer',
        ) || button;
      control.classList.add('wlp-native-sort');
      nativeSorts.add(control);
    }
    for (const notice of scope.querySelectorAll(
      'ytd-alert-with-button-renderer, ytd-alert-renderer',
    )) {
      const text =
        notice.querySelector('#text')?.textContent.trim() ||
        notice.textContent.trim();
      if (!/unavailable videos? (?:are|is) hidden/i.test(text)) continue;
      noticeText = text;
      notice.classList.add('wlp-native-notice');
      notices.add(notice);
    }
    if (noticeText) {
      noticeSettled = true;
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    renderNotice();
  }

  function nativeSortButton() {
    for (const control of nativeSorts) {
      if (!control.isConnected) continue;
      const button = control.matches('button')
        ? control
        : control.querySelector('button');
      if (button) return button;
    }
  }

  function renderNotice() {
    if (!panel) return;
    panel.querySelector('.wlp-notice-loading').hidden =
      noticeSettled || !!noticeText;
    const warning = panel.querySelector('.wlp-warning');
    warning.querySelector('.wlp-warning-text').textContent = noticeText;
    warning.hidden = !noticeText || dismissedNotice === noticeText;
  }

  async function changeNativeOrder(value) {
    if (sorting || busy) return;
    const button = nativeSortButton();
    if (!button) {
      sortChoice = 'original';
      panel.querySelector('#wlp-sort').value = sortChoice;
      status(
        'YouTube’s sort menu is unavailable. Refresh YouTube and try again.',
      );
      return;
    }
    const label = nativeOrder[value];
    const hiddenAncestors = [];
    sorting = true;
    updateControls();
    try {
      if (button.textContent.trim() !== label) {
        status(`Sorting by ${label.toLowerCase()}…`);
        // The native popup may live inside its hidden renderer. Open that subtree offscreen.
        for (
          let el = button;
          el && el !== document.body;
          el = el.parentElement
        ) {
          if (getComputedStyle(el).display !== 'none') continue;
          hiddenAncestors.push([el, el.getAttribute('style')]);
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('position', 'fixed', 'important');
          el.style.setProperty('left', '-10000px', 'important');
          el.style.setProperty('top', '0', 'important');
        }
        button.click();
        const item = await waitFor(() =>
          [
            ...document.querySelectorAll(
              'ytd-menu-navigation-item-renderer, ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model',
            ),
          ].find(
            (el) =>
              el.textContent.trim().replace(/\s+/g, ' ') === label &&
              el.getClientRects().length,
          ),
        );
        if (!active()) return;
        item.click();
        await waitFor(
          () => !button.isConnected || button.textContent.trim() === label,
        );
      }
      const current = document.querySelector(ROW)?.parentElement;
      if (current)
        [...current.querySelectorAll(`:scope > ${ROW}`)].forEach((row) => {
          delete row.dataset.wlpOrder;
        });
      nextOrder = 0;
      status('');
    } catch (error) {
      status(`Could not apply ${label.toLowerCase()}. ${error.message}`);
      sortChoice = 'original';
      if (panel) panel.querySelector('#wlp-sort').value = sortChoice;
    } finally {
      for (const [el, style] of hiddenAncestors) {
        if (style === null) el.removeAttribute('style');
        else el.setAttribute('style', style);
      }
      sorting = false;
      refresh();
    }
  }

  function unmount() {
    drawerAnimation?.cancel();
    drawerAnimation = null;
    for (const notice of notices) notice.classList.remove('wlp-native-notice');
    notices.clear();
    playback.clear();
    panel?.remove();
    panel = null;
    footer?.remove();
    footer = null;
  }

  function apply() {
    if (!panel || busy || sorting) return;
    const query = panel.querySelector('#wlp-search').value;
    const filter = panel.querySelector('#wlp-filter').value;
    const sort = panel.querySelector('#wlp-sort').value;
    const minutes = Number(panel.querySelector('#wlp-session').value);
    const ordered = [...records].sort((a, b) => WLP.compare(a, b, sort));
    let visible = 0;
    ordered.forEach((video) => {
      video.row.hidden = !WLP.matches(video, query, filter, minutes);
      if (!video.row.hidden) visible++;
      video.row.querySelector('.wlp-select').checked = selected.has(video.id);
      video.row.classList.toggle('wlp-selected', selected.has(video.id));
    });
    // Avoid mutation-observer loops: move rows only when their order actually differs.
    const existing = [...list.children].filter((el) => el.matches(ROW));
    if (ordered.some((v, i) => existing[i] !== v.row)) {
      const continuation = list.querySelector(
        ':scope > ytd-continuation-item-renderer',
      );
      ordered.forEach((v) => list.insertBefore(v.row, continuation));
    }
    panel.querySelector('.wlp-count').textContent =
      `${records.length} loaded · ${visible} visible · ${selected.size} selected`;
    panel.querySelector('.wlp-watch-time').textContent =
      `Visible: ${WLP.watchTime(records.filter((v) => !v.row.hidden))}${selected.size ? ` · Selected: ${WLP.watchTime(records.filter((v) => selected.has(v.id)))}` : ''}`;
    updateControls();
    const more = continuation();
    panel.querySelector('[data-action=load]').hidden = !more;
    panel.querySelector('[data-action=loadAll]').hidden = !more || loadingAll;
    panel.querySelector('[data-action=stopLoad]').hidden = !loadingAll;
    footer.querySelector('[data-action=stopLoad]').hidden = !loadingAll;
    footer.hidden = !more && !loadingAll;
  }

  function continuation() {
    const owner = list?.closest('ytd-playlist-video-list-renderer') || list;
    return [
      ...(owner?.querySelectorAll('ytd-continuation-item-renderer') || []),
    ].find((el) => !el.hidden && getComputedStyle(el).display !== 'none');
  }

  async function handle(action) {
    if (action === 'stopLoad') {
      loadStopped = true;
      status('Stopping playlist loading…');
      return;
    }
    if (action === 'stop') {
      stopped = true;
      status('Stopping after the current video…');
      return;
    }
    if (action === 'dismissNotice') {
      dismissedNotice = noticeText;
      panel.querySelector('.wlp-warning').hidden = true;
      return;
    }
    if (busy || sorting || (loadingAll && action !== 'tools')) return;
    if (action === 'play' || action === 'shuffle') {
      const target = playback.get(action);
      if (target?.isConnected) target.click();
      else {
        status('Playback controls changed. Refresh YouTube and try again.');
        refresh();
      }
      return;
    }
    if (action === 'tools') toggleDrawer();
    if (action === 'all') records.forEach((v) => selected.add(v.id));
    if (action === 'none') selected.clear();
    if (action === 'channel') {
      const channel = panel.querySelector('#wlp-channel').value;
      if (!channel) {
        status('Choose a channel first.');
        return;
      }
      selected.clear();
      records
        .filter((v) => v.channel === channel)
        .forEach((v) => selected.add(v.id));
      status(
        `Selected ${selected.size} loaded videos from ${channel}. Review before removing.`,
      );
    }
    if (action === 'loadAll') {
      await loadEntirePlaylist();
      return;
    }
    if (action === 'exportRecovery')
      downloadLinks(recovery, 'watch-later-recovery.txt');
    if (
      action === 'clearRecovery' &&
      window.confirm(
        'Clear saved recovery links? This does not change your YouTube playlist.',
      )
    ) {
      try {
        await extension.storage.local.set({ recovery: [] });
        recovery = [];
        renderRecovery();
      } catch {
        status('Could not clear recovery links.');
      }
    }
    if (action === 'watched') {
      selected.clear();
      records
        .filter((v) => v.progress >= 100)
        .forEach((v) => selected.add(v.id));
    }
    if (action === 'age') {
      const days = Number(panel.querySelector('#wlp-days').value);
      if (!Number.isInteger(days) || days < 1) {
        status('Enter a whole number of days greater than zero.');
        return;
      }
      selected.clear();
      records
        .filter((v) => WLP.older(firstSeen[v.id], days))
        .forEach((v) => selected.add(v.id));
      status(
        'Selected by first-seen date. Review the checkboxes before removing.',
      );
    }
    if (action === 'load') {
      const next = continuation();
      if (!next) {
        apply();
        return;
      }
      // Temporarily restore native ordering/visibility so the continuation sentinel stays reachable.
      if (!nativeOrder[sortChoice]) {
        sortChoice = 'original';
        panel.querySelector('#wlp-sort').value = 'original';
      }
      panel.querySelector('#wlp-filter').value = 'all';
      panel.querySelector('#wlp-search').value = '';
      apply();
      next.scrollIntoView({ block: 'end', behavior: 'smooth' });
      status('Waiting for YouTube to load more videos…');
    }
    if (action === 'export') {
      downloadLinks(records, 'watch-later.txt');
    }
    if (action === 'remove') await removeSelected();
    apply();
  }

  function downloadLinks(videos, filename) {
    const text = videos
      .map(
        (video) =>
          `${video.title}${video.state ? ` (${video.state})` : ''}\nhttps://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
      )
      .join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderRecovery() {
    if (!panel) return;
    panel.querySelector('.wlp-recovery-count').textContent = recovery.length;
    const items = recovery
      .slice()
      .reverse()
      .map((video) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = video.title;
        link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(
          link,
          ` — ${video.state === 'removed' ? 'Removed' : 'Removal attempted; verify playlist'} · ${new Date(video.savedAt).toLocaleString()}`,
        );
        return item;
      });
    panel.querySelector('.wlp-recovery-list').replaceChildren(...items);
  }

  function updateControls() {
    const locked = busy || sorting || loadingAll;
    panel?.querySelectorAll('button, input, select').forEach((el) => {
      switch (el.dataset.action) {
        case 'stop':
          el.disabled = !busy;
          el.hidden = !busy;
          break;
        case 'stopLoad':
          el.disabled = !loadingAll;
          break;
        case 'tools':
          el.disabled = busy || sorting;
          break;
        case 'dismissNotice':
          el.disabled = false;
          break;
        case 'remove':
          el.disabled = locked || selected.size === 0;
          break;
        default:
          el.disabled = locked;
      }
    });
    if (footer) footer.querySelector('button').disabled = locked;
    records.forEach((video) => {
      video.row.querySelector('.wlp-select').disabled = locked;
    });
  }

  async function loadEntirePlaylist() {
    if (!continuation()) {
      apply();
      return;
    }
    const run = ++loadRun;
    loadingAll = true;
    loadStopped = false;
    apply();
    try {
      while (active() && !loadStopped && run === loadRun) {
        refresh();
        const next = continuation();
        if (!next) {
          await sleep(500);
          refresh();
          if (!continuation()) break;
          continue;
        }
        const before = records.length;
        status(`Loading entire playlist… ${records.length} videos loaded.`);
        next.scrollIntoView({ block: 'end', behavior: 'instant' });
        next.querySelector('button')?.click();
        const deadline = Date.now() + 15000;
        while (
          active() &&
          !loadStopped &&
          run === loadRun &&
          next.isConnected &&
          before === records.length
        ) {
          if (Date.now() >= deadline)
            throw new Error(
              'YouTube stopped responding. Try Load more or retry.',
            );
          await sleep(200);
          refresh();
        }
      }
      if (active() && run === loadRun)
        status(
          `${loadStopped ? 'Loading stopped' : 'Playlist loaded'}: ${records.length} videos.`,
        );
    } catch (error) {
      if (active() && run === loadRun) status(error.message);
    } finally {
      if (run === loadRun) {
        loadingAll = false;
        refresh();
      }
    }
  }

  function toggleDrawer() {
    const tools = panel.querySelector('#wlp-tools');
    const button = panel.querySelector('[data-action=tools]');
    const open = button.getAttribute('aria-expanded') !== 'true';
    const style = getComputedStyle(tools);
    const start = {
      height: `${tools.hidden ? 0 : tools.getBoundingClientRect().height}px`,
      opacity: tools.hidden ? 0 : style.opacity,
      paddingTop: tools.hidden ? '0px' : style.paddingTop,
      paddingBottom: tools.hidden ? '0px' : style.paddingBottom,
      marginTop: tools.hidden ? '0px' : style.marginTop,
    };
    drawerAnimation?.cancel();
    button.setAttribute('aria-expanded', String(open));
    tools.hidden = false;
    tools.inert = !open;
    if (
      !tools.animate ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      tools.hidden = !open;
      return;
    }
    const end = open
      ? {
          height: `${tools.getBoundingClientRect().height}px`,
          opacity: 1,
          paddingTop: '12px',
          paddingBottom: '12px',
          marginTop: '12px',
        }
      : {
          height: '0px',
          opacity: 0,
          paddingTop: '0px',
          paddingBottom: '0px',
          marginTop: '0px',
        };
    const animation = tools.animate([start, end], {
      duration: 140,
      easing: 'ease-out',
    });
    drawerAnimation = animation;
    animation.onfinish = () => {
      if (drawerAnimation !== animation) return;
      tools.hidden = !open;
      drawerAnimation = null;
    };
  }

  async function waitFor(check, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (!active()) throw new Error('Left Watch Later. Queue stopped.');
      const result = check();
      if (result) return result;
      await sleep(100);
    }
    throw new Error('YouTube did not confirm the action. Queue stopped.');
  }

  async function removeSelected() {
    const queue = records.filter((v) => selected.has(v.id));
    if (
      !queue.length ||
      !window.confirm(
        `Remove ${queue.length} selected videos from Watch Later?\nRecovery links will be saved first. Adding videos back is manual.`,
      )
    )
      return;
    busy = true;
    stopped = false;
    updateControls();
    let removed = 0;
    try {
      for (const video of queue) {
        if (stopped || !active()) break;
        if (!video.row.isConnected || read(video.row)?.id !== video.id)
          throw new Error('Playlist changed. Review selection and try again.');
        status(`Removing ${removed + 1} of ${queue.length}: ${video.title}`);
        // Use YouTube's own menu, avoiding private API credentials or write endpoints.
        const menuButton = video.row.querySelector(
          'ytd-menu-renderer yt-icon-button button, ytd-menu-renderer button',
        );
        if (!menuButton)
          throw new Error('Video menu unavailable. Queue stopped.');
        video.row.hidden = false;
        video.row.scrollIntoView({ block: 'center' });
        menuButton.click();
        const item = await waitFor(() =>
          [...document.querySelectorAll('ytd-menu-service-item-renderer')].find(
            (el) =>
              el.getClientRects().length &&
              /^Remove from Watch later$/i.test(el.textContent.trim()),
          ),
        );
        if (stopped) {
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          );
          break;
        }
        const entry = {
          id: video.id,
          title: video.title,
          channel: video.channel,
          savedAt: Date.now(),
          state: 'attempted',
        };
        const saved = [
          ...recovery.filter((previous) => previous.id !== video.id),
          entry,
        ];
        // Persist links before the destructive click. A failed save must stop the queue.
        try {
          await extension.storage.local.set({ recovery: saved });
        } catch {
          throw new Error(
            'Recovery links could not be saved. Removal stopped.',
          );
        }
        recovery = saved;
        renderRecovery();
        if (stopped || !active()) break;
        item.click();
        await waitFor(
          () => !video.row.isConnected || read(video.row)?.id !== video.id,
        );
        selected.delete(video.id);
        removed++;
        entry.state = 'removed';
        await extension.storage.local.set({ recovery });
        renderRecovery();
        await sleep(500);
      }
      status(
        `${removed} video${removed === 1 ? '' : 's'} removed.${stopped ? ' Stopped.' : ''}`,
      );
    } catch (error) {
      status(`${removed} removed. ${error.message}`);
    } finally {
      busy = false;
      refresh();
    }
  }

  new MutationObserver((mutations) => {
    if (!document) return;
    document.documentElement?.toggleAttribute('data-wlp-watch-later', active());
    if (
      mutations.every(
        (m) =>
          panel?.contains(m.target) ||
          (m.type === 'attributes' &&
            !m.target.matches('ytd-continuation-item-renderer')),
      )
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 200);
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style'],
  });
  document.addEventListener('yt-navigate-finish', refresh);
  refresh();
})();
