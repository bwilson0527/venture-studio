import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { serverEnv } from "./env";

/** True when the request carries the scheduler's shared secret as a bearer token. */
export function isCronRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Hash both sides so the comparison takes the same time whatever was sent.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return given !== "" && timingSafeEqual(digest(given), digest(serverEnv.cronSecret));
}
