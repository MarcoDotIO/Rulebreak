# ADR-002: Pin AgenC CLI 0.17.0 + tag-matched SDK

- **Status:** Proposed (RB-003)
- **Date:** 2026-09-15
- **Owners:** Engineer Overlord (integration), Backend Architect Wizard (review)

## Context

`@tetsuo-ai/agenc@0.17.0` is published. `@tetsuo-ai/agenc-sdk` is **not** on the npm registry. Untagged `agenc-core` main SDK requires daemon protocol features beyond the 0.17.0 runtime (plugin storage authority), so `createSession` fails against the published daemon (protocol 1.2.0).

## Decision

1. Depend on `@tetsuo-ai/agenc@0.17.0` from npm.
2. Vendor `@tetsuo-ai/agenc-sdk@0.3.0` built from git tag `agenc-v0.17.0` at `vendor/agenc-sdk-0.3.0-v017` until the package is published.
3. Use separate absolute `AGENC_HOME` directories per explorer for MCP isolation (charter §10 fallback).
4. Keep live Grok disabled until BYOK/spend approval; offline spike may use local Ollama.

## Consequences

- Worker code must not import a newer SDK API surface without a new ADR and runtime bump.
- Reviewers must treat vendored SDK as a pin, not a fork with local edits.
