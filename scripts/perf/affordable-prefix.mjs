/** Shadow calculation only. Prices and raw CpS must be independently validated. */
export function affordablePrefix(prices, rawAt, cookies, bankingSeconds) {
  if (!Array.isArray(prices) || typeof rawAt !== 'function' || !Number.isFinite(cookies) || cookies < 0
    || !Number.isFinite(bankingSeconds) || bankingSeconds < 0) throw Error('Invalid affordability inputs');
  let remaining = cookies;
  for (let n = 0; n < prices.length; n++) {
    const price = prices[n], raw = rawAt(n);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(raw) || raw < 0) throw Error('Invalid price/production');
    const reserve = bankingSeconds * raw;
    if (!Number.isFinite(reserve)) throw Error('Reserve overflow');
    if (remaining < price + reserve) return {count: n, remaining};
    remaining -= price;
  }
  return {count: prices.length, remaining};
}
