/**
 * Polygon checks for the zone hierarchy: a sub-zone must lie inside its main zone and sub-zones of one main zone must not
 * overlap (touching along an edge is fine). Points are { latitude, longitude }; at city scale a flat lat/lng plane is exact enough.
 * EPS is about one metre, so a sub-zone drawn right up to the main zone's edge still counts as inside.
 */
const EPS = 1e-5;

const xy = (p) => [Number(p.longitude), Number(p.latitude)];

const distToSegment = (p, a, b) => {
    const [px, py] = p; const [ax, ay] = a; const [bx, by] = b;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const ring = (poly) => poly.map(xy);

const onBoundary = (pt, r) => r.some((a, i) => distToSegment(pt, a, r[(i + 1) % r.length]) <= EPS);

const inRing = (pt, r) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i]; const [xj, yj] = r[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
};

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Two segments cross at a point that is inside both (touching at an end or running along each other does not count). */
const properCross = (a, b, c, d) => {
    const d1 = cross(a, b, c); const d2 = cross(a, b, d); const d3 = cross(c, d, a); const d4 = cross(c, d, b);
    const tiny = EPS * EPS;
    return ((d1 > tiny && d2 < -tiny) || (d1 < -tiny && d2 > tiny)) && ((d3 > tiny && d4 < -tiny) || (d3 < -tiny && d4 > tiny));
};

const edgesCross = (ra, rb) => ra.some((a, i) => rb.some((c, j) => properCross(a, ra[(i + 1) % ra.length], c, rb[(j + 1) % rb.length])));

const centroid = (r) => {
    const n = r.length;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
};

/** Midpoints of the pieces an edge splits into where the other polygon's edges cross it or its corners touch it. */
const pieceMidpoints = (ra, rb) => {
    const out = [];
    ra.forEach((a, i) => {
        const b = ra[(i + 1) % ra.length];
        const dx = b[0] - a[0]; const dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return;
        const ts = [0, 1];
        rb.forEach((c, j) => {
            const d = rb[(j + 1) % rb.length];
            // where this edge meets the other edge
            const den = dx * (d[1] - c[1]) - dy * (d[0] - c[0]);
            if (Math.abs(den) > 1e-18) {
                const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
                const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
                if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
            }
            // corners of the other polygon lying on this edge
            if (distToSegment(c, a, b) <= EPS) ts.push(Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2)));
        });
        ts.sort((p, q) => p - q);
        for (let k = 0; k + 1 < ts.length; k++) {
            if (ts[k + 1] - ts[k] < 1e-9) continue;
            const t = (ts[k] + ts[k + 1]) / 2;
            out.push([a[0] + t * dx, a[1] + t * dy]);
        }
    });
    return out;
};

export const validPolygon =(poly) => Array.isArray(poly) && poly.length >= 3 && poly.every((p) => Number.isFinite(Number(p?.latitude)) && Number.isFinite(Number(p?.longitude)));

/** Does `inner` lie completely inside `outer` (its edge may run along the outer edge)? */
export const polygonInside = (inner, outer) => {
    const a = ring(inner); const b = ring(outer);
    if (!a.every((pt) => inRing(pt, b) || onBoundary(pt, b))) return false;
    if (edgesCross(a, b)) return false;
    return pieceMidpoints(a, b).every((pt) => inRing(pt, b) || onBoundary(pt, b));
};

/** Do the two polygons share any area? Sharing only an edge or a corner is not an overlap. */
export const polygonsOverlap = (first, second) => {
    const a = ring(first); const b = ring(second);
    if (edgesCross(a, b)) return true;
    if (a.some((pt) => inRing(pt, b) && !onBoundary(pt, b))) return true;
    if (b.some((pt) => inRing(pt, a) && !onBoundary(pt, a))) return true;
    // a border that runs through the other polygon's inside (rectangles that share a side but also cut into each other)
    if (pieceMidpoints(a, b).some((pt) => inRing(pt, b) && !onBoundary(pt, b))) return true;
    if (pieceMidpoints(b, a).some((pt) => inRing(pt, a) && !onBoundary(pt, a))) return true;
    const ca = centroid(a); const cb = centroid(b);
    return (inRing(ca, b) && !onBoundary(ca, b)) || (inRing(cb, a) && !onBoundary(cb, a));
};
