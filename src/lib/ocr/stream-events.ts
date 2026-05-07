/**
 * OCR streaming protocol — SSE event contract.
 *
 * Single source of truth shared between:
 *   - the backend SSE endpoint (`src/app/api/ocr/extract/route.ts`, Wave 2A)
 *   - the frontend consumer in `src/app/(tabs)/receipt/page.tsx` (Wave 2B)
 *
 * Both sides import the discriminated union and the wire-format helpers
 * from THIS file. Do not redefine these types anywhere else — drift here
 * would silently break the streaming UX.
 *
 * ─── Wire format ──────────────────────────────────────────────────────
 * Each event is encoded as a standards-compliant SSE frame:
 *
 *   event: <event.type>\n
 *   data: <JSON.stringify(event)>\n\n
 *
 * The `event` field is the discriminant of the union. Frames are
 * delimited by a blank line (`\n\n`). UTF-8 throughout.
 *
 * ─── Event order (happy path) ─────────────────────────────────────────
 * The pipeline emits events in roughly this order:
 *
 *   stage(compressing)
 *     → stage(uploading)
 *     → stage(classifying)
 *     → classified
 *     → stage(extracting)
 *     → partial(*) … 0..N
 *     → stage(validating)
 *     → result (ok=true | ok=false)
 *     → done
 *
 * Errors short-circuit: any irrecoverable failure emits a single
 * `error` event followed immediately by `done`. The connection then
 * closes. Recoverable model failures (low confidence, schema rejects)
 * arrive as `result(ok=false)` instead — the consumer treats the two
 * paths differently (toast + retry vs. partial fill + manual edit).
 *
 * ─── Why a discriminated union ────────────────────────────────────────
 * Each variant is exhaustively switchable in TypeScript. Adding a new
 * stage label or partial field will cause a type error in both producer
 * and consumer if the switch isn't updated — catches drift at compile
 * time, no runtime sniffing.
 */
import type { ExtractedReceipt } from "./types";

// The ExtractedReceipt is what the existing pipeline returns on success
// (LlmOutput + receiptId + modelUsed). Re-exported here so Wave 2 agents
// have one canonical import path for the streaming success payload.
export type OcrSuccessData = ExtractedReceipt;
export type { ExtractedReceipt };

/** Pipeline stages the consumer can render as a checklist or skeleton. */
export type OcrStage =
  | "compressing"
  | "uploading"
  | "classifying"
  | "extracting"
  | "validating"
  | "persisting";

/** Source labels mirror `OCR_SOURCES` in `./types`, plus an `unknown` fallback. */
export type OcrStreamSource = "yape" | "plin" | "generic" | "bcp" | "bbva" | "unknown";

/** Fields the extractor can stream piecemeal as soon as they're parsed. */
export type OcrPartialField =
  | "merchant"
  | "amount"
  | "currency"
  | "date"
  | "kind"
  | "category"
  | "destinationApp";

/** Terminal failure shapes. Maps 1:1 to existing `OcrError` variants plus
 *  transport-level failures the API route surfaces today. */
export type OcrStreamErrorKind =
  | "LOW_CONFIDENCE"
  | "VALIDATION"
  | "RATE_LIMIT"
  | "AUTH"
  | "INTERNAL"
  | "TIMEOUT";

/**
 * Discriminated union of every event the OCR stream can emit.
 *
 * The discriminant is `type` and matches the SSE `event:` line so the
 * wire format and the in-memory shape never disagree.
 */
export type OcrStreamEvent =
  | { type: "stage"; stage: OcrStage }
  | {
      type: "classified";
      source: OcrStreamSource;
      confidence: number;
    }
  | {
      type: "partial";
      field: OcrPartialField;
      value: unknown;
      confidence: number;
    }
  | { type: "result"; ok: true; data: OcrSuccessData }
  | {
      type: "result";
      ok: false;
      error: {
        kind: OcrStreamErrorKind;
        message: string;
        partial?: Partial<OcrSuccessData>;
      };
    }
  | { type: "error"; message: string }
  | { type: "done" };

