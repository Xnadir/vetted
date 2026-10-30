// A deliberately bounded subset of ZIP: single-disk, stored/deflated files.
// Never extracts, follows links, or executes an archive member.
import { openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { inflateRawSync } from "node:zlib";

export const ZIP_LIMITS = Object.freeze({ archiveBytes: 64 * 1024 * 1024, totalBytes: 50 * 1024 * 1024, entries: 1000 });
const invalid = (message) => { throw new Error(`invalid or unsupported ZIP: ${message}`); };
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function readBounded(path) {
  // Avoid blocking on a FIFO before the descriptor can be checked.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) invalid("input must be a regular file");
    if (stat.size > ZIP_LIMITS.archiveBytes) invalid("archive exceeds 64 MiB");
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const n = readSync(fd, data, offset, data.length - offset, null);
      if (!n) invalid("archive changed while reading");
      offset += n;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null)) invalid("archive changed while reading");
    return data;
  } finally {
    closeSync(fd);
  }
}

function memberName(raw, flags) {
  if (!(flags & 0x800) && raw.some(b => b > 127)) invalid("non-ASCII filenames must use the UTF-8 flag");
  let name;
  try { name = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw); }
  catch { invalid("filename is not valid UTF-8"); }
  // Windows PowerShell's Compress-Archive and .NET Framework's ZipFile write "\"
  // as the separator. Read it as "/", as Info-ZIP's unzip does; every check
  // below then applies to the normalized path, so "..\" is still rejected.
  name = name.replace(/\\/g, "/");
  const parts = name.replace(/\/$/, "").split("/");
  if (raw.length > 4096 || parts.length > 32) invalid("member path exceeds 4096 bytes or 32 segments");
  if (!name || /[\\:\x00-\x1f\x7f]/.test(name) || parts.some(p => !p || p === "." || p === ".."))
    invalid(`unsafe member path ${JSON.stringify(name)}`);
  return name;
}

// A Unicode path extra field may supply a different name to other readers.
// Accept it only when it agrees byte for byte with the primary name as stored
// (before "\" is read as "/").
function checkExtra(extra, raw) {
  let p = 0;
  while (p < extra.length) {
    if (p + 4 > extra.length) invalid("truncated extra field");
    const id = extra.readUInt16LE(p), size = extra.readUInt16LE(p + 2);
    p += 4;
    if (p + size > extra.length) invalid("truncated extra field");
    if (id === 1) invalid("ZIP64 is not supported");
    if (id === 0x7075) {
      const field = extra.subarray(p, p + size);
      if (size < 5 || field[0] !== 1 || field.readUInt32LE(1) !== crc32(raw) || !field.subarray(5).equals(raw))
        invalid("conflicting Unicode path extra field");
    }
    p += size;
  }
}

