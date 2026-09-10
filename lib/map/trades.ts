/**
 * Trade taxonomy for Tradease.
 *
 * The database is the source of truth: `bookings.trade` and
 * `contractors.trade_type` are freeform text columns (no check constraint)
 * that in practice hold the exact capitalized strings from
 * lib/tradeJobs.ts (TRADE_JOBS / ALL_TRADES). `dbValue` on each Trade
 * below is that exact string. `id` is our own lowercase-slug internal id,
 * used for pin image names, filter state, etc. — never sent to or read
 * from the database directly.
 *
 * Every trade gets one color that is used EVERYWHERE it appears: map pin,
 * job card border, filter chip, contractor badge. The color is the trade.
 * Once a customer learns "teal = HVAC" the map is readable at a glance
 * without a legend.
 *
 * All colors are checked for contrast against the dark map style
 * (near-black, #0E0E10) and are mutually distinguishable.
 */

export type TradeId =
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'roofing'
  | 'carpentry'
  | 'painting'
  | 'landscaping'
  | 'cleaning'
  | 'handyman'
  | 'general';

export interface Trade {
  id: TradeId;
  /**
   * Exact string this trade is stored as in `bookings.trade` /
   * `contractors.trade_type`. Null only for the fallback trade, which is
   * never itself a real DB value.
   */
  dbValue: string | null;
  /** Shown to customers. Plain words, not industry jargon. */
  label: string;
  /** Shown on the pin itself. Max 2 chars — anything longer won't fit. */
  code: string;
  /** The trade's color. Used for pin fill, card accent, chip. */
  color: string;
  /** Darker variant for pin stroke / pressed states. */
  colorDark: string;
  /** What a customer would actually type or say. Used for search matching. */
  aliases: string[];
}

export const TRADES: Record<TradeId, Trade> = {
  hvac: {
    id: 'hvac',
    dbValue: 'HVAC',
    label: 'Heating & cooling',
    code: 'HV',
    color: '#2DD4BF',
    colorDark: '#0F766E',
    aliases: ['hvac', 'ac', 'air conditioning', 'furnace', 'heat', 'boiler', 'ductwork', 'mini split'],
  },
  plumbing: {
    id: 'plumbing',
    dbValue: 'Plumbing',
    label: 'Plumbing',
    code: 'PL',
    color: '#3B82F6',
    colorDark: '#1D4ED8',
    aliases: ['plumber', 'plumbing', 'leak', 'drain', 'water heater', 'pipe', 'sewer'],
  },
  electrical: {
    id: 'electrical',
    dbValue: 'Electrical',
    label: 'Electrical',
    code: 'EL',
    color: '#FACC15',
    colorDark: '#A16207',
    aliases: ['electrician', 'electrical', 'wiring', 'panel', 'outlet', 'breaker', 'lighting'],
  },
  roofing: {
    id: 'roofing',
    dbValue: 'Roofing',
    label: 'Roofing & siding',
    code: 'RF',
    color: '#A78BFA',
    colorDark: '#6D28D9',
    aliases: ['roof', 'roofing', 'shingle', 'gutter', 'siding', 'flashing'],
  },
  carpentry: {
    id: 'carpentry',
    dbValue: 'Carpentry',
    label: 'Carpentry',
    code: 'CP',
    color: '#D6A77A',
    colorDark: '#92400E',
    aliases: ['carpenter', 'carpentry', 'framing', 'trim', 'deck', 'cabinet', 'door'],
  },
  painting: {
    id: 'painting',
    dbValue: 'Painting',
    label: 'Painting',
    code: 'PT',
    color: '#F472B6',
    colorDark: '#BE185D',
    aliases: ['painter', 'painting', 'drywall', 'spackle', 'stain', 'powerwash'],
  },
  landscaping: {
    id: 'landscaping',
    dbValue: 'Landscaping',
    label: 'Landscaping',
    code: 'LS',
    color: '#4ADE80',
    colorDark: '#15803D',
    aliases: ['landscaping', 'lawn', 'tree', 'sprinkler', 'irrigation', 'grading', 'sod'],
  },
  cleaning: {
    id: 'cleaning',
    dbValue: 'Cleaning',
    label: 'Cleaning',
    code: 'CL',
    color: '#E2E8F0',
    colorDark: '#334155',
    aliases: ['cleaning', 'cleaner', 'house cleaning', 'maid', 'deep clean', 'move out', 'carpet cleaning', 'window cleaning'],
  },
  handyman: {
    id: 'handyman',
    dbValue: 'Handyman',
    label: 'Handyman',
    code: 'HM',
    color: '#FF7A1A',
    colorDark: '#C2410C',
    aliases: ['handyman', 'handy man', 'odd jobs', 'tv mount', 'furniture assembly', 'general repair', 'small jobs', 'fix it'],
  },
  /**
   * Fallback only. Never a real dbValue — exists so getTrade() and
   * fromDbValue() always return a valid, renderable Trade even when a
   * record's trade string doesn't match any of the ten above (freeform
   * text column, no DB check constraint). Not shown in the trade filter —
   * use FILTERABLE_TRADES for that, not TRADE_LIST.
   */
  general: {
    id: 'general',
    dbValue: null,
    label: 'General contracting',
    code: 'GC',
    color: '#94A3B8',
    colorDark: '#475569',
    aliases: ['general', 'contractor', 'remodel', 'renovation', 'gc'],
  },
};

/** Every trade, including the general fallback. Use for pin-image generation. */
export const TRADE_LIST: Trade[] = Object.values(TRADES);

/** Real, selectable trades only — general excluded. Use for filter UI. */
export const FILTERABLE_TRADES: Trade[] = TRADE_LIST.filter((t) => t.dbValue !== null);

/** Fallback so an unrecognized trade id never crashes a render. */
export const FALLBACK_TRADE: Trade = TRADES.general;

export function getTrade(id: string | null | undefined): Trade {
  if (!id) return FALLBACK_TRADE;
  return TRADES[id as TradeId] ?? FALLBACK_TRADE;
}

/** Maps the exact DB string (bookings.trade / contractors.trade_type) to a Trade. */
export function fromDbValue(dbValue: string | null | undefined): Trade {
  if (!dbValue) return FALLBACK_TRADE;
  return TRADE_LIST.find((t) => t.dbValue === dbValue) ?? FALLBACK_TRADE;
}

/** Loose match on what a customer typed. Returns null rather than guessing wrong. */
export function matchTrade(input: string): Trade | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  for (const trade of TRADE_LIST) {
    if (trade.id === q) return trade;
    if (trade.label.toLowerCase().includes(q)) return trade;
    if (trade.aliases.some((a) => a.includes(q) || q.includes(a))) return trade;
  }
  return null;
}

/**
 * Urgency ring drawn around a pin. Separate from trade color so both read
 * at once: color says what kind of work, ring says how fast.
 *
 * Matches the bookings.urgency check constraint exactly: low, normal,
 * standard, urgent, emergency. Only urgent/emergency get a visible ring —
 * the other three share a transparent ring but get distinct labels so the
 * copy still reads right even where the pin looks the same.
 */
export const URGENCY = {
  emergency: { label: 'Emergency', ring: '#EF4444', order: 0 },
  urgent: { label: 'This week', ring: '#FB923C', order: 1 },
  standard: { label: 'Flexible', ring: 'transparent', order: 2 },
  normal: { label: 'No rush', ring: 'transparent', order: 3 },
  low: { label: 'Whenever', ring: 'transparent', order: 4 },
} as const;

export type UrgencyId = keyof typeof URGENCY;
