const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const scripts = ['core.js', 'content.js'].map((file) =>
  readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'),
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fixture() {
  const dom = new JSDOM(
    `<div id="contents">${[
      ['a', 'Zebra', '2:00', '100%'],
      ['b', 'Apple', '1:00', '25%'],
      ['c', 'Middle', 'LIVE', ''],
    ]
      .map(
        ([id, title, time, progress]) => `<ytd-playlist-video-renderer>
    <a id="video-title" href="/watch?v=${id}">${title}</a><ytd-channel-name>Channel</ytd-channel-name>
    <ytd-thumbnail-overlay-time-status-renderer>${time}</ytd-thumbnail-overlay-time-status-renderer>
    <ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width:${progress}"></div></ytd-thumbnail-overlay-resume-playback-renderer>
    <ytd-menu-renderer><button>Menu</button></ytd-menu-renderer>
  </ytd-playlist-video-renderer>`,
      )
      .join('')}</div>`,
    {
      url: 'https://www.youtube.com/playlist?list=WL',
      runScripts: 'outside-only',
    },
  );
  const { window } = dom;
  const saved = [];
  window.chrome = {
    storage: {
      local: {
        get: async () => ({ firstSeen: { b: 1 } }),
        set: async (value) => {
          saved.push(value);
        },
      },
    },
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.getClientRects = function () {
    return this.hidden ? [] : [{}];
  };
  window.confirm = () => true;
  scripts.forEach((script) => window.eval(script));
  const click = (action) =>
    window.document.querySelector(`[data-action=${action}]`).click();
  const change = (id, value) => {
    const el = window.document.getElementById(id);
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  return { dom, window, doc: window.document, saved, click, change };
}

test('unavailable warning survives native removal and list replacement until dismissed', async () => {
  const f = fixture();
  try {
    await pause(20);
    assert.equal(f.doc.querySelector('.wlp-notice-loading').hidden, false);
    const native = f.doc.createElement('ytd-alert-with-button-renderer');
    native.innerHTML =
      '<span id="text">2 unavailable videos are hidden</span><button>×</button>';
    f.doc.body.prepend(native);
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    assert.match(
      f.doc.querySelector('.wlp-notices').textContent,
      /2 unavailable videos/,
    );
    assert.equal(f.doc.querySelector('.wlp-notice-loading').hidden, true);
    native.remove();
    const oldList = f.doc.querySelector('#contents');
    oldList.replaceWith(oldList.cloneNode(true));
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    assert.match(
      f.doc.querySelector('.wlp-notices').textContent,
      /2 unavailable videos/,
    );
    f.click('dismissNotice');
    assert.equal(f.doc.querySelector('.wlp-warning').hidden, true);
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    assert.equal(f.doc.querySelector('.wlp-warning').hidden, true);
  } finally {
    f.dom.window.close();
  }
});

test('notice skeleton expires without a warning and still accepts a late notice', async () => {
  const f = fixture();
  let finishLoading;
  const originalTimeout = f.window.setTimeout.bind(f.window);
  f.window.setTimeout = (callback, delay, ...args) => {
    if (delay === 5000) {
      finishLoading = callback;
      return 12345;
    }
    return originalTimeout(callback, delay, ...args);
  };
  try {
    await pause(20);
    assert.equal(f.doc.querySelector('.wlp-notice-loading').hidden, false);
    finishLoading();
    assert.equal(f.doc.querySelector('.wlp-notice-loading').hidden, true);
    assert.equal(f.doc.querySelector('.wlp-warning').hidden, true);
    const native = f.doc.createElement('ytd-alert-renderer');
    native.textContent = '2 unavailable videos are hidden';
    f.doc.body.prepend(native);
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    assert.equal(f.doc.querySelector('.wlp-warning').hidden, false);
  } finally {
    f.dom.window.close();
  }
});

test('checkbox selects the current video when YouTube reuses a row', async () => {
  const f = fixture();
  try {
    await pause(20);
    const row = f.doc.querySelector('ytd-playlist-video-renderer');
    const link = row.querySelector('a#video-title');
    link.href = '/watch?v=replacement';
    link.textContent = 'Replacement video';
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    const checkbox = row.querySelector('.wlp-select');
    checkbox.checked = true;
    checkbox.dispatchEvent(new f.window.Event('change', { bubbles: true }));
    assert.equal(checkbox.checked, true);
    assert.equal(
      checkbox.getAttribute('aria-label'),
      'Select Replacement video',
    );
    assert.match(f.doc.querySelector('.wlp-count').textContent, /1 selected/);
  } finally {
    f.dom.window.close();
  }
});

test('channel cleanup includes filtered videos and session length updates totals', async () => {
  const f = fixture();
  try {
    await pause(20);
    f.change('wlp-search', 'Apple');
    f.change('wlp-channel', 'Channel');
    f.click('channel');
    assert.match(
      f.doc.querySelector('.wlp-count').textContent,
      /1 visible · 3 selected/,
    );
    assert.match(
      f.doc.querySelector('.wlp-watch-time').textContent,
      /Visible: 1m · Selected: 3m \+ 1 unknown/,
    );
    f.change('wlp-search', '');
    f.change('wlp-session', '1');
    f.doc
      .querySelector('#wlp-session')
      .dispatchEvent(new f.window.Event('input', { bubbles: true }));
    assert.equal(f.doc.querySelector('#wlp-filter').value, 'session');
    assert.match(f.doc.querySelector('.wlp-count').textContent, /1 visible/);
  } finally {
    f.dom.window.close();
  }
});

test('failed recovery save prevents the destructive native click', async () => {
  const f = fixture();
  try {
    await pause(20);
    let removed = false;
    const row = f.doc.querySelector('ytd-playlist-video-renderer');
    row.querySelector('button').addEventListener('click', () => {
      const item = f.doc.createElement('ytd-menu-service-item-renderer');
      item.textContent = 'Remove from Watch later';
      item.addEventListener('click', () => {
        removed = true;
      });
      f.doc.body.append(item);
    });
    f.window.chrome.storage.local.set = async (data) => {
      if ('recovery' in data) throw new Error('Storage full');
    };
    f.click('watched');
    f.click('remove');
    await pause(30);
    assert.equal(removed, false);
    assert.equal(row.isConnected, true);
    assert.match(f.doc.querySelector('[role=status]').textContent, /0 removed/);
  } finally {
    f.dom.window.close();
  }
});

test('mount, sort, filter, old selection and SPA teardown', async () => {
  const f = fixture();
  try {
    await pause(20);
    assert.equal(f.doc.querySelectorAll('.wlp-select').length, 3);
    assert.equal(f.saved.length, 1);
    f.change('wlp-sort', 'title');
    assert.equal(
      f.doc.querySelector('ytd-playlist-video-renderer a').textContent,
      'Apple',
    );
    f.change('wlp-filter', 'watched');
    f.click('all');
    assert.match(
      f.doc.querySelector('.wlp-count').textContent,
      /1 visible · 3 selected/,
    );
    f.click('age');
    assert.equal(
      f.doc
        .querySelector('a[href="/watch?v=b"]')
        .parentElement.querySelector('input').checked,
      true,
    );
    f.window.history.pushState({}, '', '/watch?v=a');
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    assert.equal(f.doc.querySelector('#wlp-panel'), null);
    assert.equal(f.doc.querySelectorAll('.wlp-select').length, 0);
    assert.equal(f.doc.querySelectorAll('[hidden]').length, 0);
    assert.equal(
      f.doc.querySelector('ytd-playlist-video-renderer a').textContent,
      'Zebra',
    );
  } finally {
    f.dom.window.close();
  }
});

test('removal uses the matching native menu, including hidden selections', async () => {
  const f = fixture();
  try {
    await pause(20);
    const row = f.doc.querySelector('ytd-playlist-video-renderer');
    row.querySelector('button').addEventListener('click', () => {
      assert.equal(row.hidden, false);
      const menu = f.doc.createElement('ytd-menu-service-item-renderer');
      menu.textContent = 'Remove from Watch later';
      menu.addEventListener('click', () => {
        row.remove();
        menu.remove();
      });
      f.doc.body.append(menu);
    });
    f.click('watched');
    f.change('wlp-search', 'Apple');
    assert.equal(row.hidden, true);
    f.click('remove');
    await pause(650);
    assert.equal(row.isConnected, false);
    assert.match(
      f.doc.querySelector('[role=status]').textContent,
      /1 video removed/,
    );
    assert.equal(
      f.doc.querySelectorAll('ytd-playlist-video-renderer').length,
      2,
    );
  } finally {
    f.dom.window.close();
  }
});

test('removing the final video clears counts and unlocks the toolbar', async () => {
  const f = fixture();
  try {
    await pause(20);
    const rows = [...f.doc.querySelectorAll('ytd-playlist-video-renderer')];
    rows.slice(1).forEach((row) => row.remove());
    f.doc.dispatchEvent(new f.window.Event('yt-navigate-finish'));
    rows[0].querySelector('button').addEventListener('click', () => {
      const menu = f.doc.createElement('ytd-menu-service-item-renderer');
      menu.textContent = 'Remove from Watch later';
      menu.addEventListener('click', () => {
        rows[0].remove();
        menu.remove();
      });
      f.doc.body.append(menu);
    });
    f.click('all');
    f.click('remove');
    await pause(650);
    assert.match(
      f.doc.querySelector('.wlp-count').textContent,
      /0 loaded · 0 visible · 0 selected/,
    );
    assert.equal(f.doc.querySelector('[data-action=stop]').hidden, true);
    assert.equal(f.doc.querySelector('[data-action=remove]').disabled, true);
  } finally {
    f.dom.window.close();
  }
});

test('cancelled confirmation never opens a removal menu', async () => {
  const f = fixture();
  try {
    await pause(20);
    f.window.confirm = () => false;
    f.click('all');
    f.click('remove');
    assert.equal(
      f.doc.querySelectorAll('ytd-playlist-video-renderer').length,
      3,
    );
    assert.equal(f.doc.querySelector('[data-action=stop]').disabled, true);
  } finally {
    f.dom.window.close();
  }
});

test('missing menu stops the queue without removing any videos', async () => {
  const f = fixture();
  try {
    await pause(20);
    f.doc.querySelector('ytd-menu-renderer').remove();
    f.click('all');
    f.click('remove');
    await pause(20);
    assert.match(
      f.doc.querySelector('[role=status]').textContent,
      /0 removed.*menu unavailable/,
    );
    assert.equal(
      f.doc.querySelectorAll('ytd-playlist-video-renderer').length,
      3,
    );
    assert.equal(f.doc.querySelector('[data-action=stop]').disabled, true);
  } finally {
    f.dom.window.close();
  }
});

test('Stop prevents the next queued removal', async () => {
  const f = fixture();
  try {
    await pause(20);
    const row = f.doc.querySelector('ytd-playlist-video-renderer');
    row.querySelector('button').addEventListener('click', () => {
      const menu = f.doc.createElement('ytd-menu-service-item-renderer');
      menu.textContent = 'Remove from Watch later';
      menu.addEventListener('click', () => {
        row.remove();
        menu.remove();
      });
      f.doc.body.append(menu);
    });
    f.click('all');
    f.click('remove');
    await pause(20);
    f.click('stop');
    await pause(600);
    assert.equal(
      f.doc.querySelectorAll('ytd-playlist-video-renderer').length,
      2,
    );
    assert.match(
      f.doc.querySelector('[role=status]').textContent,
      /1 video removed. Stopped/,
    );
  } finally {
    f.dom.window.close();
  }
});