function parse(data) {
  // The EOCD ends at EOF, including its optional comment (at most 65535 bytes).
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (data.readUInt32LE(p) === 0x06054b50 && p + 22 + data.readUInt16LE(p + 20) === data.length) { end = p; break; }
  }
  if (end < 0) invalid("end of central directory not found");
  const count = data.readUInt16LE(end + 10);
  const cdSize = data.readUInt32LE(end + 12), cdOffset = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || data.readUInt16LE(end + 8) !== count)
    invalid("multi-disk archives are not supported");
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) invalid("ZIP64 is not supported");
  if (count > ZIP_LIMITS.entries) invalid("entry count exceeds 1000");
  if (cdOffset + cdSize !== end) invalid("central directory bounds do not match");

  const entries = [], names = new Map();
  let p = cdOffset, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || data.readUInt32LE(p) !== 0x02014b50) invalid("truncated central directory");
    const flags = data.readUInt16LE(p + 8), method = data.readUInt16LE(p + 10);
    const crc = data.readUInt32LE(p + 16), compressed = data.readUInt32LE(p + 20), size = data.readUInt32LE(p + 24);
    const nameSize = data.readUInt16LE(p + 28), extraSize = data.readUInt16LE(p + 30), commentSize = data.readUInt16LE(p + 32);
    const offset = data.readUInt32LE(p + 42);
    const next = p + 46 + nameSize + extraSize + commentSize;
    if (next > end) invalid("truncated central directory entry");
    if (flags & ~0x80e) invalid("encrypted or unsupported entry flags");
    if (method !== 0 && method !== 8) invalid(`compression method ${method} is not supported`);
    if (data.readUInt16LE(p + 34)) invalid("multi-disk entry");
    if ([compressed, size, offset].includes(0xffffffff)) invalid("ZIP64 is not supported");
    total += size;
    if (total > ZIP_LIMITS.totalBytes) invalid("uncompressed content exceeds 50 MiB");
    const raw = data.subarray(p + 46, p + 46 + nameSize);
    const name = memberName(raw, flags), directory = name.endsWith("/");
    checkExtra(data.subarray(p + 46 + nameSize, p + 46 + nameSize + extraSize), raw);
    const attrs = data.readUInt32LE(p + 38), type = (attrs >>> 16) & 0xf000;
    if (type && type !== 0x8000 && type !== 0x4000) invalid(`non-regular member ${JSON.stringify(name)}`);
    if (((attrs & 0x10) && !directory) || (type === 0x4000 && !directory) || (type === 0x8000 && directory) || (directory && size)) invalid("inconsistent directory entry");
    const key = name.replace(/\/$/, "");
    if (names.has(key)) invalid(`duplicate member ${JSON.stringify(name)}`);
    names.set(key, directory);
    entries.push({ name, raw, directory, flags, method, crc, compressed, size, offset });
    p = next;
  }
  if (p !== end) invalid("central directory size or entry count mismatch");
  for (const key of names.keys()) {
    let parent = key;
    while (parent.includes("/")) {
      parent = parent.slice(0, parent.lastIndexOf("/"));
      if (names.get(parent) === false) invalid("member is nested below a file");
    }
  }

  // Validate every local record before inflating anything. Requiring complete,
  // non-overlapping coverage also rejects hidden/unlisted local records.
  let cursor = 0;
  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    const { offset: o, flags, method, raw, crc, compressed, size } = entry;
    if (o !== cursor || o + 30 > cdOffset || data.readUInt32LE(o) !== 0x04034b50) invalid("invalid or overlapping local header");
    const nameSize = data.readUInt16LE(o + 26), extraSize = data.readUInt16LE(o + 28);
    const start = o + 30 + nameSize + extraSize, stop = start + compressed;
    if (stop > cdOffset || data.readUInt16LE(o + 6) !== flags || data.readUInt16LE(o + 8) !== method ||
        !data.subarray(o + 30, o + 30 + nameSize).equals(raw)) invalid("local and central headers disagree");
    checkExtra(data.subarray(o + 30 + nameSize, start), raw);
    for (const [at, expected] of [[14, crc], [18, compressed], [22, size]]) {
      const actual = data.readUInt32LE(o + at);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) invalid("local and central sizes/CRC disagree");
    }
    cursor = stop;
    if (flags & 8) {
      const matches = (at) => at + 12 <= cdOffset && data.readUInt32LE(at) === crc &&
        data.readUInt32LE(at + 4) === compressed && data.readUInt32LE(at + 8) === size;
      if (matches(stop)) cursor += 12;
      else if (stop + 4 <= cdOffset && data.readUInt32LE(stop) === 0x08074b50 && matches(stop + 4)) cursor += 16;
      else invalid("invalid data descriptor");
    }
    entry.start = start;
  }
  if (cursor !== cdOffset) invalid("unlisted data before central directory");

  for (const entry of entries) {
    const packed = data.subarray(entry.start, entry.start + entry.compressed);
    let content = packed;
    if (entry.method === 8) {
      try {
        const inflated = inflateRawSync(packed, { maxOutputLength: Math.max(1, entry.size), info: true });
        content = inflated.buffer;
        if (inflated.engine.bytesWritten !== packed.length) invalid("trailing compressed data");
      } catch (err) { invalid(`cannot inflate ${JSON.stringify(entry.name)}: ${err.message}`); }
    }
    if (content.length !== entry.size || crc32(content) !== entry.crc) invalid(`size/CRC mismatch for ${JSON.stringify(entry.name)}`);
    entry.content = content;
  }
  return entries;
}

export function zipSource(path) {
  let entries;
  try { entries = parse(readBounded(path)); }
  catch (err) { throw new Error(`${path}: ${err.message}`); }
  // These are display/lookup paths only; no filesystem operation uses them.
  const root = resolve(path) + "!";
  const files = new Map(), dirs = new Map([[root, new Map()]]);
  for (const entry of entries) {
    const full = join(root, ...entry.name.replace(/\/$/, "").split("/"));
    let child = full, directory = entry.directory;
    if (!directory) files.set(full, entry.content);
    else if (!dirs.has(full)) dirs.set(full, new Map());
    while (child !== root) {
      const parent = dirname(child);
      if (!dirs.has(parent)) dirs.set(parent, new Map());
      dirs.get(parent).set(basename(child), directory);
      child = parent;
      directory = true;
    }
  }
  const source = {
    readFileSync(path, encoding) {
      const data = files.get(resolve(path));
      if (!data) throw new Error(`no archive file: ${path}`);
      return encoding ? data.toString(encoding) : data;
    },
    statSync(path) {
      path = resolve(path);
      if (!files.has(path) && !dirs.has(path)) throw new Error(`no archive entry: ${path}`);
      return { size: files.get(path)?.length ?? 0, isFile: () => files.has(path), isDirectory: () => dirs.has(path) };
    },
    existsSync(path) { path = resolve(path); return files.has(path) || dirs.has(path); },
    readdirSync(path) {
      const children = dirs.get(resolve(path));
      if (!children) throw new Error(`no archive directory: ${path}`);
      return [...children].map(([name, dir]) => ({ name, isFile: () => !dir, isDirectory: () => dir }));
    },
    // Root-level SKILL.md has no enclosing directory to check against its name.
    directoryName(path) { return path === root ? null : basename(path); },
  };
  return { root, source };
}
