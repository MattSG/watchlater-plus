const { test } = require('node:test');
const assert = require('node:assert/strict');
const { duration, compare, matches, older, watchTime } = require('../core.js');

test('session filter uses full duration and excludes unknown or invalid budgets', () => {
  const video = {
    title: 'Video',
    channel: 'Channel',
    duration: 900,
    progress: 50,
  };
  assert.equal(matches(video, '', 'session', 15), true);
  assert.equal(matches(video, '', 'session', 14), false);
  assert.equal(matches({ ...video, duration: null }, '', 'session', 15), false);
  assert.equal(matches(video, '', 'session', 0), false);
  assert.equal(matches(video, '', 'session', NaN), false);
});

test('watch time totals known durations and reports unknowns separately', () => {
  assert.equal(
    watchTime([{ duration: 3600 }, { duration: 601 }, { duration: null }]),
    '1h 11m + 1 unknown',
  );
  assert.equal(watchTime([]), '0m');
});

test('duration handles hours and unknown/live videos', () => {
  assert.equal(duration(' 1:02:03 '), 3723);
  assert.equal(duration('9:05'), 545);
  for (const text of ['', 'LIVE', 'Upcoming', '12'])
    assert.equal(duration(text), null);
});

test('sort keeps unknown durations last in either direction', () => {
  const rows = [
    { duration: null, order: 0 },
    { duration: 60, order: 1 },
    { duration: 120, order: 2 },
  ];
  assert.deepEqual(
    [...rows].sort((a, b) => compare(a, b, 'shortest')).map((v) => v.order),
    [1, 2, 0],
  );
  assert.deepEqual(
    [...rows].sort((a, b) => compare(a, b, 'longest')).map((v) => v.order),
    [2, 1, 0],
  );
  assert.deepEqual(
    [...rows].sort((a, b) => compare(a, b, 'reverse')).map((v) => v.order),
    [2, 1, 0],
  );
});

test('filters require fully watched progress and respect search', () => {
  const video = {
    title: 'A Video',
    channel: 'Creator',
    duration: null,
    progress: 99,
  };
  assert.equal(matches(video, 'creator', 'all'), true);
  assert.equal(matches(video, 'other', 'all'), false);
  assert.equal(matches(video, '', 'watched'), false);
  assert.equal(matches({ ...video, progress: 100 }, '', 'watched'), true);
  assert.equal(matches(video, '', 'short'), false);
  assert.equal(matches({ ...video, duration: 600 }, '', 'short'), true);
});

test('age excludes unknown dates, threshold boundaries and invalid input', () => {
  const now = 100 * 86400000;
  assert.equal(older(0, 90, now), true);
  assert.equal(older(10 * 86400000, 90, now), false);
  assert.equal(older(undefined, 90, now), false);
  assert.equal(older(0, -1, now), false);
});
