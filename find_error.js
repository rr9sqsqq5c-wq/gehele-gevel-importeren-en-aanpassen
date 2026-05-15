var fs = require('fs');
var d = fs.readFileSync('C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1/src/View2D.jsx', 'utf8');
var pos = 85924;
var lineNum = d.slice(0, pos).split('\n').length;
console.log('Line:', lineNum);
console.log('Context:');
console.log(d.slice(pos - 200, pos + 200));
