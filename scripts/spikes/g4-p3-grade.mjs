/**
 * G4-P3 honesty grader (offline).
 * Extracted so G4-P3 cannot Pass from empty callbackLog / bypassPermissions.
 * Used by scripts/spikes/g2-g4-offline-probes.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {{ root: string, result: (id: string, status: string, detail: string) => {id:string,status:string,detail:string} }} ctx
 */
export function gradeG4P3({ root, result }) {
  // G4-P3 = permission-callback path with real allow/deny evidence.
  // G3-P3 Pass used permissionMode=bypassPermissions → callbackLog empty.
  // Never upgrade to Pass from empty callbackLog or bypass mode.
  const artifactPath = join(root, "docs/spikes/g3-p3-ollama-artifact.json");
  if (!existsSync(artifactPath)) {
    return result(
      "G4-P3",
      "Not run",
      "no G3-P3 artifact; permission-callback path not exercised — alwaysLoad/bypassPermissions are spike labels, not G4",
    );
  }
  try {
    const art = JSON.parse(readFileSync(artifactPath, "utf8"));
    const callbacks = Array.isArray(art.callbackLog) ? art.callbackLog : [];
    const noteBlob = [
      art.permissionModeNote,
      art.permissionMode,
      art.eagerLoadNote,
      art.note,
    ]
      .filter(Boolean)
      .join(" ");
    const bypass =
      /bypassPermissions/i.test(noteBlob) ||
      art.permissionMode === "bypassPermissions";
    const emptyCallbacks = callbacks.length === 0;

    if (bypass || emptyCallbacks) {
      return result(
        "G4-P3",
        "Not run",
        "bypassPermissions spike leaves callbackLog empty — permission-callback path still deferred (not a G4 claim); alwaysLoad=eager-load workaround, bypassPermissions=spike race harness",
      );
    }

    const hasAllowDeny = callbacks.some(
      (c) => c?.decision === "allow" || c?.decision === "deny",
    );
    if (hasAllowDeny) {
      return result(
        "G4-P3",
        "Partial",
        "callbackLog has allow/deny offline — callback wiring only; not G4 containment Pass; live G2–G4 / RB-011 stays Blocked",
      );
    }
    return result(
      "G4-P3",
      "Not run",
      "callbackLog present but no allow/deny decisions — not a G4 permission proof",
    );
  } catch (err) {
    return result("G4-P3", "Not run", `G4-P3 artifact unreadable: ${err.message}`);
  }
}
