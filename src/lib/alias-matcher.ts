/**
 * alias-matcher.ts
 * Product alias matching engine for Freytag's Purchasing App
 *
 * Place in BOTH repos: src/lib/alias-matcher.ts
 *
 * Three-level matching:
 *   Level 1 — Auto-match:  known alias → silent match (score 100)
 *   Level 2 — Suggest:     50–80% confidence → "Did you mean X?" 
 *   Level 3 — Pending:     below 50% → manager review queue
 *
 * Fee lines are never matched — they are detected and flagged separately.
 */

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface ProductRecord {
  id: string;
  name: string;
  aliases: string[];
  active: boolean;
}

export type MatchLevel = 'exact' | 'alias' | 'suggest' | 'pending' | 'fee';

export interface MatchResult {
  level: MatchLevel;
  productId: string | null;
  productName: string | null;
  score: number;              // 0–100
  matchedAlias: string | null;
  strippedInput: string;      // what was left after qualifier stripping
  isFee: boolean;
}

// ─────────────────────────────────────────────
// FEE LINE DETECTION
// These are never products — never create aliases for these.
// ─────────────────────────────────────────────

const FEE_PATTERNS: RegExp[] = [
  /delivery\s*charge/i,
  /fuel\s*surcharge/i,
  /fuel\s*charge/i,
  /duties/i,
  /drayage/i,
  /origin\s*advance/i,
  /flower\s*hamper/i,
  /procona\s*(bucket|lid|collar)/i,
  /returned\s*procona/i,
  /cut\s*flower\s*discount/i,
  /packing/i,
  /GERB\s*TRAY/i,
  /HALF\s*(LARGE|SMALL)/i,
  /handling\s*fee/i,
  /service\s*fee/i,
  /freight/i,
  /shipping\s*fee/i,
];

export function isFeeLineItem(raw: string): boolean {
  return FEE_PATTERNS.some((pattern) => pattern.test(raw));
}

// ─────────────────────────────────────────────
// QUALIFIER STRIPPING
// Pattern: [Genus] [Color] [Variety] [Grade] [Origin] [Stem length]
// We strip everything except Genus and Color.
// ─────────────────────────────────────────────

// Grade qualifiers
const GRADES = [
  'select', 'premium', 'petite', 'standard', 'fancy', 'extra fancy',
  'choice', 'value', 'economy',
];

// Origin codes
const ORIGINS = [
  'ecu', 'col', 'hol', 'usa', 'mex', 'ken', 'eth', 'isr', 'nld',
  'ecuador', 'colombia', 'holland', 'netherlands', 'kenya', 'ethiopia',
  'israel', 'mexico',
];

// Stem length patterns (40cm, 50cm, 60cm, 70cm, 80cm, etc.)
const STEM_LENGTH_PATTERN = /\b\d{2,3}\s*cm\b/gi;

// Known variety names that should be stripped
// (These are cultivar names, not the product name)
const VARIETY_NAMES = [
  // Roses
  'freedom', 'pegasus', 'rio ala carte', 'rioala', 'explorer',
  'mondial', 'avalanche', 'pink avalanche', 'sphinx', 'upper class',
  'nina', 'high and magic', 'high magic',
  // Alstroemeria
  'helena', 'esmeralda', 'mistral', 'jazz', 'tiara',
  // Sunflowers
  "vincent's choice", 'vincents choice', 'sunrich', 'solemio',
  // Hydrangea
  // (hydrangea varieties are usually just color — don't strip color)
  // Tulips — Groot item codes handled separately
  // Chrysanthemums
  'reagan', 'shamrock', 'euro',
  // Gerbera
  'pasta', 'dune',
];

// Packaging/unit descriptors to strip
const PACKAGING = [
  'net', 'bunch', 'bch', 'box', 'flat', 'tray', 'sleeve',
  'wrapped', 'unwrapped', 'bu', 'bx',
];

// Common abbreviation expansions — applied BEFORE matching
const ABBREVIATION_MAP: Record<string, string> = {
  'alstro': 'alstroemeria',
  'alst': 'alstroemeria',
  'chrys': 'chrysanthemum',
  'chrys.': 'chrysanthemum',
  'hyd': 'hydrangea',
  'hydr': 'hydrangea',
  'lisi': 'lisianthus',
  'lisc': 'lisianthus',
  'gerbera': 'gerbera',
  'gerb': 'gerbera',
  'snap': 'snapdragon',
  'snaps': 'snapdragon',
  'stock': 'stock',
  'stk': 'stock',
  'anth': 'anthurium',
  'orch': 'orchid',
  'prot': 'protea',
  'eucal': 'eucalyptus',
  'euc': 'eucalyptus',
  'pit': 'pittosporum',
  'pitt': 'pittosporum',
  'var. pitt': 'variegated pittosporum',
  'var pitt': 'variegated pittosporum',
  'leather': 'leatherleaf fern',
  'leatherleaf': 'leatherleaf fern',
  'spath': 'spathiphyllum',
  'zz': 'zz plant',
  'sfl': 'sunflower',
  'ros': 'rose',
  'rspray': 'spray rose',
  'tulip': 'tulip',
  'tul': 'tulip',
  'iris': 'iris',
  'fre': 'freesia',
  'frees': 'freesia',
  'ranunc': 'ranunculus',
  'ane': 'anemone',
  'anem': 'anemone',
  'delph': 'delphinium',
  'larks': 'larkspur',
  'agap': 'agapanthus',
  'allium': 'allium',
  'celose': 'celosia',
  'celos': 'celosia',
  'statice': 'statice',
  'wax': 'waxflower',
  'waxfl': 'waxflower',
  'safari': 'safari sunset',
  'bells': 'bells of ireland',
  'boi': 'bells of ireland',
};

