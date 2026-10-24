import { ConvexError } from "convex/values";
import type { AppErrorData } from "../../shared/types";
import { COPY } from "../copy";

// Map any thrown error to the shared plain-language error shape.
export function toAppError(e: unknown): AppErrorData {
  if (e instanceof ConvexError && e.data && typeof e.data === "object" && "code" in e.data) return e.data as AppErrorData;
  const msg = e instanceof Error ? e.message : "";
  if (/InvalidSecret|InvalidAccountId|Invalid password|could not verify/i.test(msg))
    return { code: "VALIDATION", message: COPY.account.wrongCredentials, retryable: false };
  if (/already exists/i.test(msg)) return { code: "VALIDATION", message: COPY.account.emailTaken, field: "email", retryable: false };
  if (/network|fetch|connection/i.test(msg)) return { code: "UPSTREAM_UNAVAILABLE", message: COPY.common.network, retryable: true };
  return { code: "INTERNAL", message: COPY.common.unexpected, retryable: true };
}
