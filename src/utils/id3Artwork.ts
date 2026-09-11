export interface Id3Picture {
  mime: string;
  ext: string;
  data: Uint8Array;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function synchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

function asciiText(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(bytes[offset + i]);
  }
  return text;
}

function extForMime(mime: string, data: Uint8Array): string {
  const normalized = mime.split(';')[0].trim().toLowerCase();
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('gif')) return '.gif';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg';
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return '.png';
  }
  if (data.length >= 4 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
    return '.webp';
  }
  return '.jpg';
}

export function extractId3Picture(bytes: Uint8Array): Id3Picture | null {
  if (bytes.length < 10) {
    return null;
  }
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return null;
  }
  const tagSize = synchsafeInt(bytes, 6);
  const tagEnd = 10 + tagSize;
  if (tagEnd > bytes.length) {
    return null;
  }
  let offset = 10;
  while (offset + 10 <= tagEnd) {
    const frameId = asciiText(bytes, offset, 4);
    const frameSize = readInt32(bytes, offset + 4);
    if (frameSize < 0) {
      break;
    }
    const frameStart = offset + 10;
    const frameEnd = Math.min(bytes.length, frameStart + frameSize);
    if (frameId === 'APIC' && frameStart < frameEnd) {
      const encoding = bytes[frameStart];
      let pos = frameStart + 1;
      let mime = '';
      while (pos < frameEnd && bytes[pos] !== 0) {
        mime += String.fromCharCode(bytes[pos]);
        pos += 1;
      }
      pos += 1;
      if (pos >= frameEnd) {
        offset += 10 + frameSize;
        continue;
      }
      pos += 1;
      if (encoding === 0) {
        while (pos < frameEnd && bytes[pos] !== 0) {
          pos += 1;
        }
        pos += 1;
      } else {
        while (pos + 1 < frameEnd && !(bytes[pos] === 0 && bytes[pos + 1] === 0)) {
          pos += 1;
        }
        pos += 2;
      }
      if (pos < frameEnd && frameEnd - pos >= 128) {
        const data = bytes.subarray(pos, frameEnd);
        return {
          mime: mime || 'image/jpeg',
          ext: extForMime(mime, data),
          data,
        };
      }
    }
    offset += 10 + frameSize;
  }
  return null;
}

export function bytesToBase64(input: Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 3 <= input.length; i += 3) {
    const n = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
    result += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const remaining = input.length - i;
  if (remaining === 1) {
    const n = input[i] << 16;
    result += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const n = (input[i] << 16) | (input[i + 1] << 8);
    result += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return result;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const size = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(size);
  let o = 0;
  let i = 0;
  while (i < clean.length) {
    const c0 = B64.indexOf(clean[i++]);
    const c1 = B64.indexOf(clean[i++]);
    const c2 = clean[i] === '=' ? 0 : B64.indexOf(clean[i]);
    if (clean[i] !== '=') {
      i += 1;
    }
    const c3 = clean[i] === '=' ? 0 : B64.indexOf(clean[i]);
    if (clean[i] !== '=') {
      i += 1;
    }
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      break;
    }
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < out.length) {
      out[o++] = (n >> 16) & 0xff;
    }
    if (o < out.length) {
      out[o++] = (n >> 8) & 0xff;
    }
    if (o < out.length) {
      out[o++] = n & 0xff;
    }
  }
  return out.subarray(0, o);
}