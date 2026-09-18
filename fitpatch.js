/*
(c) 2026, Gianluca Regni
License: MIT (see LICENSE)

Description:
Browser port of garmin_strava_fix/fitpatch.py: lossless rewrite of the FIT `set`
messages (global 225) of a Garmin strength activity. Every other record is copied
byte for byte; header size, header CRC and file CRC are recomputed.
Also contains a minimal .zip reader (Garmin "Export Original") based on the
browser's DecompressionStream("deflate-raw").
*/

const SET_MESG_NUM = 225;
const F_DURATION = 0, F_REPS = 3, F_WEIGHT = 4, F_SET_TYPE = 5, F_CAT = 7, F_SUB = 8;
const BASE_UINT16 = 0x84;
const UINT16_INVALID = 0xFFFF;
const WEIGHT_SCALE = 16;          // FIT profile: set.weight scale 16, unit kg
const SET_TYPE_ACTIVE = 1;
const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
                   0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];

/**
 * Computes the FIT CRC-16 of a byte array
 *
 * Args:
 *     data (Uint8Array): Bytes to checksum.
 *
 * Returns:
 *     crc (number): The 16-bit FIT CRC.
 */
export function fitCrc(data) {
  let crc = 0;
  for (const byte of data) {
    let tmp = CRC_TABLE[crc & 0xF];
    crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[byte & 0xF];
    tmp = CRC_TABLE[crc & 0xF];
    crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
  }
  return crc;
}

/**
 * Walks the records of a FIT file
 *
 * Args:
 *     buf (Uint8Array): Whole file content.
 *
 * Returns:
 *     records (Array): {kind: 'def'|'data', hdr, local, start, end, def, payload}
 *         with byte offsets; def is the definition in force for the record.
 */
function parseRecords(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 12 || String.fromCharCode(...buf.slice(8, 12)) !== ".FIT")
    throw new Error("Not a FIT file");
  const headerSize = buf[0];
  const stop = headerSize + dv.getUint32(4, true);
  const defs = {}, records = [];
  let pos = headerSize;
  while (pos < stop) {
    const hdr = buf[pos];
    if (hdr & 0x80 || !(hdr & 0x40)) {
      // data message (compressed-timestamp header uses bits 5-6 for the local type)
      const local = hdr & 0x80 ? (hdr >> 5) & 0x3 : hdr & 0x0F;
      const d = defs[local];
      if (!d) throw new Error("Corrupt FIT: data before definition");
      records.push({ kind: "data", hdr, local, start: pos, end: pos + 1 + d.size, def: d });
      pos += 1 + d.size;
    } else {
      const local = hdr & 0x0F, hasDev = !!(hdr & 0x20);
      const le = buf[pos + 2] === 0;
      const global = dv.getUint16(pos + 3, le);
      const nf = buf[pos + 5];
      let p = pos + 6;
      const fields = [], devFields = [];
      for (let i = 0; i < nf; i++, p += 3) fields.push([buf[p], buf[p + 1], buf[p + 2]]);
      if (hasDev) {
        const nd = buf[p++];
        for (let i = 0; i < nd; i++, p += 3) devFields.push([buf[p], buf[p + 1], buf[p + 2]]);
      }
      const size = fields.reduce((s, f) => s + f[1], 0) + devFields.reduce((s, f) => s + f[1], 0);
      const d = { le, global, fields, devFields, size };
      defs[local] = d;
      records.push({ kind: "def", hdr, local, start: pos, end: p, def: d });
      pos = p;
    }
  }
  return records;
}

/**
 * Splits a data record payload into raw field values
 *
 * Args:
 *     buf (Uint8Array): Whole file content.
 *     rec (object): Data record from parseRecords.
 *
 * Returns:
 *     values (Map): field number -> Uint8Array of the raw value.
 *     devRaw (Uint8Array): Raw developer-field bytes.
 */
function splitData(buf, rec) {
  const values = new Map();
  let p = rec.start + 1;
  for (const [num, size] of rec.def.fields) { values.set(num, buf.slice(p, p + size)); p += size; }
  return { values, devRaw: buf.slice(p, rec.end) };
}

/**
 * Reads unsigned integers from a raw field value
 *
 * Args:
 *     raw (Uint8Array): Raw value.
 *     width (number): Element width in bytes (1, 2 or 4).
 *     le (boolean): Little endian.
 *
 * Returns:
 *     vals (Array): Decoded numbers.
 */
function uints(raw, width, le) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), out = [];
  for (let i = 0; i + width <= raw.length; i += width)
    out.push(width === 1 ? dv.getUint8(i) : width === 2 ? dv.getUint16(i, le) : dv.getUint32(i, le));
  return out;
}

/**
 * Packs a uint16 array padded with invalid values
 *
 * Args:
 *     vals (Array): uint16 values.
 *     count (number): Number of slots.
 *     le (boolean): Little endian.
 *
 * Returns:
 *     raw (Uint8Array): count*2 bytes.
 */
function packU16(vals, count, le) {
  const out = new Uint8Array(count * 2), dv = new DataView(out.buffer);
  for (let i = 0; i < count; i++) dv.setUint16(i * 2, i < vals.length ? vals[i] : UINT16_INVALID, le);
  return out;
}

