const zlib = require('zlib');
const fs = require('fs');

function makePng(width, height, fillR, fillG, fillB) {
  function crc32(buf) {
    let c = 0xffffffff;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let k = i;
      for (let j = 0; j < 8; j++) k = (k & 1) ? (0xedb88320 ^ (k >>> 1)) : (k >>> 1);
      table[i] = k;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([typeBytes, data]);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = fillR;
      row[2 + x * 3] = fillG;
      row[3 + x * 3] = fillB;
    }
    rawRows.push(row);
  }
  const raw = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  const buf = makePng(size, size, 30, 41, 59);
  fs.writeFileSync(`public/icon-${size}.png`, buf);
  console.log(`icon-${size}.png written (${buf.length} bytes)`);
}
