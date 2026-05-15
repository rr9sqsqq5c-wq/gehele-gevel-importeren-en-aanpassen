var fs = require('fs');
var content = fs.readFileSync('C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1/src/View2D.jsx', 'utf8');
var lines = content.split('\n');

// Track bracket/brace balance
var braceStack = [];
var issues = [];
var inString = false;
var inTemplate = 0;
var stringChar = '';
var i = 0;
while (i < content.length) {
  var c = content[i];
  var lineNum = content.slice(0, i).split('\n').length;
  
  // Skip strings
  if (!inString && !inTemplate && (c === '"' || c === "'")) {
    inString = true;
    stringChar = c;
    i++;
    while (i < content.length && content[i] !== stringChar) {
      if (content[i] === '\\') i++;
      i++;
    }
    inString = false;
    i++;
    continue;
  }
  if (!inString && !inTemplate && c === '`') {
    inTemplate++;
    i++;
    while (i < content.length && inTemplate > 0) {
      if (content[i] === '\\') { i += 2; continue; }
      if (content[i] === '`') { inTemplate--; break; }
      i++;
    }
    i++;
    continue;
  }
  // Skip line comments
  if (!inString && !inTemplate && c === '/' && content[i+1] === '/') {
    while (i < content.length && content[i] !== '\n') i++;
    continue;
  }
  
  if (!inString && !inTemplate) {
    if (c === '{') {
      braceStack.push({ char: c, line: lineNum, col: i });
    } else if (c === '}') {
      if (braceStack.length === 0) {
        issues.push('Unexpected } at line ' + lineNum);
      } else {
        braceStack.pop();
      }
    }
  }
  i++;
}

if (braceStack.length > 0) {
  console.log('Unclosed braces:', braceStack.length);
  braceStack.slice(-5).forEach(function(b) {
    console.log('  Line ' + b.line + ': {');
    console.log('  Content:', lines[b.line - 1].trim().slice(0, 80));
  });
} else {
  console.log('All braces matched!');
}
if (issues.length > 0) {
  issues.forEach(function(iss) { console.log('Issue:', iss); });
}
console.log('Total lines:', lines.length);
