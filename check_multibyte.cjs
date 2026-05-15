var fs = require('fs');
var buf = fs.readFileSync('C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1/src/View2D.jsx');
// Find all multi-byte UTF-8 sequences before byte 85924
var pos = 85924;
var multibytes = [];
var i = 0;
var charPos = 0;
while (i < pos) {
  var b = buf[i];
  var byteLen = 1;
  if (b >= 0xC0 && b < 0xE0) byteLen = 2;
  else if (b >= 0xE0 && b < 0xF0) byteLen = 3;
  else if (b >= 0xF0) byteLen = 4;
  if (byteLen > 1) {
    var lineNum = buf.slice(0, i).toString('utf8').split('\n').length;
    multibytes.push({ bytePos: i, charPos: charPos, byteLen: byteLen, lineNum: lineNum, char: buf.slice(i, i+byteLen).toString('utf8') });
  }
  i += byteLen;
  charPos++;
}
console.log('Multi-byte chars before pos ' + pos + ':', multibytes.length);
multibytes.slice(0, 20).forEach(function(m) {
  console.log('  BytePos:', m.bytePos, 'Line:', m.lineNum, 'Char:', JSON.stringify(m.char), 'ByteLen:', m.byteLen);
});
if (multibytes.length > 20) console.log('  ... and', multibytes.length - 20, 'more');

// If OXC uses char offsets, then the actual byte position for char 85924 would be:
// bytePos = charPos + (extra bytes from multi-byte chars)
var extraBytes = multibytes.reduce(function(acc, m) { return acc + m.byteLen - 1; }, 0);
console.log('Extra bytes from multi-byte chars:', extraBytes);
console.log('If OXC uses char offset 85924, actual byte would be:', 85924 + extraBytes);

// Conversely, if OXC uses BYTE offset 85924, what char position is that?
var charAtByte85924 = 85924 - extraBytes;
console.log('If OXC uses byte offset 85924, char pos:', charAtByte85924);
