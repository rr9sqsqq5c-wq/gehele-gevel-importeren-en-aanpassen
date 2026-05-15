var fs = require('fs');
var buf = fs.readFileSync('C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1/src/View2D.jsx');
// Check if file has CRLF
var hasCRLF = buf.includes(0x0d);
console.log('Has CRLF:', hasCRLF);
// Count \r\n sequences
var crlfCount = 0;
for (var i = 0; i < buf.length - 1; i++) {
  if (buf[i] === 0x0d && buf[i+1] === 0x0a) crlfCount++;
}
console.log('CRLF count:', crlfCount);
// If we assume OXC uses \n-only positions (strips \r), what would position 85924 be in the original?
var pos = 85924;
var adjustedPos = pos + crlfCount; // rough adjustment
console.log('LF count (total lines - 1):', buf.toString().split('\n').length - 1);
// Show context at OXC-adjusted position (LF-only file would have fewer bytes)
// Actually: OXC likely processes CRLF as single newline
// Find byte position in original with CRLF by adding back the extra \r
var lfOnlyPos = pos;
var originalPos = 0;
var lfSeen = 0;
for (var j = 0; j < buf.length && lfSeen < lfOnlyPos; j++) {
  if (buf[j] === 0x0d) continue; // skip \r
  lfSeen++;
  originalPos = j;
}
originalPos++;
console.log('Adjusted byte pos in CRLF file:', originalPos);
var text = buf.toString('utf8');
console.log('Context at adjusted pos:', JSON.stringify(text.slice(originalPos - 50, originalPos + 50)));
var lineNum = text.slice(0, originalPos).split('\n').length;
console.log('Line number:', lineNum);
