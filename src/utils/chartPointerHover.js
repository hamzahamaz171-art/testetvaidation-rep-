const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export function chartPointerLocalX(event) {
  const e = event?.nativeEvent || event;
  if (!e) return null;

  if (Number.isFinite(e.locationX)) return e.locationX;

  if (Number.isFinite(e.offsetX)) return e.offsetX;

  if (Number.isFinite(e.pageX) && Number.isFinite(e.target?.offsetLeft)) {
    return e.pageX - e.target.offsetLeft;
  }

  return null;
}

export function interpolateAlongChartFromPointer(localX, wrapW, graphW, points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!Number.isFinite(localX) || !Number.isFinite(wrapW) || !Number.isFinite(graphW) || wrapW <= 0) {
    return null;
  }

  const scale = graphW / wrapW;
  const xInGraph = clamp(localX * scale, 0, graphW);

  let best = points[0];
  let bestDist = Math.abs(xInGraph - best.x);

  for (let i = 1; i < points.length; i += 1) {
    const dist = Math.abs(xInGraph - points[i].x);
    if (dist < bestDist) {
      best = points[i];
      bestDist = dist;
    }
  }

  return {
    x: best.x,
    y: best.y,
    value: best.value,
  };
}
