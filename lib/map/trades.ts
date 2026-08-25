/**
 * Trade taxonomy for Tradease.
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
  | 'electrical'
  | 'plumbing'
  | 'roofing'
  | 'carpentry'
  | 'masonry'
  | 'landscaping'
  | 'painting'
  | 'general';

export interface Trade {
  id: TradeId;
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
    label: 'Heating & cooling',
    code: 'HV',
    color: '#2DD4BF',
    colorDark: '#0F766E',
    aliases: ['hvac', 'ac', 'air conditioning', 'furnace', 'heat', 'boiler', 'ductwork', 'mini split'],
  },
  electrical: {
    id: 'electrical',
    label: 'Electrical',
    code: 'EL',
    color: '#FACC15',
    colorDark: '#A16207',
    aliases: ['electrician', 'electrical', 'wiring', 'panel', 'outlet', 'breaker', 'lighting'],
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plumbing',
    code: 'PL',
    color: '#3B82F6',
    colorDark: '#1D4ED8',
    aliases: ['plumber', 'plumbing', 'leak', 'drain', 'water heater', 'pipe', 'sewer'],
  },
  roofing: {
    id: 'roofing',
    label: 'Roofing & siding',
    code: 'RF',
    color: '#A78BFA',
    colorDark: '#6D28D9',
    aliases: ['roof', 'roofing', 'shingle', 'gutter', 'siding', 'flashing'],
  },
  carpentry: {
    id: 'carpentry',
    label: 'Carpentry',
    code: 'CP',
    color: '#D6A77A',
    colorDark: '#92400E',
    aliases: ['carpenter', 'carpentry', 'framing', 'trim', 'deck', 'cabinet', 'door'],
  },
  masonry: {
    id: 'masonry',
    label: 'Masonry & concrete',
    code: 'MA',
    color: '#94A3B8',
    colorDark: '#475569',
    aliases: ['mason', 'masonry', 'concrete', 'brick', 'paver', 'patio', 'stoop', 'chimney'],
  },
  landscaping: {
    id: 'landscaping',
    label: 'Landscaping',
    code: 'LS',
    color: '#4ADE80',
    colorDark: '#15803D',
    aliases: ['landscaping', 'lawn', 'tree', 'sprinkler', 'irrigation', 'grading', 'sod'],
  },
  painting: {
    id: 'painting',
    label: 'Painting',
    code: 'PT',
    color: '#F472B6',
    colorDark: '#BE185D',
    aliases: ['painter', 'painting', 'drywall', 'spackle', 'stain', 'powerwash'],
  },
  general: {
    id: 'general',
    label: 'General contracting',
    code: 'GC',
    color: '#FF7A1A',
    colorDark: '#C2410C',
    aliases: ['general', 'contractor', 'handyman', 'remodel', 'renovation', 'gc'],
  },
};

export const TRADE_LIST: Trade[] = Object.values(TRADES);

/** Fallback so an unrecognized trade id never crashes a render. */
export const FALLBACK_TRADE: Trade = TRADES.general;

export function getTrade(id: string | null | undefined): Trade {
  if (!id) return FALLBACK_TRADE;
  return TRADES[id as TradeId] ?? FALLBACK_TRADE;
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
 */
export const URGENCY = {
  emergency: { label: 'Emergency', ring: '#EF4444', order: 0 },
  urgent: { label: 'This week', ring: '#FB923C', order: 1 },
  standard: { label: 'Flexible', ring: 'transparent', order: 2 },
} as const;

export type UrgencyId = keyof typeof URGENCY;
