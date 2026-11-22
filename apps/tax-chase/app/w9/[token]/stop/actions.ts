"use server";

import { stopReminders } from "@/lib/portal-store";

export type StopState = { status: "idle" | "done" | "gone" | "failed" };

export async function stopW9Reminders(token: string): Promise<StopState> {
  try {
    return { status: (await stopReminders(token)) ? "done" : "gone" };
  } catch (error) {
    console.error("Stopping reminders failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "failed" };
  }
}
