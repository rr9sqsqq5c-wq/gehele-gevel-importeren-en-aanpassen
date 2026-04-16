/**
 * Eenvoudige in-process tests voor adjacency.js — geen test-framework nodig.
 * Uitvoeren met:  node src/lib/adjacency.test.js
 */

import { detectAdjacency, buildGroups, mergeGroups, splitGroup } from './adjacency.js';

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

const walls = [
  { id: 'w1', name: 'A', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 0 } },
  { id: 'w2', name: 'B', startPoint: { x: 1, y: 0 }, endPoint: { x: 1, y: 1 } },
  { id: 'w3', name: 'C', startPoint: { x: 1, y: 1 }, endPoint: { x: 0, y: 1 } },
  { id: 'w4', name: 'D', startPoint: { x: 0, y: 1 }, endPoint: { x: 0, y: 0 } },
  { id: 'w5', name: 'Losstaand', startPoint: { x: 5, y: 5 }, endPoint: { x: 6, y: 5 } }
];

console.log('\n── detectAdjacency ──');
const adj = detectAdjacency(walls);
assert('w1 grenst aan w2 (gedeeld punt 1,0)',  adj.get('w1').has('w2'));
assert('w2 grenst aan w3 (gedeeld punt 1,1)',  adj.get('w2').has('w3'));
assert('w4 grenst aan w1 (gedeeld punt 0,0)',  adj.get('w4').has('w1'));
assert('w5 grenst aan niemand',                adj.get('w5').size === 0);
assert('w1 grenst NIET aan w5',               !adj.get('w1').has('w5'));

console.log('\n── buildGroups ──');
const groups = buildGroups(walls);
assert('Precies 2 groepen (rechthoek + losstaand)', groups.length === 2);
const bigGroup  = groups.find(g => g.wallIds.length === 4);
const soloGroup = groups.find(g => g.wallIds.length === 1);
assert('Rechthoekgroep heeft 4 wanden',   !!bigGroup);
assert('Losstaande groep heeft 1 wand',   !!soloGroup);
assert('Losstaande groep bevat w5',       soloGroup?.wallIds.includes('w5'));

console.log('\n── mergeGroups ──');
const merged = mergeGroups(groups, groups[0].id, groups[1].id);
assert('Na samenvoegen: 1 groep',         merged.length === 1);
assert('Samengevoegde groep: 5 wanden',   merged[0].wallIds.length === 5);

console.log('\n── splitGroup ──');
const split = splitGroup(groups, bigGroup.id, ['w1', 'w2']);
const newGroup = split.find(g => g.wallIds.includes('w1') && g.wallIds.includes('w2'));
const restGroup = split.find(g => g.wallIds.includes('w3'));
assert('Na splitsen: 3 groepen',                 split.length === 3);
assert('Nieuwe groep heeft w1 en w2',            newGroup?.wallIds.length === 2);
assert('Restgroep heeft w3 en w4',               restGroup?.wallIds.length === 2);

console.log(`\n── Resultaat: ${passed} geslaagd, ${failed} mislukt ──\n`);
if (failed > 0) process.exit(1);
