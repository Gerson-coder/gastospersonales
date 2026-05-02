/**
 * Barrel for the OCR prompt strings. Each prompt is exported as a
 * `const` template literal so the build inlines it — no filesystem
 * reads at runtime, no `outputFileTracingIncludes` config needed.
 */
export { CLASSIFIER_PROMPT } from "./classifier";
export { YAPE_PROMPT } from "./yape";
export { PLIN_PROMPT } from "./plin";
export { BBVA_PROMPT } from "./bbva";
export { BCP_PROMPT } from "./bcp";
export { GENERIC_PROMPT } from "./generic";

import type { OcrSource } from "../types";
import { CLASSIFIER_PROMPT } from "./classifier";
import { YAPE_PROMPT } from "./yape";
import { PLIN_PROMPT } from "./plin";
import { BBVA_PROMPT } from "./bbva";
import { BCP_PROMPT } from "./bcp";
import { GENERIC_PROMPT } from "./generic";

/**
 * Lookup the extractor prompt for a classified source. Always returns
 * a prompt — `unknown` falls through to the generic prompt with its
 * 0.7 confidence cap.
 */
export function promptForSource(source: OcrSource): string {
  switch (source) {
    case "yape":
      return YAPE_PROMPT;
    case "plin":
      return PLIN_PROMPT;
    case "bbva":
      return BBVA_PROMPT;
    case "bcp":
      return BCP_PROMPT;
    case "unknown":
      return GENERIC_PROMPT;
  }
}

// Reference the classifier prompt to keep the import alive — consumers
// import via the named export above, not via this constant.
void CLASSIFIER_PROMPT;
