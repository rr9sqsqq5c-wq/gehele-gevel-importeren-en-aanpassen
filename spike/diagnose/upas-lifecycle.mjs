// READ-ONLY MEETSPIKE — lifecycle van projectInfo.upAxis (_upAxis in projectCoordinates.js).
// Importeert de ECHTE module. Geen web-ifc nodig: we toetsen WELKE schrijf-actie _upAxis zet.
// Schrijvers van _upAxis: module-init 'z' (:28) · registerIfcContext (:54, alleen via parseIfc)
//   · restoreProjectInfo (:252, alleen App.jsx:3945 parse-cache) · reset (:268).
import { reset as resetCoordinates, registerIfcContext, restoreProjectInfo, getProjectInfo } from "../../src/lib/projectCoordinates.js";

const up = () => getProjectInfo().upAxis;
const line = (label, val, expect) => console.log(`   ${val === expect ? '🟢' : '🔴'} ${label}: up='${val}'  (verwacht '${expect}')`);

console.log(`[init] module-state bij laden: up='${up()}'  (projectCoordinates.js:28 → 'z')`);

// ── Scenario 1: VERSE import (confirmImport → reset → parseIfc/registerIfcContext) ──
console.log(`\n1) VERSE IMPORT  (reset → registerIfcContext upAxis='y')`);
resetCoordinates();                                   // App.jsx:3917
console.log(`   na resetCoordinates(): up='${up()}'  (App.jsx:3917 → 'z')`);
registerIfcContext({ origin: { x: 0, y: 0, z: 0 }, upAxis: 'y' }, 'BIL-MOO');  // via parseIfc → ifc.js:1651
line('na registerIfcContext(y)', up(), 'y');          // → CORRECT

// ── Scenario 2: STARTUP-RESTORE opgeslagen project (loadProjectState) ──
// loadProjectState (App.jsx:4280-4304) herstelt allWalls/groups maar roept NOOIT
// registerIfcContext/restoreProjectInfo aan en herparset niet. Bij app-start is _upAxis de
// module-default 'z'. We simuleren "verse module / nieuwe sessie" met reset() (zelfde 'z').
console.log(`\n2) STARTUP-RESTORE opgeslagen project  (loadProjectState: GEEN up-as-schrijf)`);
resetCoordinates();                                   // = verse sessie, module-default 'z'
console.log(`   verse sessie: up='${up()}'`);
//  ... loadProjectState zet allWalls (heightAxis='y' per wand) maar laat _upAxis ongemoeid ...
line('na project-restore (geen registerIfcContext/restoreProjectInfo)', up(), 'y'); // 🔴 blijft 'z'
console.log(`   ⇒ getProjectInfo().upAxis='${up()}' terwijl herstelde wanden Y-up zijn → fitFacadePlane krijgt 'z'.`);

// ── Scenario 3: restoreProjectInfo MET snapshot ZONDER upAxis (degradeert naar 'z', :252) ──
console.log(`\n3) restoreProjectInfo met snapshot ZONDER upAxis  (projectCoordinates.js:252 → 'z')`);
resetCoordinates(); registerIfcContext({ origin: {x:0,y:0,z:0}, upAxis: 'y' }, 'BIL'); // eerst y
restoreProjectInfo({ origin: { x: 1, y: 2, z: 3 }, trueNorthDegrees: 0 });             // upAxis ontbreekt
line('na restoreProjectInfo(zonder upAxis)', up(), 'y'); // 🔴 wordt 'z'

// ── Scenario 4: project-state ZOU upAxis moeten dragen — restore MET upAxis fixt het ──
console.log(`\n4) CONTRA-PROEF: restoreProjectInfo MET upAxis='y' (fix-vorm)`);
resetCoordinates();
restoreProjectInfo({ origin: { x: 0, y: 0, z: 0 }, trueNorthDegrees: 0, upAxis: 'y' });
line('na restoreProjectInfo(upAxis=y)', up(), 'y'); // 🟢 zou correct zijn

// ── Scenario 5: "aanvullen" simulatie — registerIfcContext met upAxis=null laat _upAxis staan ──
console.log(`\n5) AANVULLEN-mechaniek: register met upAxis=null laat _upAxis ONGEMOEID (:53 guard)`);
console.log(`   (parseIfcZoneElements roept registerIfcContext sowieso NIET aan → geen schrijf)`);
resetCoordinates(); registerIfcContext({ origin: {x:0,y:0,z:0}, upAxis: 'y' }, 'BIL'); // y
registerIfcContext({ origin: { x: 0, y: 0, z: 0 }, upAxis: null }, 'dakranden');        // null
line('na register(upAxis=null)', up(), 'y'); // blijft 'y' → aanvullen kan up NIET naar z zetten

console.log(`\nCONCLUSIE: _upAxis wordt 'z' wanneer een sessie NIET herparset/registreert —`);
console.log(`  startup-restore (loadProjectState, App.jsx:4280) doet dat niet én project-state slaat geen upAxis op.`);
