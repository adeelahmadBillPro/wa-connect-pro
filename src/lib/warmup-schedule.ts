// Reference schedule for safely warming up a new WhatsApp sender number.
//
// This module no longer enforces anything automatically — admin sets daily_limit
// per session manually. Kept here as a reference table for future UI hints and
// for Phase 6 if/when trust-score adjustments are wired in.

export interface WarmupPhase {
  name: string;
  fromDay: number;
  toDay: number;
  limit: number;
}

export const WARMUP_SCHEDULE: WarmupPhase[] = [
  { name: "Initial",       fromDay: 1,  toDay: 3,        limit: 20  },
  { name: "Early",         fromDay: 4,  toDay: 7,        limit: 50  },
  { name: "Building",      fromDay: 8,  toDay: 14,       limit: 100 },
  { name: "Established",   fromDay: 15, toDay: 21,       limit: 200 },
  { name: "Trusted",       fromDay: 22, toDay: 30,       limit: 350 },
  { name: "Mature",        fromDay: 31, toDay: 60,       limit: 500 },
  { name: "Veteran",       fromDay: 61, toDay: Infinity, limit: 800 },
];
