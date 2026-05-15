import { createCanvas } from 'canvas';
import { writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const sizes = [192, 512];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  const r = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#1e293b';
  ctx.fill();

  ctx.fillStyle = '#3b82f6';
  ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('B', size / 2, size / 2 + size * 0.03);

  const buf = canvas.toBuffer('image/png');
  writeFileSync(`public/icon-${size}.png`, buf);
  console.log(`icon-${size}.png written`);
}