/**
 * Lists the active (working) sets of a FIT file
 *
 * Args:
 *     buf (Uint8Array): Whole file content.
 *
 * Returns:
 *     sets (Array): {category (number), subtype (number|null), reps (number),
 *         weight (number, kg), duration (number, s)} in file order.
 */
export function readSets(buf) {
  const sets = [];
  for (const rec of parseRecords(buf)) {
    if (rec.kind !== "data" || rec.def.global !== SET_MESG_NUM) continue;
    const { values } = splitData(buf, rec), le = rec.def.le;
    if (values.get(F_SET_TYPE)[0] !== SET_TYPE_ACTIVE) continue;
    const cat = values.has(F_CAT) ? uints(values.get(F_CAT), 2, le)[0] : 0xFFFE;
    const sub = values.has(F_SUB) ? uints(values.get(F_SUB), 2, le)[0] : UINT16_INVALID;
    sets.push({
      category: cat,
      subtype: sub === UINT16_INVALID ? null : sub,
      reps: uints(values.get(F_REPS), 2, le)[0],
      weight: uints(values.get(F_WEIGHT), 2, le)[0] / WEIGHT_SCALE,
      duration: uints(values.get(F_DURATION), 4, le)[0] / 1000,
    });
  }
  return sets;
}

/**
 * Writes a copy of a FIT file with corrected active sets
 *
 * Args:
 *     buf (Uint8Array): Original file content.
 *     corrections (Map): active set number (1-based) -> {category, subtype (number|null),
 *         reps (optional), weight (optional, kg)}.
 *
 * Returns:
 *     out (Uint8Array): Corrected FIT file.
 */
export function patchSets(buf, corrections) {
  const chunks = [buf.slice(0, buf[0])];
  const newDefs = {};
  let active = 0;
  for (const rec of parseRecords(buf)) {
    const d = rec.def;
    if (d.global !== SET_MESG_NUM) { chunks.push(buf.slice(rec.start, rec.end)); continue; }
    if (rec.kind === "def") {
      // extend the definition with category / category_subtype if missing
      const fields = d.fields.map(f => [...f]);
      const catF = fields.find(f => f[0] === F_CAT);
      const nCat = catF ? catF[1] / 2 : 1;
      if (!catF) fields.push([F_CAT, nCat * 2, BASE_UINT16]);
      if (!fields.find(f => f[0] === F_SUB)) fields.push([F_SUB, nCat * 2, BASE_UINT16]);
      newDefs[rec.local] = { fields, nCat };
      const head = [rec.hdr, 0, d.le ? 0 : 1, 0, 0, fields.length];
      const out = new Uint8Array(head.length + fields.length * 3 +
                                 (d.devFields.length ? 1 + d.devFields.length * 3 : 0));
      out.set(head);
      new DataView(out.buffer).setUint16(3, d.global, d.le);
      let p = head.length;
      for (const f of fields) { out.set(f, p); p += 3; }
      if (d.devFields.length) { out[p++] = d.devFields.length; for (const f of d.devFields) { out.set(f, p); p += 3; } }
      chunks.push(out);
      continue;
    }
    const nd = newDefs[rec.local];
    const { values, devRaw } = splitData(buf, rec);
    const le = d.le;
    if (!values.has(F_CAT)) values.set(F_CAT, packU16([], nd.nCat, le));
    if (!values.has(F_SUB)) values.set(F_SUB, packU16([], nd.nCat, le));
    if (values.get(F_SET_TYPE)[0] === SET_TYPE_ACTIVE) {
      active += 1;
      const fix = corrections.get(active);
      if (fix) {
        values.set(F_CAT, packU16([fix.category], nd.nCat, le));
        values.set(F_SUB, packU16(fix.subtype == null ? [] : [fix.subtype], nd.nCat, le));
        if (fix.reps != null) values.set(F_REPS, packU16([fix.reps], 1, le));
        if (fix.weight != null) values.set(F_WEIGHT, packU16([Math.round(fix.weight * WEIGHT_SCALE)], 1, le));
      }
    }
    chunks.push(Uint8Array.of(rec.hdr), ...nd.fields.map(f => values.get(f[0])), devRaw);
  }
  // join, fix header data size / header CRC, append file CRC
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len + 2);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  const dv = new DataView(out.buffer), hs = out[0];
  dv.setUint32(4, len - hs, true);
  if (hs >= 14) dv.setUint16(12, fitCrc(out.subarray(0, 12)), true);
  dv.setUint16(len, fitCrc(out.subarray(0, len)), true);
  return out;
}

/**
 * Extracts the first .fit file from a zip archive
 *
 * Args:
 *     zip (Uint8Array): Zip file content (Garmin "Export Original").
 *
 * Returns:
 *     result (Promise<{name: string, data: Uint8Array}>): The .fit file name and bytes.
 */
export async function fitFromZip(zip) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // find the central directory (end record signature 0x06054b50)
  let eocd = zip.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a valid zip file");
  let p = dv.getUint32(eocd + 16, true);
  const n = dv.getUint16(eocd + 10, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!name.toLowerCase().endsWith(".fit")) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = zip.slice(start, start + csize);
    if (method === 0) return { name: name.split("/").pop(), data: raw };
    if (method !== 8) throw new Error("Unsupported zip compression");
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return { name: name.split("/").pop(), data: new Uint8Array(await new Response(stream).arrayBuffer()) };
  }
  throw new Error("No .fit file inside the zip");
}
