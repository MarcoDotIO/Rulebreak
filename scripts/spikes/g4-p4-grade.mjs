/**
 * G4-P4 honesty grader (offline).
 * Extracted so G4-P4 cannot Pass without a real in-repo jail/mount boundary
 * plus negative FS-denial evidence. OS inventory / policy labels alone ≠ Pass.
 * Used by scripts/spikes/g2-g4-offline-probes.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Paths that would count as an in-repo worker jail / mount boundary (none today). */
const JAIL_MODULE_CANDIDATES = [
  "packages/worker-jail",
  "packages/security-policy/src/jail.ts",
  "packages/security-policy/src/mount-boundary.ts",
  "scripts/spikes/g4-p4-jail.mjs",
  "apps/server/src/worker-jail.ts",
];

const DENIAL_ARTIFACT_CANDIDATES = [
  "docs/spikes/g4-p4-fs-denial-artifact.json",
  "docs/spikes/g4-p4-jail-artifact.json",
];

/**
 * @param {{ root: string, result: (id: string, status: string, detail: string) => {id:string,status:string,detail:string} }} ctx
 */
export function gradeG4P4({ root, result }) {
  // G4-P4 = filesystem / mount denial for explorer workers.
  // G4-P7 OS inventory documents limitations — it is NOT FS denial proof.
  // Policy DeniedCapability labels (arbitrary_filesystem, evidence_store_mount)
  // are app-level intent, not an OS jail / mount boundary.
  const inventoryPath = join(root, "docs/spikes/g2-g4-os-inventory.md");
  if (existsSync(inventoryPath)) {
    // Presence of inventory (G4-P7 Pass) must never upgrade G4-P4.
    // Read only to keep the honesty coupling explicit for reviewers.
    readFileSync(inventoryPath, "utf8");
  }

  const jailHit = JAIL_MODULE_CANDIDATES.find((p) => existsSync(join(root, p)));
  const artifactRel = DENIAL_ARTIFACT_CANDIDATES.find((p) =>
    existsSync(join(root, p)),
  );

  let negativeTranscript = false;
  if (artifactRel) {
    try {
      const art = JSON.parse(readFileSync(join(root, artifactRel), "utf8"));
      negativeTranscript =
        art?.criteria?.fsDenied === true ||
        art?.criteria?.mountBoundary === true;
    } catch {
      negativeTranscript = false;
    }
  }

  // Never Pass from inventory sheet, policy enums, or missing jail wiring.
  if (!jailHit || !negativeTranscript) {
    return result(
      "G4-P4",
      "Not run",
      "no worker jail/mount boundary in-repo yet — see OS inventory; do not claim FS denial; policy DeniedCapability ≠ OS jail",
    );
  }

  // Scaffolding + negative transcript without Wizard Pass claim → Partial only.
  // Never auto-upgrade to Pass (live G2–G4 / RB-011 stays Blocked).
  return result(
    "G4-P4",
    "Partial",
    `jail module ${jailHit} + negative transcript ${artifactRel} — offline Partial only; not G4 FS Pass; Wizard boundary review required; live gates stay Blocked`,
  );
}
