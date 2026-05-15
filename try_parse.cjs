var fs = require('fs');
var path = require('path');
// Try using acorn to parse the JSX file
// First check if @babel/parser is available
var filePath = 'C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1/src/View2D.jsx';
var content = fs.readFileSync(filePath, 'utf8');

// Look for common issues:
// 1. Unclosed template literals
var templateCount = 0;
var inTemplate = false;
var templateStart = -1;
for (var i = 0; i < content.length; i++) {
  var c = content[i];
  if (c === '`' && (i === 0 || content[i-1] !== '\\')) {
    if (!inTemplate) {
      inTemplate = true;
      templateStart = i;
      templateCount++;
    } else {
      inTemplate = false;
    }
  }
}
console.log('Unclosed template literal:', inTemplate);
if (inTemplate) {
  var lineNum = content.slice(0, templateStart).split('\n').length;
  console.log('Template opened at line:', lineNum);
}

// 2. Count JSX-like < and > that might be unmatched
// 3. Look for obvious issues
// Find all lines with potential issues
var lines = content.split('\n');
for (var l = 0; l < lines.length; l++) {
  var line = lines[l];
  // Look for < that are not part of <= or << or </
  if (line.match(/[^<!=]<[^=<\/\s]/)) {
    if (l >= 1918 && l <= 1925) {
      console.log('Line ' + (l+1) + ' (suspicious <):', line.trim().slice(0, 100));
    }
  }
}

// Check specifically around line 1920
console.log('\nLines 1918-1926:');
for (var k = 1917; k <= 1925; k++) {
  console.log((k+1) + ': ' + lines[k]);
}
