/**
 * Storage local em filesystem. MVP — pode trocar por R2/S3 trocando este arquivo.
 *
 * Convenção de path:
 *   <STORAGE_DIR>/<tenant_id>/<yyyy-mm>/<uuid>.<ext>
 *
 * Para servir publicamente: o handler /api/media/[id] (a criar) lê este arquivo
 * com checagem de tenant. Não há acesso direto pela rota /storage.
 */

import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export type SavedFile = {
  storageKey: string; // path relativo a STORAGE_DIR
  absolutePath: string;
  sizeBytes: number;
};

function monthSlug(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function extFromMime(mime: string | undefined | null, fallback = "bin"): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[mime.toLowerCase()] ?? fallback;
}

export async function saveBuffer(
  tenantId: string,
  buffer: Buffer | Uint8Array,
  opts: { mime?: string; ext?: string } = {},
): Promise<SavedFile> {
  const id = randomUUID();
  const ext = opts.ext ?? extFromMime(opts.mime);
  const dir = path.join(env.STORAGE_DIR, tenantId, monthSlug(new Date()));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const absolutePath = path.join(dir, filename);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await fs.writeFile(absolutePath, buf);
  const storageKey = path.relative(env.STORAGE_DIR, absolutePath);
  return { storageKey, absolutePath, sizeBytes: buf.byteLength };
}

export async function readBuffer(storageKey: string): Promise<Buffer> {
  return fs.readFile(path.join(env.STORAGE_DIR, storageKey));
}

export function streamFile(storageKey: string) {
  return createReadStream(path.join(env.STORAGE_DIR, storageKey));
}

/**
 * Verifica que `storageKey` pertence ao tenant — proteção contra path traversal
 * ou acesso cruzado. Usar antes de servir publicamente.
 */
export function assertStorageKeyBelongsToTenant(storageKey: string, tenantId: string): void {
  const normalized = path.normalize(storageKey);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("invalid storage key");
  }
  const [first] = normalized.split(path.sep);
  if (first !== tenantId) {
    throw new Error("storage key does not belong to tenant");
  }
}