// ─── Encoding (backend) ─────────────────────────────────────────────────

/**
 * Encode an event to a single SSE frame.
 *
 * Output ends with `\n\n` so concatenating frames produces a valid
 * stream. Callers can `controller.enqueue(new TextEncoder().encode(...))`
 * the result directly into a `ReadableStream`.
 */
export function encodeSseEvent(event: OcrStreamEvent): string {
  // JSON.stringify never produces a literal `\n` for plain objects, but
  // SSE forbids unescaped newlines inside a `data:` field — a single
  // `data:` line per frame keeps the parser simple on both ends.
  const payload = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${payload}\n\n`;
}

// ─── Parsing (frontend) ─────────────────────────────────────────────────

interface SseFrame {
  event?: string;
  data: string;
}

/**
 * Split a buffered chunk on SSE frame boundaries (`\n\n`).
 *
 * Returns the parsed frames AND the unconsumed tail — the caller passes
 * the tail back in on the next read so partial frames don't get lost.
 */
function splitFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundary = buffer.indexOf("\n\n", cursor);
    if (boundary === -1) break;

    const block = buffer.slice(cursor, boundary);
    cursor = boundary + 2;

    const frame: SseFrame = { data: "" };
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      // SSE allows `\r\n` too — strip a trailing CR if present.
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith(":")) continue; // comment / keep-alive
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const field = line.slice(0, colon);
      // Per spec: a single space after the colon is part of the
      // delimiter, not the value.
      const valueStart = line[colon + 1] === " " ? colon + 2 : colon + 1;
      const value = line.slice(valueStart);
      if (field === "event") frame.event = value;
      else if (field === "data") dataLines.push(value);
    }
    frame.data = dataLines.join("\n");
    if (frame.data.length > 0) frames.push(frame);
  }

  return { frames, rest: buffer.slice(cursor) };
}

/**
 * Async generator over a `fetch` Response body, yielding parsed
 * `OcrStreamEvent`s in order.
 *
 * Handles:
 *   - chunked UTF-8 decoding with surrogate-safe streaming
 *   - partial frames straddling chunk boundaries
 *   - SSE comment lines (server keep-alive heartbeats)
 *
 * Stops on `{ type: "done" }` so callers can `for await (...)` without
 * extra bookkeeping. Throws if the response has no body or returns a
 * non-2xx status — the caller decides how to surface that.
 */
export async function* parseSseStream(
  response: Response,
): AsyncGenerator<OcrStreamEvent> {
  if (!response.ok) {
    throw new Error(`SSE response not ok: ${response.status}`);
  }
  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.getReader();
  // `stream: true` lets the decoder buffer half a multi-byte sequence
  // across reads instead of inserting a replacement character.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      const { frames, rest } = splitFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame.data);
        } catch {
          // Drop malformed frames rather than crashing the whole stream.
          // The backend should never emit these; if it does, the worst
          // case is the consumer falls back to the final `result` event.
          continue;
        }
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "type" in parsed &&
          typeof (parsed as { type: unknown }).type === "string"
        ) {
          const event = parsed as OcrStreamEvent;
          yield event;
          if (event.type === "done") return;
        }
      }

      if (done) {
        // Flush any tail bytes the decoder is still holding.
        const tail = decoder.decode();
        if (tail) buffer += tail;
        const final = splitFrames(buffer);
        for (const frame of final.frames) {
          try {
            const parsed = JSON.parse(frame.data) as OcrStreamEvent;
            yield parsed;
            if (parsed.type === "done") return;
          } catch {
            // ignore malformed trailing frame
          }
        }
        return;
      }
    }
  } finally {
    // Best-effort: free the reader so the underlying socket can close
    // even if the consumer broke out of its `for await` early.
    try {
      reader.releaseLock();
    } catch {
      // already released — ignore
    }
  }
}
