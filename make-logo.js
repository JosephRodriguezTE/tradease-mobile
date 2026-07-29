// Reads assets/hamer.png (orange bg + black hammer)
// Flips dark pixels → white, saves as assets/hammer-icon.png
const fs   = require('fs');
const zlib = require('zlib');

// ── CRC32 ─────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Parse PNG ─────────────────────────────────────────────────────────────
const src = fs.readFileSync('assets/hamer.png');
let pos = 8;
const keepChunks = [];
const idatBufs   = [];
let W, H, bitDepth, colorType, bpp;

while (pos < src.length) {
  const len  = src.readUInt32BE(pos); pos += 4;
  const type = src.slice(pos, pos + 4).toString(); pos += 4;
  const data = src.slice(pos, pos + len);            pos += len;
  pos += 4; // skip CRC

  if (type === 'IHDR') {
    W         = data.readUInt32BE(0);
    H         = data.readUInt32BE(4);
    bitDepth  = data[8];
    colorType = data[9];
    // 2=RGB  6=RGBA  4=Gray+Alpha  0=Gray
    bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
    keepChunks.push({ type, data });
  } else if (type === 'IDAT') {
    idatBufs.push(data);
  } else if (type !== 'IEND') {
    keepChunks.push({ type, data });
  }
}

console.log(`Image: ${W}x${H}  colorType=${colorType}  channels=${bpp}`);

// ── Decompress & defilter → flat pixel array ──────────────────────────────
const raw     = zlib.inflateSync(Buffer.concat(idatBufs));
const stride  = W * bpp;
const pixels  = Buffer.alloc(H * stride);

for (let y = 0; y < H; y++) {
  const srcOff = y * (stride + 1);
  const filter = raw[srcOff];
  const dstOff = y * stride;

  for (let x = 0; x < stride; x++) {
    const byte    = raw[srcOff + 1 + x];
    const left    = x >= bpp ? pixels[dstOff + x - bpp] : 0;
    const up      = y > 0   ? pixels[dstOff - stride + x] : 0;
    const upLeft  = (y > 0 && x >= bpp) ? pixels[dstOff - stride + x - bpp] : 0;

    let val;
    switch (filter) {
      case 0: val = byte; break;
      case 1: val = (byte + left) & 0xFF; break;
      case 2: val = (byte + up)   & 0xFF; break;
      case 3: val = (byte + Math.floor((left + up) / 2)) & 0xFF; break;
      case 4: {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (byte + pr) & 0xFF;
        break;
      }
      default: val = byte;
    }
    pixels[dstOff + x] = val;
  }
}

// ── Flip dark pixels → white ──────────────────────────────────────────────
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * bpp;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 110) {          // dark = hammer outline
      pixels[i]     = 255;   // → white
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    }
  }
}

// ── Refilter (filter 0 = None) & recompress ───────────────────────────────
const rawOut = Buffer.alloc(H * (stride + 1));
for (let y = 0; y < H; y++) {
  rawOut[y * (stride + 1)] = 0; // filter None
  pixels.copy(rawOut, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const compressed = zlib.deflateSync(rawOut, { level: 9 });

// ── Write PNG ─────────────────────────────────────────────────────────────
function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf  = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcVal  = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const parts = [
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
];
for (const c of keepChunks) parts.push(chunk(c.type, c.data));
parts.push(chunk('IDAT', compressed));
parts.push(chunk('IEND', Buffer.alloc(0)));

fs.writeFileSync('assets/hammer-icon.png', Buffer.concat(parts));
console.log('Done → assets/hammer-icon.png');
