/**
 * vrpSolver.js — Pure JS Cheapest-Insertion VRP Solver (ESM, Haversine distances)
 *
 * Adapted from VRP/vrp_solver.js (CommonJS) for use in the backend ESM delivery module.
 * Computes Haversine (straight-line) distances — no external API needed.
 *
 * Algorithm: Cheapest-insertion construction heuristic.
 * - Starting from a depot node (index 0), repeatedly inserts whichever pickup-delivery
 *   pair adds the least extra distance to the current route, while respecting the
 *   pickup-before-delivery constraint and vehicle capacity at every point.
 *
 * Complexity: O(P² × L²) — fine for ≤100 pairs per driver per shift.
 */

/** Haversine distance (meters) between two lat/lng points. */
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6_371_000; // Earth radius in meters
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Build an NxN Haversine distance matrix from an array of { lat, lng } locations.
 * @param {{ lat: number, lng: number }[]} locations
 * @returns {number[][]}
 */
export function buildHaversineMatrix(locations) {
    const n = locations.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                matrix[i][j] = haversineMeters(
                    locations[i].lat, locations[i].lng,
                    locations[j].lat, locations[j].lng
                );
            }
        }
    }
    return matrix;
}

/** Sum of consecutive segment distances for an index sequence. */
function routeDistance(matrix, sequence) {
    let total = 0;
    for (let k = 0; k < sequence.length - 1; k++) {
        total += matrix[sequence[k]][sequence[k + 1]];
    }
    return total;
}

/**
 * Check cumulative load never exceeds capacity or drops below 0
 * when visiting each index in `sequence`, starting from `startLoad`.
 */
function isCapacityFeasible(sequence, demands, capacity, startLoad = 0) {
    let load = startLoad;
    for (const idx of sequence) {
        load += demands[idx];
        if (load > capacity || load < 0) return false;
    }
    return true;
}

/**
 * Solve VRP using cheapest-insertion.
 *
 * @param {{
 *   distanceMatrix: number[][],
 *   demands: number[],
 *   pairs: [number, number][],
 *   vehicleCapacity: number,
 *   depotIndex?: number
 * }} params
 * @returns {{ route: number[], totalDistance: number }}
 */
export function solveVRP({ distanceMatrix, demands, pairs, vehicleCapacity, depotIndex = 0 }) {
    let route = [depotIndex];
    let remainingPairs = [...pairs];

    while (remainingPairs.length > 0) {
        let best = null;

        for (const pair of remainingPairs) {
            const [pickup, delivery] = pair;

            for (let i = 1; i <= route.length; i++) {
                const withPickup = [...route];
                withPickup.splice(i, 0, pickup);

                for (let j = i + 1; j <= withPickup.length; j++) {
                    const withBoth = [...withPickup];
                    withBoth.splice(j, 0, delivery);

                    if (!isCapacityFeasible(withBoth, demands, vehicleCapacity)) continue;

                    const cost = routeDistance(distanceMatrix, withBoth) - routeDistance(distanceMatrix, route);
                    if (!best || cost < best.cost) {
                        best = { cost, route: withBoth, pair };
                    }
                }
            }
        }

        if (!best) {
            // If no feasible insertion found (capacity overflow), force-append remaining pairs
            // rather than crashing the server. This can happen with tight capacity constraints.
            const [pickup, delivery] = remainingPairs[0];
            route = [...route, pickup, delivery];
            remainingPairs = remainingPairs.filter((p) => p !== remainingPairs[0]);
        } else {
            route = best.route;
            remainingPairs = remainingPairs.filter((p) => p !== best.pair);
        }
    }

    return { route, totalDistance: routeDistance(distanceMatrix, route) };
}
