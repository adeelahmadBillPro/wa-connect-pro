// Classifies Baileys / WhatsApp WebSocket disconnect codes so the session
// manager knows whether to (a) reconnect quietly, (b) reconnect with a
// trust-score penalty, (c) hard-stop and alert admin (banned), or (d)
// treat as explicit user logout.
//
// References:
//   https://github.com/WhiskeySockets/Baileys/blob/master/src/Types/Connection.ts
//   HTTP-style codes WhatsApp sends inside the lastDisconnect.error.output
//
// Keep this dependency-free so the values are easy to read and unit-test.

export type DisconnectKind = "recoverable" | "warning" | "banned" | "logout";

export interface DisconnectClassification {
  kind: DisconnectKind;
  reason: string;
  trustPenalty: number;   // points to subtract from trust_score
  shouldRestart: boolean; // false = stop reconnect attempts
  shouldClearAuth: boolean;
}

export function classifyDisconnect(
  statusCode: number | null | undefined,
): DisconnectClassification {
  // No status code at all → assume network blip; reconnect quietly.
  if (statusCode == null) {
    return {
      kind: "recoverable",
      reason: "Unknown / network drop",
      trustPenalty: 0,
      shouldRestart: true,
      shouldClearAuth: false,
    };
  }

  // 401 / Baileys "loggedOut" — user pressed "Log out" on their phone.
  // Auth is dead, has to rescan. (DisconnectReason.loggedOut === 401.)
  if (statusCode === 401) {
    return {
      kind: "logout",
      reason: "Explicit logout from phone (401)",
      trustPenalty: 0,
      shouldRestart: false,
      shouldClearAuth: true,
    };
  }

  // 403 / 405 / 419 — WhatsApp is actively refusing this account.
  // Continuing to reconnect can deepen the ban. Stop and alert admin.
  if (statusCode === 403 || statusCode === 405 || statusCode === 419) {
    return {
      kind: "banned",
      reason: `Banned / forbidden (${statusCode})`,
      trustPenalty: 100,
      shouldRestart: false,
      shouldClearAuth: true,
    };
  }

  // 440 (replaced — another device opened the same session) and 503
  // (service unavailable) are warning signs. Reconnect, but cost trust.
  if (statusCode === 440 || statusCode === 503) {
    return {
      kind: "warning",
      reason:
        statusCode === 440
          ? "Connection replaced (440) — another client took the session"
          : "Service unavailable (503)",
      trustPenalty: 10,
      shouldRestart: true,
      shouldClearAuth: false,
    };
  }

  // Everything else (408 timeout, 428 precondition, 500 internal, 515 stream
  // restart after QR scan, transport errors) — quiet reconnect.
  return {
    kind: "recoverable",
    reason: `Recoverable (${statusCode})`,
    trustPenalty: 0,
    shouldRestart: true,
    shouldClearAuth: false,
  };
}

// Defensive cap so trust_score never wraps below 0.
export function clampTrust(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}
