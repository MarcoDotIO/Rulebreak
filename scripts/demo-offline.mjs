#!/usr/bin/env node
/**
 * Offline scripted demo entry (RB-008).
 * Uses tsx-less path via vitest/vite? Node can't load .ts exports directly.
 * Prefer npm test for verification; this script documents the intended command.
 */
console.error(
  "demo:offline: run `npm test -- tests/integration/scripted-campaign.test.ts` until the TS runner lands.",
);
console.error("Scripted faulty campaign is covered by RB-008 integration tests.");
process.exit(0);
