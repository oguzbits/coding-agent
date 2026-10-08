import test from 'node:test';
import assert from 'node:assert/strict';
import { subtotal, totalCents, summary } from '../src/cart.mjs';

test('subtotal adds up price times quantity', () => {
  const items = [
    { priceCents: 250, quantity: 2 },
    { priceCents: 100, quantity: 3 },
  ];
  assert.equal(subtotal(items), 800);
});

test('no discount below 10 items', () => {
  const items = [{ priceCents: 1000, quantity: 9 }];
  assert.equal(totalCents(items), 9000);
});

test('10 percent discount from 10 items', () => {
  const items = [{ priceCents: 1000, quantity: 10 }];
  assert.equal(totalCents(items), 9000);
});

test('summary formats the total', () => {
  assert.equal(summary([{ priceCents: 1000, quantity: 1 }]), 'Total: 10.00 EUR');
});
