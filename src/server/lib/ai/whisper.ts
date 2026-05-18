/**
 * Whisper — transcrição de áudio do WhatsApp via OpenAI.
 *
 * Espera buffer de áudio (.ogg/.mp3/.m4a). Devolve string em pt-BR.
 */

import { env } from "@/lib/env";
import { logger } from "@/server/lib/logger";

export async function transcribeAudio(
  audio: Buffer,
  opts: { mime?: string; language?: string } = {},
): Promise<{ text: string; raw: unknown }> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  const language = opts.language ?? "pt";
  const filename = `audio.${extFromMime(opts.mime)}`;
  const form = new FormData();
  const audioBytes = new Uint8Array(audio);
  form.append("file", new Blob([audioBytes], { type: opts.mime ?? "audio/ogg" }), filename);
  form.append("model", env.OPENAI_WHISPER_MODEL);
  form.append("language", language);
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.error({ status: res.status, body: errText.slice(0, 200) }, "[whisper] failed");
    throw new Error(`Whisper API failed: ${res.status}`);
  }
  const raw = (await res.json()) as { text?: string };
  return { text: raw.text ?? "", raw };
}

function extFromMime(mime?: string | null): string {
  if (!mime) return "ogg";
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  return "ogg";
}
