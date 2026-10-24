import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";

// C4: minimal email + password sign-in. No verification or reset (needs an email provider).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ConvexError({ code: "VALIDATION", message: "Enter a valid email address.", field: "email", retryable: false });
        }
        return { email };
      },
      validatePasswordRequirements(password: string) {
        if (password.length < 8) {
          throw new ConvexError({
            code: "VALIDATION",
            message: `Password needs 8 or more characters. Yours has ${password.length}.`,
            field: "password",
            retryable: false,
          });
        }
      },
    }),
  ],
});
