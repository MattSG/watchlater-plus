const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkActions } = require('../scripts/check-actions.cjs');
const sha = 'a'.repeat(40);
const lock = { 'actions/checkout': { sha } };

test('Actions require locked full SHAs', () => {
  assert.deepEqual(
    checkActions(`- uses: actions/checkout@${sha} # v4`, lock),
    [],
  );
  assert.match(
    checkActions('- uses: actions/checkout@v4', lock)[0],
    /full commit SHA/,
  );
  assert.match(
    checkActions(`- uses: actions/checkout@${'b'.repeat(40)}`, lock)[0],
    /does not match/,
  );
  assert.match(
    checkActions(`- uses: unknown/action@${sha}`, lock)[0],
    /does not match/,
  );
});
