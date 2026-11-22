import "server-only";

import { serverEnv } from "./env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  /** The same key within a day is delivered once, so a retried send cannot double up. */
  idempotencyKey: string;
};

export class EmailError extends Error {
  constructor(
    message: string,
    /** The provider said to slow down; nothing is wrong with this address. */
    readonly rateLimited: boolean,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

/** Send one email through Resend. Resolves to the provider's message id. */
export async function sendEmail(email: OutgoingEmail): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${serverEnv.resendApiUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: serverEnv.emailFrom,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(email.headers ? { headers: email.headers } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new EmailError(
      `email provider unreachable: ${error instanceof Error ? error.message : "unknown"}`,
      false,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  const field = (name: string) =>
    body && typeof body === "object" && name in body
      ? String((body as Record<string, unknown>)[name])
      : "";

  if (!response.ok) {
    throw new EmailError(
      `email provider refused (${response.status} ${field("name")}): ${field("message")}`,
      response.status === 429,
    );
  }
  const id = field("id");
  if (!id) throw new EmailError("email provider returned no message id", false);
  return id;
}