// Known vendor item code patterns → product hints
// These are regex patterns; if matched, we use the hint for matching
const ITEM_CODE_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  // Groot tulip codes
  { pattern: /^R\d{9}$/i, hint: 'tulip' },
  // Lake Flowers greenery codes
  { pattern: /^4041$/, hint: 'eucalyptus gunnii' },
  { pattern: /^2069$/, hint: 'safari sunset' },
  // Southern Floral codes
  { pattern: /^RSPRAY$/i, hint: 'spray rose' },
  { pattern: /^RIOALA\d*/i, hint: 'roses pink' },
];

/**
 * Normalize a raw product name for comparison:
 * 1. Lowercase
 * 2. Check for item codes
 * 3. Expand abbreviations
 * 4. Strip stem lengths
 * 5. Strip origins
 * 6. Strip grades
 * 7. Strip variety names
 * 8. Strip packaging descriptors
 * 9. Collapse whitespace
 */
export function stripQualifiers(raw: string): string {
  let s = raw.trim().toLowerCase();

  // Check item codes first
  for (const { pattern, hint } of ITEM_CODE_PATTERNS) {
    if (pattern.test(raw.trim())) {
      return hint;
    }
  }

  // Expand abbreviations (longest first to avoid partial replacements)
  const sortedAbbrevs = Object.entries(ABBREVIATION_MAP).sort(
    ([a], [b]) => b.length - a.length
  );
  for (const [abbrev, expansion] of sortedAbbrevs) {
    // Word boundary match
    const pattern = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, 'gi');
    s = s.replace(pattern, expansion);
  }

  // Strip stem lengths (50cm, 60cm, etc.)
  s = s.replace(STEM_LENGTH_PATTERN, '');

  // Strip origins
  for (const origin of ORIGINS) {
    const pattern = new RegExp(`\\b${escapeRegex(origin)}\\b`, 'gi');
    s = s.replace(pattern, '');
  }

  // Strip grades
  for (const grade of GRADES) {
    const pattern = new RegExp(`\\b${escapeRegex(grade)}\\b`, 'gi');
    s = s.replace(pattern, '');
  }

  // Strip variety names
  for (const variety of VARIETY_NAMES) {
    const pattern = new RegExp(`\\b${escapeRegex(variety)}\\b`, 'gi');
    s = s.replace(pattern, '');
  }

  // Strip packaging descriptors
  for (const pkg of PACKAGING) {
    const pattern = new RegExp(`\\b${escapeRegex(pkg)}\\b`, 'gi');
    s = s.replace(pattern, '');
  }

  // Collapse whitespace and trim
  s = s.replace(/\s+/g, ' ').trim();

  // Remove trailing/leading punctuation
  s = s.replace(/^[-–,.\s]+|[-–,.\s]+$/g, '').trim();

  return s;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────
// SIMILARITY SCORING
// Uses a combination of:
//   - Exact match after normalization (100)
//   - Token overlap score (Jaccard similarity)
//   - Levenshtein distance for short strings
// ─────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length > 1));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 100;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return Math.round((intersection / union) * 100);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(normalize(a), normalize(b));
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

/**
 * Combined similarity score between two strings.
 * Uses Jaccard for token overlap and Levenshtein for character similarity.
 * Weighted average: 60% Jaccard, 40% Levenshtein.
 */
export function similarityScore(a: string, b: string): number {
  const jaccard = jaccardSimilarity(a, b);
  const lev = levenshteinSimilarity(a, b);
  return Math.round(jaccard * 0.6 + lev * 0.4);
}

// ─────────────────────────────────────────────
// MAIN MATCH FUNCTION
// ─────────────────────────────────────────────

/**
 * Match a raw vendor product name against the product catalog.
 *
 * @param rawName - The raw string from invoice/order
 * @param products - Full product catalog from Firestore
 * @returns MatchResult with level, productId, score, etc.
 */
