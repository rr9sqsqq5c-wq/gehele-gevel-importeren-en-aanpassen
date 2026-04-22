const fs = require('fs');
const path = 'C:\\Users\\MurkAnneKooistraKooi\\Downloads\\MAL-A.dxf';
const fd = fs.openSync(path, 'r');
const stat = require('fs').statSync(path);
const fileSize = stat.size;

// Read the file in a large chunk after the ENTITIES section (offset ~35000)
// Search for LINE and POLYLINE entities with large dimensions
const chunkSize = 1000000; // 1MB
const buf = Buffer.alloc(chunkSize);
const n = fs.readSync(fd, buf, 0, chunkSize, 35000);
const txt = buf.toString('ascii', 0, n);

// Parse and show all LINE entities with their coordinates
const lineRe = /\n\s*0\r?\n\s*LINE\r?\n[\s\S]*?\n\s*10\r?\n\s*([\d.\-]+)\r?\n\s*20\r?\n\s*([\d.\-]+)\r?\n[\s\S]*?\n\s*11\r?\n\s*([\d.\-]+)\r?\n\s*21\r?\n\s*([\d.\-]+)/g;

let m;
let lines = [];
let count = 0;
while ((m = lineRe.exec(txt)) !== null && count < 50) {
  const x1 = parseFloat(m[1]), y1 = parseFloat(m[2]);
  const x2 = parseFloat(m[3]), y2 = parseFloat(m[4]);
  const dx = Math.abs(x2-x1), dy = Math.abs(y2-y1);
  // Only show long lines (>50mm)
  if (dx > 50 || dy > 50) {
    console.log(`LINE: (${x1},${y1}) -> (${x2},${y2}) | dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
    count++;
  }
}

// Also look for POLYLINE/LWPOLYLINE vertex lists
// Search for any sequence of 10,20 pairs (x,y coordinates)
const coordPairs = [];
const coordRe = /\n\s*10\r?\n\s*([\d.\-]+)\r?\n\s*20\r?\n\s*([\d.\-]+)/g;
let cm;
while ((cm = coordRe.exec(txt)) !== null && coordPairs.length < 100) {
  const x = parseFloat(cm[1]), y = parseFloat(cm[2]);
  if (x > 0 && x < 10000 && y > 0 && y < 5000) {
    coordPairs.push([x, y]);
  }
}

console.log('\nFirst 50 coordinate pairs (x,y) > 0:');
coordPairs.slice(0, 50).forEach(([x,y]) => console.log(`  ${x.toFixed(2)}, ${y.toFixed(2)}`));

fs.closeSync(fd);
