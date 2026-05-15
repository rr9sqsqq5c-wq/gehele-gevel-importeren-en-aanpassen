import { readFileSync } from 'fs';
const fs = { readFileSync };
const buf = fs.readFileSync('.zenflow-attachments/bc72c36d-b161-4091-a218-3363f2ca676b.pdf');
const str = buf.toString('latin1');
const matches = str.match(/BT[\s\S]*?ET/g);
if (matches) {
  matches.forEach(m => {
    const txts = m.match(/\(([^)]+)\)/g);
    if (txts) txts.forEach(t => console.log(t));
  });
}
