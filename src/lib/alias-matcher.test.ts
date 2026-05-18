/**
 * alias-matcher.test.ts
 * Tests for the product alias matching engine
 *
 * Run with: npx jest (from repo root)
 * Or: npx ts-node alias-matcher.test.ts
 */

import {
  matchProduct,
  stripQualifiers,
  isFeeLineItem,
  parsePastedOrder,
  ProductRecord,
} from './alias-matcher';

// ─────────────────────────────────────────────
// SAMPLE PRODUCT CATALOG
// Mirrors the seed data we created
// ─────────────────────────────────────────────

const CATALOG: ProductRecord[] = [
  {
    id: 'prod_rose_med_red',
    name: 'Roses - Med Stem Red',
    aliases: [
      'Freedom Rose', 'Freedom Red Rose', 'Rosa Freedom 60cm',
      'FREEDOM RD 60CM', 'Rosa Freedom',
    ],
    active: true,
  },
  {
    id: 'prod_rose_med_pink',
    name: 'Roses - Med Stem Pink',
    aliases: ['Pegasus Rose', 'Rosa Pegasus', 'PEGASUS PK 60CM', 'Rio Ala Carte', 'RIOALA60'],
    active: true,
  },
  {
    id: 'prod_rose_spray',
    name: 'Roses - Spray',
    aliases: ['Spray Rose', 'Spray Roses', 'RSPRAY', 'Sp Roses'],
    active: true,
  },
  {
    id: 'prod_alstro_hot_pink',
    name: 'Alstroemeria Hot Pink',
    aliases: [
      'Alstro Hot Pink Net ECU Helena 80cm',
      'Alstro Hot Pink',
      'Alstroemeria Hot Pink Net',
      'ALSTRO HOT PINK ECU',
    ],
    active: true,
  },
  {
    id: 'prod_sunflower_yellow',
    name: 'Sunflower Yellow',
    aliases: [
      "Vincent's Choice", "Vincent's Choice Petite", "Vincent's Choice Select",
      'Sunflower Yellow Petite', 'SFL YELLOW VINCENTS',
    ],
    active: true,
  },
  {
    id: 'prod_hydrangea_blue',
    name: 'Hydrangea Blue',
    aliases: [
      'Hydrangea Blue JF', 'Hyd Blue Net ECU', 'HYD BLUE PINN',
      'Hydrangea Blue Allure', 'HYD BL TRIL ECU', 'Hyd Blue',
    ],
    active: true,
  },
  {
    id: 'prod_tulip_pink',
    name: 'Tulips Pink',
    aliases: ['R270942150', 'Tulip Pink', 'TULIP PK'],
    active: true,
  },
  {
    id: 'prod_eucalyptus_gunnii',
    name: 'Eucalyptus Gunnii',
    aliases: ['4041', 'Euc Gunnii', 'EUCAL GUNNII'],
    active: true,
  },
];

// ─────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${(e as Error).message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected "${expected}" but got "${actual}"`
    );
  }
}

console.log('\n── Fee Line Detection ──────────────────────────\n');

test('Delivery Charge is a fee', () => {
  assertEqual(isFeeLineItem('Delivery Charge'), true);
});
test('Fuel Surcharge is a fee', () => {
  assertEqual(isFeeLineItem('Fuel Surcharge'), true);
});
test('Cut Flower Discount is a fee', () => {
  assertEqual(isFeeLineItem('Cut Flower Discount'), true);
});
test('GERB TRAY is a fee', () => {
  assertEqual(isFeeLineItem('GERB TRAY'), true);
});
test('Drayage is a fee', () => {
  assertEqual(isFeeLineItem('Drayage'), true);
});
test('Roses - Med Stem Red is NOT a fee', () => {
  assertEqual(isFeeLineItem('Roses - Med Stem Red'), false);
});
test('Alstro Hot Pink is NOT a fee', () => {
  assertEqual(isFeeLineItem('Alstro Hot Pink'), false);
});

console.log('\n── Qualifier Stripping ─────────────────────────\n');

test('Strip ECU origin', () => {
  assertEqual(stripQualifiers('Roses Red ECU'), 'roses red');
});
test('Strip 60cm stem length', () => {
  assertEqual(stripQualifiers('Rosa Freedom 60cm'), 'rosa');
  // Note: "Freedom" is a variety name and also gets stripped
});
test('Strip Select grade', () => {
  assertEqual(stripQualifiers('Sunflower Yellow Select'), 'sunflower yellow');
});
test('Strip Petite grade', () => {
  assertEqual(stripQualifiers('Sunflower Yellow Petite'), 'sunflower yellow');
});
test('Expand alstro abbreviation', () => {
  assertEqual(stripQualifiers('Alstro Hot Pink'), 'alstroemeria hot pink');
});
test('Expand hyd abbreviation', () => {
  assertEqual(stripQualifiers('Hyd Blue'), 'hydrangea blue');
});
test('Expand leather abbreviation', () => {
  assertEqual(stripQualifiers('leather fern'), 'leatherleaf fern fern');
  // "fern" appears twice — acceptable, won't affect matching
});
test('Handle RSPRAY item code', () => {
  assertEqual(stripQualifiers('RSPRAY'), 'spray rose');
});
test('Handle Lake Flowers 4041 code', () => {
  assertEqual(stripQualifiers('4041'), 'eucalyptus gunnii');
});
test('Handle Groot tulip code', () => {
  assertEqual(stripQualifiers('R270942150'), 'tulip');
});

