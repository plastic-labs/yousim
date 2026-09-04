/**
 * Turn provider failures into something a user can act on.
 *
 * AI SDK v5's streamText does NOT reject on a provider error. It reports on a
 * side channel (default: log to console) and the text stream simply ends
 * empty, so a try/catch around the iteration never fires. Callers must pass
 * onError and check for a captured failure once the stream finishes — see
 * streamFromModel.
 */

export class SimulationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "SimulationError";
  }
}

/** Map a provider error to an actionable message. */
export function explainProviderError(err: unknown): string {
  const e = err as { statusCode?: number; message?: string; responseBody?: string };
  const status = e?.statusCode;
  const body = `${e?.message ?? ""} ${e?.responseBody ?? ""}`;

  if (/expired/i.test(body)) {
    return "Your API key has expired. Run `yousim connect` to link a fresh one.";
  }
  if (status === 401 || /missing authentication|invalid api key|no auth/i.test(body)) {
    return (
      "The provider rejected the credential. Run `yousim connect`, or check that " +
      "the API key env var matches the active provider."
    );
  }
  if (status === 404 || /no endpoints found|model_not_found/i.test(body)) {
    return (
      "That model isn't available. Providers retire models — run `model` to see " +
      "known-good options for the current provider."
    );
  }
  if (status === 402 || /credit|quota|insufficient/i.test(body)) {
    return "The account is out of credit or quota with this provider.";
  }
  if (status === 429) {
    return "Rate limited by the provider. Wait a moment and try again.";
  }
  if (status && status >= 500) {
    return "The provider returned a server error. Usually transient — try again.";
  }

  return e?.message || "The provider call failed for an unknown reason.";
}
