// Reads assets/hamer.png, makes near-white corner pixels fully transparent,
// outputs assets/tradease-icon.png (RGBA PNG — clean rounded icon, no background box)
const fs   = require('fs');
const zlib = require('zlib');

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

// ── Parse source PNG ──────────────────────────────────────────────────────────
const src = fs.readFileSync('assets/hamer.png');
let pos = 8;
const keepChunks = [];
const idatBufs   = [];
let W, H, bitDepth, colorType, bpp;

while (pos < src.length) {
  const len  = src.readUInt32BE(pos); pos += 4;
  const type = src.slice(pos, pos + 4).toString(); pos += 4;
  const data = src.slice(pos, pos + len);            pos += len;
  pos += 4;

  if (type === 'IHDR') {
    W         = data.readUInt32BE(0);
    H         = data.readUInt32BE(4);
    bitDepth  = data[8];
    colorType = data[9];
    bpp       = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  } else if (type === 'IDAT') {
    idatBufs.push(data);
  } else if (type !== 'IEND' && type !== 'IHDR') {
    keepChunks.push({ type, data });
  }
}

console.log(`Source: ${W}x${H}  colorType=${colorType}  channels=${bpp}`);

// ── Decompress & defilter ─────────────────────────────────────────────────────
const raw    = zlib.inflateSync(Buffer.concat(idatBufs));
const stride = W * bpp;
const pixels = Buffer.alloc(H * stride);

for (let y = 0; y < H; y++) {
  const srcOff = y * (stride + 1);
  const filter = raw[srcOff];
  const dstOff = y * stride;

  for (let x = 0; x < stride; x++) {
    const byte   = raw[srcOff + 1 + x];
    const left   = x >= bpp ? pixels[dstOff + x - bpp] : 0;
    const up     = y > 0   ? pixels[dstOff - stride + x] : 0;
    const upLeft = (y > 0 && x >= bpp) ? pixels[dstOff - stride + x - bpp] : 0;
    let val;
    switch (filter) {
      case 0: val = byte; break;
      case 1: val = (byte + left) & 0xFF; break;
      case 2: val = (byte + up)   & 0xFF; break;
      case 3: val = (byte + Math.floor((left + up) / 2)) & 0xFF; break;
      case 4: {
        const pa = Math.abs(up - upLeft), pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (byte + pr) & 0xFF; break;
      }
      default: val = byte;
    }
    pixels[dstOff + x] = val;
  }
}

// ── Convert to RGBA (4 channels) ──────────────────────────────────────────────
const rgba = Buffer.alloc(H * W * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const src4 = (y * W + x) * 4;
    const srcP = (y * W + x) * bpp;
    if (bpp === 4) {
      rgba[src4]     = pixels[srcP];
      rgba[src4 + 1] = pixels[srcP + 1];
      rgba[src4 + 2] = pixels[srcP + 2];
      rgba[src4 + 3] = pixels[srcP + 3];
    } else if (bpp === 3) {
      rgba[src4]     = pixels[srcP];
      rgba[src4 + 1] = pixels[srcP + 1];
      rgba[src4 + 2] = pixels[srcP + 2];
      rgba[src4 + 3] = 255;
    } else {
      rgba[src4] = rgba[src4 + 1] = rgba[src4 + 2] = pixels[srcP];
      rgba[src4 + 3] = 255;
    }
  }
}

// ── Make near-white pixels transparent (corner background removal) ────────────
// Near-white = R>230 AND G>230 AND B>230 — the padding outside the orange rounded rect
// Anti-aliased edge pixels get partial alpha proportional to how orange they are
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];

    // How "orange" is this pixel? Orange = high R, low-mid G, low B
    const isOrange = r > 150 && r > g * 1.4 && b < 100;
    // How grey/white is this pixel?
    const isLight  = r > 220 && g > 220 && b > 220;

    if (isLight && !isOrange) {
      // Fully transparent — this is corner background
      rgba[i + 3] = 0;
    } else if (!isOrange && !isLight) {
      // Near-edge anti-aliased pixel — partial transparency based on whiteness
      const whiteness = Math.min(r, g, b) / 255;
      if (whiteness > 0.80) {
        rgba[i + 3] = Math.round((1 - whiteness) * 4 * 255);
      }
    }
  }
}

// ── Refilter (None) and compress new RGBA data ────────────────────────────────
const newStride = W * 4;
const rawOut    = Buffer.alloc(H * (newStride + 1));
for (let y = 0; y < H; y++) {
  rawOut[y * (newStride + 1)] = 0; // filter None
  rgba.copy(rawOut, y * (newStride + 1) + 1, y * newStride, (y + 1) * newStride);
}
const compressed = zlib.deflateSync(rawOut, { level: 9 });

// ── Build new IHDR with colorType=6 (RGBA) ────────────────────────────────────
function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcVal  = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8]  = 8;  // bit depth
ihdr[9]  = 6;  // colorType = RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
parts.push(chunk('IHDR', ihdr));
for (const c of keepChunks) parts.push(chunk(c.type, c.data));
parts.push(chunk('IDAT', compressed));
parts.push(chunk('IEND', Buffer.alloc(0)));

fs.writeFileSync('assets/tradease-icon.png', Buffer.concat(parts));
console.log(`Done → assets/tradease-icon.png  (${W}x${H} RGBA, transparent corners)`);
