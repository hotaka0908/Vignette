import { open } from "node:fs/promises";

const MAX_HEADER_BYTES = 32;

const readBoxHeader = (buffer: Buffer, offset: number) => {
  if (offset + 8 > buffer.length) return null;

  const size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;
  let boxSize = size;

  if (size === 1) {
    if (offset + 16 > buffer.length) return null;
    const high = buffer.readUInt32BE(offset + 8);
    const low = buffer.readUInt32BE(offset + 12);
    boxSize = high * 2 ** 32 + low;
    headerSize = 16;
  } else if (size === 0) {
    // Box extends to end of file; treated as unknown by caller.
    return { type, boxSize: 0, headerSize, extendsToEnd: true };
  }

  return { type, boxSize, headerSize, extendsToEnd: false };
};

interface FileLike {
  size: number;
  read: (
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ) => Promise<{ bytesRead: number }>;
}

const findChildBox = async (
  file: FileLike,
  parentStart: number,
  parentEnd: number,
  type: string,
) => {
  let cursor = parentStart;
  const header = Buffer.alloc(MAX_HEADER_BYTES);

  while (cursor < parentEnd) {
    await file.read(header, 0, MAX_HEADER_BYTES, cursor);
    const info = readBoxHeader(header, 0);
    if (!info) return null;

    if (info.type === type) {
      return { start: cursor + info.headerSize, size: info.boxSize - info.headerSize };
    }

    if (info.extendsToEnd) return null;
    cursor += info.boxSize;
  }

  return null;
};

export const getMp4DurationMs = async (path: string): Promise<number | null> => {
  let fileHandle;
  try {
    fileHandle = await open(path, "r");
    const stat = await fileHandle.stat();
    const file: FileLike = {
      size: stat.size,
      read: (buffer, offset, length, position) =>
        fileHandle!.read(buffer, offset, length, position),
    };

    // Walk top-level atoms to find moov.
    let cursor = 0;
    const header = Buffer.alloc(MAX_HEADER_BYTES);

    while (cursor < file.size) {
      await file.read(header, 0, MAX_HEADER_BYTES, cursor);
      const info = readBoxHeader(header, 0);
      if (!info) return null;

      if (info.type === "moov") {
        const moovStart = cursor + info.headerSize;
        const moovEnd = info.extendsToEnd ? file.size : cursor + info.boxSize;
        const mvhd = await findChildBox(file, moovStart, moovEnd, "mvhd");
        if (!mvhd) return null;

        // mvhd: version(1) flags(3) then version-specific fields
        const mvhdBuffer = Buffer.alloc(Math.min(mvhd.size, 32));
        await file.read(mvhdBuffer, 0, mvhdBuffer.length, mvhd.start);

        const version = mvhdBuffer.readUInt8(0);
        let timescale: number;
        let durationUnits: number;

        if (version === 1) {
          // skip creation(8) modification(8)
          timescale = mvhdBuffer.readUInt32BE(20);
          const high = mvhdBuffer.readUInt32BE(24);
          const low = mvhdBuffer.readUInt32BE(28);
          durationUnits = high * 2 ** 32 + low;
        } else {
          // version 0: creation(4) modification(4) timescale(4) duration(4)
          timescale = mvhdBuffer.readUInt32BE(12);
          durationUnits = mvhdBuffer.readUInt32BE(16);
        }

        if (!timescale) return null;
        return Math.round((durationUnits / timescale) * 1000);
      }

      if (info.extendsToEnd) return null;
      cursor += info.boxSize;
    }

    return null;
  } catch {
    return null;
  } finally {
    await fileHandle?.close();
  }
};
