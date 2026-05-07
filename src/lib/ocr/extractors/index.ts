import "server-only";

import type { VisionUsage } from "../client";
import type { LlmOutput, OcrModel, OcrSource } from "../types";

import { extractBbva } from "./bbva";
import { extractBcp } from "./bcp";
import { extractGeneric } from "./generic";
import { extractPlin } from "./plin";
import { extractYape } from "./yape";

export { extractYape, extractPlin, extractBbva, extractBcp, extractGeneric };

/**
 * Common signature every extractor honors. Used by the dispatcher in
 * `extractorFor` so the caller doesn't have to switch-case manually.
 */
export type ExtractorFn = (
  imageBase64: string,
  opts?: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
    signal?: AbortSignal;
  },
) => Promise<LlmOutput>;

/**
 * Dispatch helper — given a classifier verdict, returns the matching
 * extractor function. `unknown` falls through to the generic extractor.
 *
 * The pipeline entry point uses this so adding a new source later
 * (Interbank, Scotia, …) is one entry here + one extractor file +
 * one prompt + a CHECK constraint update — no switch statements
 * scattered across the codebase.
 */
export function extractorFor(source: OcrSource): ExtractorFn {
  switch (source) {
    case "yape":
      return extractYape;
    case "plin":
      return extractPlin;
    case "bbva":
      return extractBbva;
    case "bcp":
      return extractBcp;
    case "unknown":
      return extractGeneric;
  }
}
