import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Walk up from this module until we find the repo's plugins/wordpress dir. */
async function resolvePluginDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [path.resolve(process.cwd(), "..", "..", "plugins", "wordpress")];
  let dir = moduleDir;
  for (let i = 0; i < 12; i++) {
    dir = path.dirname(dir);
    candidates.push(path.join(dir, "plugins", "wordpress"));
  }
  for (const c of [...new Set(candidates)]) {
    try {
      await access(path.join(c, "pushpanel.php"));
      return c;
    } catch {
      // keep walking
    }
  }
  throw new Error("plugin directory not found");
}

const FILES = ["pushpanel.php", "readme.txt"];

/** Minimal ZIP writer (deflate entries) — no external dependency. */
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const crc32 = (buf: Buffer): number => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x8021, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/** Downloadable WordPress plugin (push on publish webhook client). */
export async function GET() {
  try {
    const pluginDir = await resolvePluginDir();
    const entries = await Promise.all(
      FILES.map(async (f) => ({
        name: `pushpanel/${f}`,
        data: await readFile(path.join(pluginDir, f)),
      })),
    );
    const zip = buildZip(entries);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="pushpanel.zip"',
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "plugin not found" }, { status: 404 });
  }
}