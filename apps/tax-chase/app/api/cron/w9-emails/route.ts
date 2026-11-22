import { isCronRequest } from "@/lib/cron-auth";
import { runW9Emails } from "@/lib/w9-emails";

/** The most emails one run sends. */
const BATCH = 50;
/**
 * A run stops starting new emails after this long. The scheduler that calls
 * this route may wait only 30 seconds for an answer, so a run finishes well
 * inside that and the next run, a few minutes later, carries on.
 */
const BUDGET_MS = 20_000;

export const maxDuration = 60;

/**
 * Called by the scheduler every few minutes. Sends W-9 requests that firms
 * have asked for and reminders that have come due. Runs may overlap: each
 * email is claimed in the database before it is sent.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runW9Emails(new Date(), BATCH, BUDGET_MS));
  } catch (error) {
    console.error("W-9 email run failed:", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "run_failed" }, { status: 500 });
  }
}
