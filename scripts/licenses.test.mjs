// Tests of the license expressions of the dependency policy (scripts/licenses.mjs).
// Run: pnpm test:scripts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isAllowed } from './licenses.mjs';

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause']);

describe('isAllowed', () => {
  test('a single license is allowed when it is in the list', () => {
    assert.equal(isAllowed('MIT', allowed), true);
    assert.equal(isAllowed('GPL-3.0', allowed), false);
  });

  test('OR needs one allowed alternative, AND needs every license', () => {
    assert.equal(isAllowed('(MIT OR GPL-3.0)', allowed), true);
    assert.equal(isAllowed('MIT and ISC', allowed), true);
    assert.equal(isAllowed('MIT AND GPL-3.0', allowed), false);
  });

  test('AND binds tighter than OR, as in SPDX', () => {
    assert.equal(isAllowed('MIT OR GPL-3.0 AND LGPL-2.1', allowed), true);
    assert.equal(isAllowed('GPL-3.0 OR MIT AND LGPL-2.1', allowed), false);
  });

  test('parentheses group: a license required in every case must be allowed', () => {
    assert.equal(isAllowed('(MIT OR Apache-2.0) AND GPL-3.0', allowed), false);
    assert.equal(isAllowed('GPL-3.0 AND (MIT OR Apache-2.0)', allowed), false);
    assert.equal(isAllowed('(MIT OR GPL-3.0) AND (ISC OR GPL-2.0)', allowed), true);
    assert.equal(isAllowed('((MIT))', allowed), true);
  });

  test('an exception (WITH) is judged by its license', () => {
    assert.equal(isAllowed('Apache-2.0 WITH LLVM-exception', allowed), true);
    assert.equal(isAllowed('GPL-2.0 WITH Classpath-exception-2.0', allowed), false);
  });

  test('an expression that does not parse is not allowed', () => {
    assert.equal(isAllowed('(MIT OR', allowed), false);
    assert.equal(isAllowed('MIT ISC', allowed), false);
    assert.equal(isAllowed('', allowed), false);
  });
});
