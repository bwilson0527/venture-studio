"use server";

import { validateLead } from "@studio/core/leads";

import { captureLead } from "@/lib/leads-store";

export type EarlyAccessState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<"email" | "firmName", string>> }
  | { status: "failed" }
  | { status: "done" };

export async function requestEarlyAccess(
  _previous: EarlyAccessState,
  formData: FormData,
): Promise<EarlyAccessState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
  };

  const result = validateLead({
    email: text("email"),
    firmName: text("firmName"),
    clientCount: text("clientCount"),
    website: text("website"),
  });
  if (!result.ok) return { status: "invalid", errors: result.errors };
  // A bot filled the hidden field: answer as if it worked and store nothing.
  if (result.value === null) return { status: "done" };

  try {
    await captureLead(result.value, text("source")?.trim() || null);
  } catch (error) {
    console.error("Early access sign-up failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "failed" };
  }
  return { status: "done" };
}
