import { generateMoldDXF } from '../src/lib/panelization.js';
const mat = { steenL: 210, steenH: 50, stoot: 4, lint: 10, brickWeightM2: 40 };
const moldDims = { hoogte: 270, lengte: 3400, tolerantieL: 1, tolerantieH: 1, offsetX: 0 };
let dxf;
try { dxf = generateMoldDXF(mat, 'groothuis_wildverband_2', moldDims, 'A'); }
catch (e) { console.error('GEN FOUT:', e.message); process.exit(1); }
import { writeFileSync } from 'fs';
writeFileSync('spike/_mal_A.dxf', dxf);
const has = (s) => dxf.includes(s);
const count = (s) => (dxf.match(new RegExp('\n' + s + '\n', 'g')) || []).length;
const nPoly = count('POLYLINE'), nSeq = count('SEQEND'), nVtx = count('VERTEX'), nLW = (dxf.match(/LWPOLYLINE/g) || []).length;
console.log('LWPOLYLINE aanwezig:', nLW, '(moet 0)');
console.log('POLYLINE:', nPoly, ' SEQEND:', nSeq, ' VERTEX:', nVtx ?? nVtx, nVtx);
console.log('POLYLINE == SEQEND (elke polylijn afgesloten):', nPoly === nSeq);
console.log('$ACADVER AC1009:', has('AC1009'));
console.log('$LUNITS -> 2:', /\$LUNITS\n70\n2\n/.test(dxf), ' (oude 4:', /\$LUNITS\n70\n4\n/.test(dxf), ')');
console.log('bytes:', dxf.length);
