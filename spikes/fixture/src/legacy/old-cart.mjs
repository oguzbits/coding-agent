// Deprecated, kept for the old checkout. Do not use in new code.
export function totalCents(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
