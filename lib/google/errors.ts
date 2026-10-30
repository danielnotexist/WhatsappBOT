import { GoogleApiError } from "./client";
import { GoogleOAuthError } from "./oauth";
import { DownloadTooLargeError } from "@/lib/http/capped-body";

/** A Google failure as a short machine-readable tool result (the model words the Hebrew reply). */
export function googleErrorOutput(e: unknown): { error: string } {
  if (e instanceof DownloadTooLargeError) return { error: "too_large" };
  if (e instanceof GoogleOAuthError) return { error: e.needsReconnect ? "connection_expired" : e.code };
  if (e instanceof GoogleApiError) return { error: e.unauthorized ? "connection_expired" : e.insufficientScope ? "missing_permission" : e.retryable ? "provider_down" : e.notFound ? "not_found" : e.message };
  return { error: (e as Error).message };
}
