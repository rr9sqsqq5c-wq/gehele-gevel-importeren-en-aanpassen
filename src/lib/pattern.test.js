/**
 * Tests voor pattern.js — Agent 3: multi-element patroonberekening
 * Uitvoeren met:  node src/lib/pattern.test.js
 */

import {
  buildAllGroupsPattern,
  buildGroupPattern,
  buildSingleWallPattern,
  buildFacePattern,
  getWallChains,
  DEFAULT_MATERIAL,
} from './pattern.js';

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}`);
    failed++;
  }
}

const MAT = DEFAULT_MATERIAL;

// ─────────────────────────────────────────────────────────────────
// Hulpdata
// ─────────────────────────────────────────────────────────────────

const wallA = {
  id: 'w1',
  length: 2000,
  height: 2600,
  openings: [],
  startPoint: { x: 0, y: 0 },
  endPoint:   { x: 2000, y: 0 },
};

const wallB = {
  id: 'w2',
  length: 1500,
  height: 2600,
  openings: [],
  startPoint: { x: 2000, y: 0 },
  endPoint:   { x: 2000, y: 1500 },
};

const wallC = {
  id: 'w3',
  length: 1000,
  height: 2600,
  openings: [],
  startPoint: { x: 5000, y: 0 },
  endPoint:   { x: 6000, y: 0 },
};

const wallWithOpening = {
  id: 'w4',
  length: 3000,
  height: 2600,
  openings: [{ x: 500, y: 0, width: 900, height: 2100 }],
  startPoint: { x: 0, y: 0 },
  endPoint:   { x: 3000, y: 0 },
};

const groups = [
  { id: 'g1', wallIds: ['w1', 'w2'], label: 'Hoekgroep' },
  { id: 'g2', wallIds: ['w3'],       label: 'Losstaand' },
];

// ─────────────────────────────────────────────────────────────────
// buildAllGroupsPattern
// ─────────────────────────────────────────────────────────────────

console.log('\n── buildAllGroupsPattern — basisgedrag ──');

const pattern = buildAllGroupsPattern(
  groups,
  [wallA, wallB, wallC],
  {},
  { material: MAT, verband: 'halfsteens', kleur: '#c00' }
);

assert('Resultaat bevat w1', 'w1' in pattern);
assert('Resultaat bevat w2', 'w2' in pattern);
assert('Resultaat bevat w3', 'w3' in pattern);
assert('w1 heeft rijen', pattern.w1.rows.length > 0);
assert('w2 heeft rijen', pattern.w2.rows.length > 0);
assert('w3 heeft rijen', pattern.w3.rows.length > 0);
assert('w1 groupId is g1', pattern.w1.groupId === 'g1');
assert('w3 groupId is g2', pattern.w3.groupId === 'g2');
assert('w1 kleur correct', pattern.w1.rows[0].pieces[0].kleur === '#c00');

// ─────────────────────────────────────────────────────────────────
// Verbandkoppeling: w1 en w2 zijn aangrenzend
// ─────────────────────────────────────────────────────────────────

console.log('\n── Verbandkoppeling (aangrenzende wanden) ──');

const rowsW1 = pattern.w1.rows;
const rowsW2 = pattern.w2.rows;

assert('w1 heeft meerdere rijen', rowsW1.length > 5);
assert('w2 heeft meerdere rijen', rowsW2.length > 5);

const w1Row0 = rowsW1[0];
const w1Row1 = rowsW1[1];
const w2Row0 = rowsW2[0];
const w2Row1 = rowsW2[1];

assert('w1 rij 0 heeft stenen', w1Row0.pieces.length > 0);
assert('w2 rij 0 heeft stenen', w2Row0.pieces.length > 0);

const w1EndX = w1Row0.pieces[w1Row0.pieces.length - 1];
const w2FirstX = w2Row0.pieces[0];

assert('w2 rij 0 begint niet op 0 (verbandkoppeling actief)', w2FirstX.start > 0 || w2FirstX.length < MAT.steenL);

// ─────────────────────────────────────────────────────────────────
// Losstaande wand: begint patroon opnieuw
// ─────────────────────────────────────────────────────────────────

console.log('\n── Losstaande wand ──');

const rowsW3 = pattern.w3.rows;
assert('w3 rij 0 begint op 0', rowsW3[0].pieces[0].start === 0);

// ─────────────────────────────────────────────────────────────────
// Per-groep instellingen
// ─────────────────────────────────────────────────────────────────

console.log('\n── Per-groep instellingen ──');

const customPattern = buildAllGroupsPattern(
  groups,
  [wallA, wallB, wallC],
  {
    g1: { material: MAT, verband: 'tegelverband', kleur: '#123456' },
    g2: { material: MAT, verband: 'wild',         kleur: '#abcdef' },
  },
  { material: MAT, verband: 'halfsteens', kleur: '#000' }
);

assert('g1 eigen verband (tegelverband)', customPattern.w1.settings.verband === 'tegelverband');
assert('g2 eigen verband (wild)',         customPattern.w3.settings.verband === 'wild');
assert('g1 eigen kleur',                 customPattern.w1.settings.kleur === '#123456');
assert('g2 eigen kleur',                 customPattern.w3.settings.kleur === '#abcdef');

// ─────────────────────────────────────────────────────────────────
// Openingen worden uitgesloten
// ─────────────────────────────────────────────────────────────────

console.log('\n── Openingen per wand ──');

const groupsWithOpening = [{ id: 'go1', wallIds: ['w4'], label: 'Wand met opening' }];
const patternWithOpening = buildAllGroupsPattern(
  groupsWithOpening,
  [wallWithOpening],
  {},
  { material: MAT, verband: 'halfsteens', kleur: '#000' }
);

const rowsW4 = patternWithOpening.w4.rows;
assert('Wand met opening heeft rijen', rowsW4.length > 0);

const doorY = 0;
const rowInDoor = rowsW4.find(r => r.y >= doorY && r.y < 2100);
if (rowInDoor) {
  const pieceInDoor = rowInDoor.pieces.find(p => p.start >= 500 && p.start < 1400);
  assert('Geen steen in opening (x=500..1400, y=0..2100)', !pieceInDoor);
} else {
  assert('Rijen onder 2100 aanwezig', false);
}

// ─────────────────────────────────────────────────────────────────
// getWallChains — ketenvolgorde
// ─────────────────────────────────────────────────────────────────

console.log('\n── getWallChains ──');

const chains = getWallChains([wallA, wallB, wallC]);
assert('3 losse wanden → minimaal 2 ketens', chains.length >= 2);

const abChain = getWallChains([wallA, wallB]);
assert('w1→w2 keten heeft 2 wanden', abChain.length === 1 && abChain[0].length === 2);
assert('w1 staat voor w2 in keten', abChain[0][0].id === 'w1' && abChain[0][1].id === 'w2');

// ─────────────────────────────────────────────────────────────────
// buildSingleWallPattern
// ─────────────────────────────────────────────────────────────────

console.log('\n── buildSingleWallPattern ──');

const singleRows = buildSingleWallPattern(wallA, MAT, 'halfsteens');
assert('Single wall heeft rijen', singleRows.length > 0);
assert('Eerste rij begint op y=0', singleRows[0].y === 0);
assert('Eerste steen begint op x=0', singleRows[0].pieces[0].start === 0);

// ─────────────────────────────────────────────────────────────────
// buildGroupPattern (legacy API)
// ─────────────────────────────────────────────────────────────────

console.log('\n── buildGroupPattern (legacy) ──');

const wallALegacy = {
  expressID: 1,
  length: 2000,
  height: 2600,
  openings: [],
  wallOrigin: { lengthStart: 0, heightStart: 0 },
};
const wallBLegacy = {
  expressID: 2,
  length: 1500,
  height: 2600,
  openings: [],
  wallOrigin: { lengthStart: 2000, heightStart: 0 },
};

const legacyResult = buildGroupPattern([wallALegacy, wallBLegacy], {}, MAT, 'halfsteens');
assert('Legacy: expressID 1 aanwezig', 1 in legacyResult);
assert('Legacy: expressID 2 aanwezig', 2 in legacyResult);
assert('Legacy: wand 1 heeft rijen',   legacyResult[1].length > 0);

// ─────────────────────────────────────────────────────────────────
// buildFacePattern
// ─────────────────────────────────────────────────────────────────

console.log('\n── buildFacePattern ──');

const faceRows = buildFacePattern(3000, 2600, MAT, 'halfsteens');
assert('buildFacePattern geeft rijen terug', faceRows.length > 0);
assert('Alle stenen passen binnen breedte', faceRows.every(r => r.pieces.every(p => p.start + p.length <= 3000 + 0.01)));

// ─────────────────────────────────────────────────────────────────
// Staand tegelverband
// ─────────────────────────────────────────────────────────────────

console.log('\n── Staand tegelverband ──');

const staandPattern = buildAllGroupsPattern(
  [{ id: 'gs', wallIds: ['w1'], label: 'Staand' }],
  [wallA],
  { gs: { material: MAT, verband: 'staand_tegelverband', kleur: '#888' } },
  {}
);
assert('Staand tegelverband: rijen aanwezig', staandPattern.w1.rows.length > 0);
assert('Staand tegelverband: label Tegel of Rest', staandPattern.w1.rows[0].pieces.every(p => p.label === 'Tegel' || p.label === 'Rest'));

// ─────────────────────────────────────────────────────────────────
// Wild verband
// ─────────────────────────────────────────────────────────────────

console.log('\n── Wild verband ──');

const wildPattern = buildAllGroupsPattern(
  [{ id: 'gw', wallIds: ['w1'], label: 'Wild' }],
  [wallA],
  { gw: { material: MAT, verband: 'wild', kleur: '#888' } },
  {}
);
assert('Wild verband: rijen aanwezig', wildPattern.w1.rows.length > 0);

const firstLengths = wildPattern.w1.rows.map(r => r.pieces[0].length);
const uniqueLengths = new Set(firstLengths);
assert('Wild verband: wisselende lengte eerste steen per rij', uniqueLengths.size > 1);

// ─────────────────────────────────────────────────────────────────
// Resultaat
// ─────────────────────────────────────────────────────────────────

console.log(`\n── Resultaat: ${passed} geslaagd, ${failed} mislukt ──\n`);
if (failed > 0) process.exit(1);
