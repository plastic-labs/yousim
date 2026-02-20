const FINALITY_PATTERNS = [
  /\bi think (we|i) (have|got) (everything|enough|all)/i,
  /\bthat('s| is) (everything|all) (i |we )?need/i,
  /\bready to (generate|create|build|craft|summarize)/i,
  /\bshall (i|we) (generate|create|proceed|go ahead)/i,
  /\bidentity (is |seems )?(complete|ready|done|finalized)/i,
  /\bperfect[.!]?\s*(i think |we |that )/i,
  /\bwonderful[.!]?\s*(i now have|let me|i('ll| will))/i,
  /\bgreat[.!]?\s*(i now have|let me|i('ll| will))/i,
];

/**
 * Heuristic: determine if a constructor conversation is "done".
 * Returns true when turn count is >= minTurns AND the latest assistant
 * response contains finality signals.
 */
export function detectDone(
  assistantResponse: string,
  turnCount: number,
  minTurns: number = 6
): boolean {
  if (turnCount < minTurns) return false;

  return FINALITY_PATTERNS.some((pattern) => pattern.test(assistantResponse));
}
