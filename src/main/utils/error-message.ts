/**
 * Small helpers to turn unknown thrown values into readable text
 * (RULES.md §9: errors must reach the log with usable detail).
 */

/** Best human-readable message for an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Message plus stack when available — for log files, not for the UI. */
export function errorDetail(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : String(error);
}
