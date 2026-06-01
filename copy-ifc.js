const fs = require('fs');
const src = 'C:/Users/MurkAnneKooistraKooi/OneDrive - Kooistra Geveltechniek/Documenten/BIL-MOO-A-ZZ-PBP.ifc';
const dst = 'C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-f798/public/brickboard-a.ifc';
fs.copyFileSync(src, dst);
console.log('Gekopieerd naar public/brickboard-a.ifc');
