import test from 'node:test';
import assert from 'node:assert/strict';

import { CARDS } from '../../src/career/cards.js';

test('cards that unlock branch solutions explain the extra behavior on the card face', () => {
  for (const id of ['C4', 'C5', 'C8', 'C9', 'C10', 'C11', 'C12', 'C15', 'C18']) {
    assert.match(CARDS[id].description, /特殊|資源交換|成功取捨|證據救援/);
  }
});