export function matchProduct(
  rawName: string,
  products: ProductRecord[]
): MatchResult {
  // Step 0 — Fee line detection
  if (isFeeLineItem(rawName)) {
    return {
      level: 'fee',
      productId: null,
      productName: null,
      score: 0,
      matchedAlias: null,
      strippedInput: rawName,
      isFee: true,
    };
  }

  const stripped = stripQualifiers(rawName);
  const normalizedInput = normalize(stripped);

  let bestScore = 0;
  let bestProduct: ProductRecord | null = null;
  let bestAlias: string | null = null;
  let isExactMatch = false;

  for (const product of products) {
    if (!product.active) continue;

    // Check exact match against canonical name
    if (normalize(product.name) === normalizedInput) {
      return {
        level: 'exact',
        productId: product.id,
        productName: product.name,
        score: 100,
        matchedAlias: null,
        strippedInput: stripped,
        isFee: false,
      };
    }

    // Check exact match against aliases (Level 1 — known alias)
    for (const alias of product.aliases) {
      if (normalize(alias) === normalize(rawName)) {
        return {
          level: 'alias',
          productId: product.id,
          productName: product.name,
          score: 100,
          matchedAlias: alias,
          strippedInput: stripped,
          isFee: false,
        };
      }

      // Also check alias against stripped input
      if (normalize(alias) === normalizedInput) {
        return {
          level: 'alias',
          productId: product.id,
          productName: product.name,
          score: 100,
          matchedAlias: alias,
          strippedInput: stripped,
          isFee: false,
        };
      }
    }

    // Fuzzy match — compare stripped input against product name and all aliases
    const candidateStrings = [
      product.name,
      stripQualifiers(product.name),
      ...product.aliases,
      ...product.aliases.map(stripQualifiers),
    ];

    for (const candidate of candidateStrings) {
      const score = similarityScore(stripped, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
        bestAlias = candidate !== product.name ? candidate : null;
      }
    }
  }

  // Determine match level based on score
  if (bestScore >= 80 && bestProduct) {
    // High confidence — treat as alias match, save alias
    return {
      level: 'alias',
      productId: bestProduct.id,
      productName: bestProduct.name,
      score: bestScore,
      matchedAlias: bestAlias,
      strippedInput: stripped,
      isFee: false,
    };
  }

  if (bestScore >= 50 && bestProduct) {
    // Medium confidence — suggest
    return {
      level: 'suggest',
      productId: bestProduct.id,
      productName: bestProduct.name,
      score: bestScore,
      matchedAlias: bestAlias,
      strippedInput: stripped,
      isFee: false,
    };
  }

  // Low confidence — send to pending queue
  return {
    level: 'pending',
    productId: bestProduct?.id ?? null,
    productName: bestProduct?.name ?? null,
    score: bestScore,
    matchedAlias: null,
    strippedInput: stripped,
    isFee: false,
  };
}

// ─────────────────────────────────────────────
// BATCH MATCHING
// Match an entire invoice or order at once
// ─────────────────────────────────────────────

export interface BatchMatchResult {
  raw: string;
  match: MatchResult;
}

export function matchBatch(
  rawNames: string[],
  products: ProductRecord[]
): BatchMatchResult[] {
  return rawNames.map((raw) => ({
    raw,
    match: matchProduct(raw, products),
  }));
}

// ─────────────────────────────────────────────
// PASTE AND PARSE HELPERS
// For buyer freeform order entry
// ─────────────────────────────────────────────

export interface ParsedOrderLine {
  rawText: string;
  quantity: number | null;
  unit: string | null;
  productDescription: string;
  match: MatchResult | null;  // null until matched against catalog
}

/**
 * Parse a freeform order line like:
 *   "10 bx Freedom Rose 60cm ECU"
 *   "5 bunches alstro hot pink"
 *   "200 stems sunflower yellow"
 */
export function parseOrderLine(line: string): ParsedOrderLine {
  const trimmed = line.trim();
  if (!trimmed) {
    return { rawText: line, quantity: null, unit: null, productDescription: '', match: null };
  }

  // Match quantity + optional unit at start
  const quantityMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(stems?|bunches?|bch|bx|boxes?|flats?|each|ea|pcs?|pieces?|units?)?\s*/i
  );

  let quantity: number | null = null;
  let unit: string | null = null;
  let remainder = trimmed;

  if (quantityMatch) {
    quantity = parseFloat(quantityMatch[1]);
    unit = quantityMatch[2]?.toLowerCase() ?? null;
    remainder = trimmed.slice(quantityMatch[0].length).trim();
  }

  // Normalize unit
  if (unit) {
    if (/^bch$|^bunch/.test(unit)) unit = 'bunch';
    else if (/^bx$|^box/.test(unit)) unit = 'box';
    else if (/^stem/.test(unit)) unit = 'stem';
    else if (/^ea$|^each/.test(unit)) unit = 'each';
    else if (/^pc$|^piece/.test(unit)) unit = 'each';
  }

  return {
    rawText: line,
    quantity,
    unit,
    productDescription: remainder,
    match: null,
  };
}

/**
 * Parse a multi-line paste from the buyer order form.
 * Each line is one product. Blank lines are skipped.
 */
export function parsePastedOrder(
  pastedText: string,
  products: ProductRecord[]
): ParsedOrderLine[] {
  const lines = pastedText.split('\n').map((l) => l.trim()).filter(Boolean);

  return lines.map((line) => {
    const parsed = parseOrderLine(line);
    if (parsed.productDescription) {
      parsed.match = matchProduct(parsed.productDescription, products);
    }
    return parsed;
  });
}
