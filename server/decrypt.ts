import crypto from 'node:crypto';
import zlib from 'node:zlib';

export type EncryptionType = 'crypt12' | 'crypt14' | 'crypt15';

interface EncryptionParams {
  ivOffset: number;
  ivLength: number;
  dbStartOffset: number;
}

const CRYPT_CONFIG: Record<EncryptionType, EncryptionParams> = {
  crypt12: { ivOffset: 51, ivLength: 16, dbStartOffset: 67 },
  crypt14: { ivOffset: 67, ivLength: 16, dbStartOffset: 190 },
  crypt15: { ivOffset: 8, ivLength: 16, dbStartOffset: 122 },
};

export const detectEncryptionType = (fileName: string): EncryptionType | null => {
  if (fileName.endsWith('.crypt12')) return 'crypt12';
  if (fileName.endsWith('.crypt14')) return 'crypt14';
  if (fileName.endsWith('.crypt15')) return 'crypt15';
  return null;
};

/**
 * Parses the 64-character hex key (E2E backup recovery key) or a raw 32-byte
 * key file / Java-serialized key file, mirroring the client-side logic that
 * used to run in the browser.
 */
export const parseKeyInput = (input: Buffer | string): Buffer => {
  if (typeof input === 'string') {
    const hex = input.trim();
    if (hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
    throw new Error('WA_BACKUP_KEY_HEX must be a 64-character hex string');
  }

  // Buffer input (key file bytes) — not the primary path for this server-side
  // setup (which expects a hex env var) but kept for completeness/testing.
  if (input.length === 32) return input;
  if (input.length === 158) return input.subarray(126, 126 + 32);

  const text = input.toString('utf8').trim();
  if (text.length === 64 && /^[0-9a-fA-F]+$/.test(text)) {
    return Buffer.from(text, 'hex');
  }

  if (input.length >= 4 && input.readUInt32BE(0) === 0xaced0005) {
    if (input.length === 59) return input.subarray(27, 59);
    for (let i = 0; i <= input.length - 36; i++) {
      if (input[i] === 0 && input[i + 1] === 0 && input[i + 2] === 0 && input[i + 3] === 32) {
        return input.subarray(i + 4, i + 4 + 32);
      }
    }
  }

  if (input.length >= 32) return input.subarray(input.length - 32);
  throw new Error('Unrecognized key format');
};

const deriveCrypt15Key = (rootKey: Buffer): Buffer => {
  const nullSeed = Buffer.alloc(32);
  const privateKey = crypto.createHmac('sha256', nullSeed).update(rootKey).digest();
  const finalKey = crypto
    .createHmac('sha256', privateKey)
    .update(Buffer.concat([Buffer.from('backup encryption', 'utf8'), Buffer.from([0x01])]))
    .digest();
  return finalKey;
};

/** Minimal protobuf varint/length-delimited reader, just enough to pull the c15 IV (field 3 -> field 1). */
const extractCrypt15Iv = (protobuf: Buffer): Buffer | null => {
  let offset = 0;
  const readVarint = (buf: Buffer, pos: { i: number }): number => {
    let result = 0;
    let shift = 0;
    while (true) {
      if (pos.i >= buf.length) throw new Error('EOF reading varint');
      const b = buf[pos.i];
      pos.i++;
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };

  const pos = { i: 0 };
  try {
    while (pos.i < protobuf.length) {
      const tag = readVarint(protobuf, pos);
      const wireType = tag & 0x07;
      const fieldNum = tag >>> 3;

      if (wireType === 2) {
        const len = readVarint(protobuf, pos);
        const payload = protobuf.subarray(pos.i, pos.i + len);
        if (fieldNum === 3) {
          const subPos = { i: 0 };
          while (subPos.i < payload.length) {
            const sTag = readVarint(payload, subPos);
            const sWire = sTag & 0x07;
            const sField = sTag >>> 3;
            if (sWire === 2) {
              const sLen = readVarint(payload, subPos);
              if (sField === 1 && sLen === 16) {
                return payload.subarray(subPos.i, subPos.i + 16);
              }
              subPos.i += sLen;
            } else break;
          }
        }
        pos.i += len;
      } else if (wireType === 0) {
        readVarint(protobuf, pos);
      } else if (wireType === 1) {
        pos.i += 8;
      } else if (wireType === 5) {
        pos.i += 4;
      } else break;
    }
  } catch {
    // Fall through to default IV handling below
  }
  return null;
};

/**
 * Decrypts a WhatsApp msgstore.db.crypt12/14/15 buffer and returns the
 * plain (decompressed) SQLite database bytes. Uses node:crypto's native
 * AES-256-GCM implementation (fast, no intermediate binary-string copies).
 */
export const decryptDatabase = (fileBuffer: Buffer, type: EncryptionType, rootKey: Buffer): Buffer => {
  const config = CRYPT_CONFIG[type];

  if (type === 'crypt15') {
    let offset = 0;
    const protobufSize = fileBuffer.readUInt8(offset);
    offset++;
    const flagByte = fileBuffer.readUInt8(offset);
    if (flagByte === 1) offset++;

    const protobufStart = offset;
    const protobufEnd = offset + protobufSize;
    const protobuf = fileBuffer.subarray(protobufStart, protobufEnd);

    const foundIv = extractCrypt15Iv(protobuf);
    const iv = foundIv || fileBuffer.subarray(8, 24);

    const tagStart = fileBuffer.length - 32;
    const ciphertext = fileBuffer.subarray(protobufEnd, tagStart);
    const authTag = fileBuffer.subarray(tagStart, fileBuffer.length - 16);

    const derivedKey = deriveCrypt15Key(rootKey);

    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return zlib.inflateSync(decrypted);
  }

  // crypt12 / crypt14
  const iv = fileBuffer.subarray(config.ivOffset, config.ivOffset + config.ivLength);
  const ciphertext =
    type === 'crypt14'
      ? fileBuffer.subarray(config.dbStartOffset)
      : fileBuffer.subarray(config.dbStartOffset, fileBuffer.length - 20);

  // Legacy formats use a 16-byte tag appended contextually; node:crypto's GCM
  // needs it split out explicitly. WhatsApp's crypt12/14 tag is the trailing
  // 16 bytes of the ciphertext region for these formats.
  const tagLength = 16;
  const actualCiphertext = ciphertext.subarray(0, ciphertext.length - tagLength);
  const authTag = ciphertext.subarray(ciphertext.length - tagLength);

  const decipher = crypto.createDecipheriv('aes-256-gcm', rootKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(actualCiphertext), decipher.final()]);

  try {
    return zlib.inflateSync(decrypted);
  } catch {
    return decrypted; // some legacy backups aren't zlib-compressed
  }
};
