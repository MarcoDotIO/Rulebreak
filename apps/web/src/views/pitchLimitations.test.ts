import { describe, expect, it } from "vitest";
import {
  PITCH_CAPS,
  PITCH_DEMO_GRAVITY,
  PITCH_NON_CLAIMS,
} from "./pitchLimitations.js";

describe("pitch limitations honesty caps", () => {
  it("centers offline P0 as demo gravity", () => {
    expect(PITCH_DEMO_GRAVITY.toLowerCase()).toContain("offline p0");
    expect(PITCH_DEMO_GRAVITY.toLowerCase()).toContain("center of gravity");
    const offline = PITCH_CAPS.find((c) => c.id === "offline-p0");
    expect(offline?.pillLabel).toMatch(/demo center/i);
  });

  it("keeps #48 Done with pitch not closed", () => {
    const rb011 = PITCH_CAPS.find((c) => c.id === "rb011-48");
    expect(rb011?.pillLabel.toLowerCase()).toContain("pitch not closed");
    expect(rb011?.body).toMatch(/#48|Done/i);
  });

  it("states SSH ≠ G4 and not AgenC dual sessions", () => {
    const ssh = PITCH_CAPS.find((c) => c.id === "ssh-ne-g4");
    const agenc = PITCH_CAPS.find((c) => c.id === "not-agenc");
    expect(ssh?.pillLabel).toMatch(/SSH≠G4/);
    expect(agenc?.body.toLowerCase()).toContain("player-a");
    expect(agenc?.body.toLowerCase()).toContain("not describe as agenc");
  });

  it("records M13 Partial-on-UI-SSH (browser does not SSH)", () => {
    const m13 = PITCH_CAPS.find((c) => c.id === "m13-partial");
    expect(m13?.pillLabel).toMatch(/Partial-on-UI-SSH/);
    expect(m13?.body.toLowerCase()).toContain("does not run thor ssh");
  });

  it("keeps G4-P3/P4 Not run and paid cloud $0", () => {
    const g4 = PITCH_CAPS.find((c) => c.id === "g4-not-run");
    const paid = PITCH_CAPS.find((c) => c.id === "paid-zero");
    expect(g4?.pillLabel).toMatch(/Not run/i);
    expect(g4?.body).toMatch(/G4-P3/);
    expect(paid?.pillLabel).toMatch(/\$0/);
  });

  it("separates #50 UI enablement from closed live pitch", () => {
    const ui = PITCH_CAPS.find((c) => c.id === "ui-dual-50");
    expect(ui?.pillLabel.toLowerCase()).toContain("closed pitch");
    expect(ui?.body).toMatch(/#50/);
  });

  it("forbids secure badge / blocked_as_expected-as-secure", () => {
    const secure = PITCH_CAPS.find((c) => c.id === "no-secure");
    expect(secure?.pillLabel.toLowerCase()).toContain("secure");
    expect(secure?.body.toLowerCase()).toContain("blocked_as_expected");
    expect(secure?.pillKind).toBe("blocked_as_expected");
    const joined = PITCH_NON_CLAIMS.join(" ").toLowerCase();
    expect(joined).toContain("secure");
    expect(joined).not.toMatch(/\bsecure pass\b/);
  });

  it("exposes all required cap ids", () => {
    expect(PITCH_CAPS.map((c) => c.id)).toEqual([
      "offline-p0",
      "rb011-48",
      "ssh-ne-g4",
      "not-agenc",
      "m13-partial",
      "g4-not-run",
      "paid-zero",
      "ui-dual-50",
      "no-secure",
    ]);
  });
});
