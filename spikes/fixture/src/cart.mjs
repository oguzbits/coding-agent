import { formatPrice } from './format.mjs';

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

// Bulk discount: 10 percent off from 10 items in total.
export function discountCents(items) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (count > 10) {
    return Math.round(subtotal(items) * 0.1);
  }
  return 0;
}

export function totalCents(items) {
  return subtotal(items) - discountCents(items);
}

export function summary(items) {
  return `Total: ${formatPrice(totalCents(items))}`;
}
