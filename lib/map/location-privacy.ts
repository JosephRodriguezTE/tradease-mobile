/**
 * Location privacy for public map pins.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE
 *
 * Exact coordinates are never sent to a public client. Not for jobs,
 * not for contractors. The precise address exists server-side and is
 * released to exactly one contractor at exactly one moment: when their
 * claim on a job is accepted.
 *
 * A public job pin at a real address is a browsable map of houses with
 * something broken in them, often with a stated time when the owner
 * will be waiting alone for a stranger. A public contractor pin is, for
 * most one-truck operations, a home address.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE OFFSET IS DETERMINISTIC
 *
 * If the fuzz were random per request, a client could poll the same job
 * repeatedly and average the samples. The mean of enough random offsets
 * converges on the true point. So the offset is derived from a hash of
 * the record's id: the same job always lands on the same fake point,
 * forever, and repeated sampling reveals nothing new.
 *
 * Do NOT "improve" this by adding Math.random(). That is the bug.
 * ─────────────────────────────────────────────────────────────────────
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface PublicJobLocation extends LatLng {
  /** True precision was removed. Always true for public payloads. */
  approximate: true;
  /** Radius in meters the true point is somewhere inside. For UI copy. */
  precisionMeters: number;
  /** Human label: "Commack — near Jericho Tpke" */
  areaLabel: string;
}

export interface PublicContractorLocation extends LatLng {
  /** 'area' = center of declared service area. 'exact' = opted-in storefront. */
  mode: 'area' | 'exact';
  /** Service radius in meters. Null when mode is 'exact'. */
  serviceRadiusMeters: number | null;
  areaLabel: string;
}

/** Meters per degree at Long Island's latitude (~40.85 N). */
const METERS_PER_DEG_LAT = 111_132;
const METERS_PER_DEG_LON_AT_LI = 84_200;

/** How far a public job pin may sit from the true address. */
export const JOB_FUZZ_RADIUS_M = 600;

/**
 * FNV-1a. Small, fast, no dependency, stable across platforms.
 * Not cryptographic — it does not need to be. It needs to be *fixed*.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Two independent [0,1) values from one id. */
function pairFromId(id: string): [number, number] {
  const a = hash32(`tradease:lat:${id}`);
  const b = hash32(`tradease:lng:${id}`);
  return [a / 0xffffffff, b / 0xffffffff];
}

/**
 * Displace a point by a fixed, id-derived offset inside a disc.
 *
 * sqrt() on the radius gives uniform area distribution — without it,
 * points cluster toward the center, which would make the true address
 * the single most likely spot. That defeats the purpose.
 */
export function fuzzPoint(
  point: LatLng,
  id: string,
  radiusMeters: number = JOB_FUZZ_RADIUS_M
): LatLng {
  const [u, v] = pairFromId(id);
  const angle = u * 2 * Math.PI;
  const distance = Math.sqrt(v) * radiusMeters;

  const dLat = (distance * Math.cos(angle)) / METERS_PER_DEG_LAT;
  const dLon = (distance * Math.sin(angle)) / METERS_PER_DEG_LON_AT_LI;

  return {
    latitude: point.latitude + dLat,
    longitude: point.longitude + dLon,
  };
}

/**
 * Build the public-safe location for a job.
 *
 * `town` and `nearestMajorRoad` should be derived server-side from the
 * real address at write time and stored — do not reverse-geocode the
 * fuzzed point, which would produce a label for the wrong place.
 */
export function publicJobLocation(args: {
  jobId: string;
  trueLocation: LatLng;
  town: string;
  nearestMajorRoad?: string | null;
}): PublicJobLocation {
  const { jobId, trueLocation, town, nearestMajorRoad } = args;
  const fuzzed = fuzzPoint(trueLocation, jobId, JOB_FUZZ_RADIUS_M);

  return {
    ...fuzzed,
    approximate: true,
    precisionMeters: JOB_FUZZ_RADIUS_M,
    areaLabel: nearestMajorRoad ? `${town} — near ${nearestMajorRoad}` : town,
  };
}

/**
 * Build the public-safe location for a contractor.
 *
 * Default is the service-area center, which is a point the contractor
 * chooses (usually the middle of where they work), NOT their address.
 * Exact mode requires two things to both be true, and the UI that sets
 * `hasCommercialAddress` must be a deliberate, explained opt-in — not a
 * checkbox buried in onboarding.
 */
export function publicContractorLocation(args: {
  contractorId: string;
  serviceAreaCenter: LatLng;
  serviceRadiusMeters: number;
  town: string;
  showExactLocation: boolean;
  hasCommercialAddress: boolean;
  commercialLocation?: LatLng | null;
}): PublicContractorLocation {
  const {
    serviceAreaCenter,
    serviceRadiusMeters,
    town,
    showExactLocation,
    hasCommercialAddress,
    commercialLocation,
  } = args;

  const exactAllowed =
    showExactLocation && hasCommercialAddress && !!commercialLocation;

  if (exactAllowed && commercialLocation) {
    return {
      ...commercialLocation,
      mode: 'exact',
      serviceRadiusMeters: null,
      areaLabel: town,
    };
  }

  return {
    ...serviceAreaCenter,
    mode: 'area',
    serviceRadiusMeters,
    areaLabel: `Serves ${town} and nearby`,
  };
}

/** Haversine distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

/**
 * Distance copy for a fuzzed pin.
 *
 * Never render "2.3 mi" off an approximate point — the false precision
 * implies the pin is real. Round to the honest resolution instead.
 */
export function approximateDistanceLabel(
  from: LatLng,
  to: LatLng,
  precisionMeters: number = JOB_FUZZ_RADIUS_M
): string {
  const meters = distanceMeters(from, to);
  const miles = metersToMiles(meters);
  const slopMiles = metersToMiles(precisionMeters);

  if (miles < slopMiles) return 'Less than a mile';
  return `About ${Math.round(miles)} mi`;
}

/**
 * Guard for the boundary between server and client.
 *
 * Call this on every job payload before it leaves the API for a public
 * surface. It throws loudly in development rather than leaking quietly,
 * which is the failure mode that actually happens.
 */
export function assertNoExactLocation(payload: Record<string, unknown>): void {
  const banned = [
    'address',
    'streetAddress',
    'addressLine1',
    'exactLatitude',
    'exactLongitude',
    'unit',
    'aptNumber',
  ];
  const leaked = banned.filter((k) => payload[k] != null);
  if (leaked.length > 0) {
    throw new Error(
      `Public payload contains exact location fields: ${leaked.join(', ')}. ` +
        `Strip these server-side before sending to a public client.`
    );
  }
}
