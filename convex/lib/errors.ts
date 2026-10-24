import { ConvexError } from "convex/values";
import type { AppErrorData, ErrorCode } from "../../shared/types";

// One error shape everywhere: { code, message, field?, retryable }. Plain language, no internals.
export function fail(code: ErrorCode, message: string, opts: { field?: string; retryable?: boolean } = {}): never {
  const data: AppErrorData = { code, message, retryable: opts.retryable ?? false };
  if (opts.field) data.field = opts.field;
  throw new ConvexError(data);
}

export function errorBody(code: ErrorCode, message: string, retryable = false) {
  return { error: { code, message, retryable } };
}
