'use strict';
/*
 * Small PNG encoder/decoder for 8-bit RGB/RGBA, using only Node's zlib.
 * Pixel buffers in this project are always B,G,R,A (the order dump_rgba.ps1 writes).
 */

const zlib = require('zlib');

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  return crcTable;
}

function crc32(buf) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode a width*height*4 B,G,R,A buffer as an RGBA PNG. */
function encodeBGRA(bgra, width, height) {
  const raw = Buffer.allocUnsafe(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter type 0 (none)
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      raw[o++] = bgra[s + 2];
      raw[o++] = bgra[s + 1];
      raw[o++] = bgra[s];
      raw[o++] = bgra[s + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode an 8-bit RGB or RGBA PNG (any of the 5 filter types) into a B,G,R,A buffer. */
function decodeToBGRA(buf) {
  let p = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('ascii');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG: depth ${bitDepth} colorType ${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);

  let o = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[o++];
    raw.copy(line, 0, o, o + stride);
    o += stride;

    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? line[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[i] = v & 0xff;
    }

    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = line[s + 2];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    line.copy(prev);
  }
  return { width, height, bgra: out };
}

module.exports = { encodeBGRA, decodeToBGRA };
