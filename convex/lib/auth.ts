import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { fail } from "./errors";

export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) fail("UNAUTHENTICATED", "Please log in to continue.");
  return userId;
}

// Ownership check: the record must exist and belong to the signed-in user.
export function assertOwner<T extends { userId: Id<"users"> }>(
  doc: T | null,
  userId: Id<"users">,
  what = "record",
): T {
  if (!doc) fail("NOT_FOUND", `We could not find that ${what}.`);
  if (doc.userId !== userId) fail("FORBIDDEN", `You do not have access to that ${what}.`);
  return doc;
}
