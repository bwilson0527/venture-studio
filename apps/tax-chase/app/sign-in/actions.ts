"use server";

import { redirect } from "next/navigation";

import { allowed, allowedForVisitor } from "@/lib/rate-limit";
import { userClient } from "@/lib/supabase-user";

export type SignInState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string; resent?: boolean };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRY_AGAIN = "That did not go through. Please try again in a moment.";
const TOO_MANY_CODES = "Too many codes have been requested. Wait an hour, then try again.";
const TOO_MANY_TRIES = "Too many tries. Wait 15 minutes, then ask for a new code.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Sign-in without a password: we email a six-digit code and the user types
 * it in. A new email address gets a new account the same way.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const intent = field(formData, "intent");
  const email = field(formData, "email").toLowerCase();

  if (intent === "restart") return { step: "email", email };

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { step: "email", email, error: "Enter your work email address." };
  }

  const db = await userClient();

  if (intent === "send" || intent === "resend") {
    // Both are counted every time, so check each before deciding.
    const perAddress = await allowedForVisitor("signInSendPerIp");
    const perEmail = await allowed("signInSendPerEmail", email);
    if (!perAddress || !perEmail) {
      return intent === "resend"
        ? { step: "code", email, error: TOO_MANY_CODES }
        : { step: "email", email, error: TOO_MANY_CODES };
    }
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      console.error("Sending a sign-in code failed:", error.status, error.code);
      const message =
        error.status === 429
          ? "A code was sent a moment ago. Check your inbox, or wait a minute and try again."
          : TRY_AGAIN;
      return intent === "resend" ? { step: "code", email, error: message } : { step: "email", email, error: message };
    }
    return { step: "code", email, resent: intent === "resend" };
  }

  const code = field(formData, "code").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(code)) {
    return { step: "code", email, error: "Enter the code from the email. It is all digits." };
  }
  const perAddress = await allowedForVisitor("signInVerifyPerIp");
  const perEmail = await allowed("signInVerifyPerEmail", email);
  if (!perAddress || !perEmail) return { step: "code", email, error: TOO_MANY_TRIES };

  const { error } = await db.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    // Wrong and expired codes come back as 4xx; anything else is on our side.
    const expected = typeof error.status === "number" && error.status >= 400 && error.status < 500;
    if (!expected) console.error("Checking a sign-in code failed:", error.status, error.code);
    return {
      step: "code",
      email,
      error: expected ? "That code is wrong or has expired. Check it, or send a new one." : TRY_AGAIN,
    };
  }
  redirect("/dashboard");
}