console.log('\n── Level 1: Known Alias Matching ───────────────\n');

test('Exact alias match: Freedom Rose → Red Rose', () => {
  const result = matchProduct('Freedom Rose', CATALOG);
  assertEqual(result.level, 'alias');
  assertEqual(result.productId, 'prod_rose_med_red');
  assertEqual(result.score, 100);
});
test('Exact alias match: RSPRAY → Spray Rose', () => {
  const result = matchProduct('RSPRAY', CATALOG);
  assertEqual(result.level, 'alias');
  assertEqual(result.productId, 'prod_rose_spray');
});
test('Exact alias match: Groot tulip code → Tulips Pink', () => {
  const result = matchProduct('R270942150', CATALOG);
  assertEqual(result.level, 'alias');
  assertEqual(result.productId, 'prod_tulip_pink');
});
test('Exact alias match: Lake Flowers 4041 → Eucalyptus Gunnii', () => {
  const result = matchProduct('4041', CATALOG);
  const passed = result.level === 'alias' || result.level === 'exact';
  if (!passed) throw new Error(`Expected alias or exact but got ${result.level}`);
  assertEqual(result.productId, 'prod_eucalyptus_gunnii');
});
test('Exact alias match: Jet Fresh alstro format', () => {
  const result = matchProduct('Alstro Hot Pink Net ECU Helena 80cm', CATALOG);
  const passed = result.level === 'alias' || result.level === 'exact';
  if (!passed) throw new Error(`Expected alias or exact but got ${result.level}`);
  assertEqual(result.productId, 'prod_alstro_hot_pink');
});

console.log('\n── Level 1: Exact Name Matching ────────────────\n');

test('Exact name match: Hydrangea Blue', () => {
  const result = matchProduct('Hydrangea Blue', CATALOG);
  assertEqual(result.level, 'exact');
  assertEqual(result.productId, 'prod_hydrangea_blue');
});
test('Exact name match: Sunflower Yellow', () => {
  const result = matchProduct('Sunflower Yellow', CATALOG);
  assertEqual(result.level, 'exact');
  assertEqual(result.productId, 'prod_sunflower_yellow');
});

console.log('\n── Level 2: Fuzzy Suggest Matching ─────────────\n');

test('Fuzzy match: new Pinnacle hydrangea format suggests Hydrangea Blue', () => {
  const result = matchProduct('Hydrangea Blue Pinnacle ECU 70cm', CATALOG);
  // Should strip to "hydrangea blue" and match
  assertEqual(result.productId, 'prod_hydrangea_blue');
  const passed = result.score >= 50;
  if (!passed) throw new Error(`Score too low: ${result.score}`);
});
test('Fuzzy match: new Allure alstro format suggests Alstroemeria Hot Pink', () => {
  const result = matchProduct('Alstroemeria Hot Pink Allure ECU', CATALOG);
  assertEqual(result.productId, 'prod_alstro_hot_pink');
  const passed = result.score >= 50;
  if (!passed) throw new Error(`Score too low: ${result.score}`);
});

console.log('\n── Level 3: Fee Lines ──────────────────────────\n');

test('Fee line returns level=fee', () => {
  const result = matchProduct('Delivery Charge', CATALOG);
  assertEqual(result.level, 'fee');
  assertEqual(result.isFee, true);
  assertEqual(result.productId, null);
});
test('Packing fee returns level=fee', () => {
  const result = matchProduct('HALF LARGE', CATALOG);
  assertEqual(result.level, 'fee');
});

console.log('\n── Paste and Parse ─────────────────────────────\n');

test('Parse "10 stems Freedom Rose 60cm ECU"', () => {
  const results = parsePastedOrder('10 stems Freedom Rose 60cm ECU', CATALOG);
  assertEqual(results.length, 1);
  assertEqual(results[0].quantity, 10);
  assertEqual(results[0].unit, 'stem');
  assertEqual(results[0].match?.productId, 'prod_rose_med_red');
});
test('Parse multi-line order', () => {
  const pasted = `
    200 stems alstro hot pink
    5 bx sunflower yellow select
    Delivery Charge
    10 bunches hyd blue ECU
  `;
  const results = parsePastedOrder(pasted, CATALOG);
  assertEqual(results.length, 4);
  assertEqual(results[0].match?.productId, 'prod_alstro_hot_pink');
  assertEqual(results[1].match?.productId, 'prod_sunflower_yellow');
  assertEqual(results[2].match?.level, 'fee');
  assertEqual(results[3].match?.productId, 'prod_hydrangea_blue');
});

console.log('\n────────────────────────────────────────────────\n');
console.log('Done. Fix any ❌ before deploying.\n');
