/** Measures a complete sampled interval; does not certify unobserved inputs. */
export function curveError(points, field) {
  if (!Array.isArray(points) || points.length < 2 || points.some((p, i) => !Number.isFinite(p.n)
    || !Number.isFinite(p[field]) || i > 0 && p.n <= points[i - 1].n)) throw Error('Invalid curve samples');
  const first = points[0], last = points.at(-1), gain = last[field] - first[field];
  let maximumAbsolute = 0, maximumOutputRelative = 0;
  for (const point of points) {
    const predicted = first[field] + gain * (point.n - first.n) / (last.n - first.n);
    const error = Math.abs(predicted - point[field]);
    maximumAbsolute = Math.max(maximumAbsolute, error);
    maximumOutputRelative = Math.max(maximumOutputRelative, error / Math.max(1, Math.abs(point[field])));
  }
  return {gain, maximumAbsolute, maximumOutputRelative,
    maximumGainRelative: gain === 0 ? maximumAbsolute === 0 ? 0 : Infinity : maximumAbsolute / Math.abs(gain)};
}
