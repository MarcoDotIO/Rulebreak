import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FindingStatusSchema } from "@rulebreak/contracts";
import {
  CAP_STATUS_PILL,
  PITCH_CAN_SAY,
  PITCH_CAPS,
  PITCH_CHIPS,
  PITCH_DEMO_GRAVITY,
  PITCH_NON_CLAIMS,
  PITCH_NOT_CLOSED_CHIP,
} from "./pitchCaps.js";

const cap = (id: string) => {
  const found = PITCH_CAPS.find((c) => c.id === id);
  if (!found) throw new Error(`missing cap ${id}`);
  return found;
};

const allText = [
  PITCH_DEMO_GRAVITY,
  ...PITCH_CAN_SAY,
  ...PITCH_NON_CLAIMS,
  ...PITCH_CAPS.flatMap((c) => [c.title, c.pillLabel, c.body]),
].join("\n");

describe("pitch limitations honesty caps", () => {
  it("centers offline P0 as demo gravity", () => {
    expect(PITCH_DEMO_GRAVITY.toLowerCase()).toContain("offline p0");
    expect(PITCH_DEMO_GRAVITY.toLowerCase()).toContain("center of gravity");
    expect(cap("offline-p0").pillLabel).toMatch(/demo center/i);
  });

  it("keeps #48 Done with pitch not closed", () => {
    expect(cap("rb011-48").pillLabel.toLowerCase()).toContain(
      "pitch not closed",
    );
    expect(cap("rb011-48").body).toMatch(/#48/);
  });

  it("states SSH ≠ G4 and not AgenC dual sessions", () => {
    expect(cap("ssh-ne-g4").pillLabel).toMatch(/SSH≠G4/);
    const agenc = cap("not-agenc").body;
    expect(agenc).toContain("player-a");
    expect(agenc).toContain("player-b");
    expect(agenc).toMatch(/Do not describe it as AgenC dual sessions/);
  });

  it("records M13 Partial-on-UI-SSH (browser does not SSH; CLI does)", () => {
    const m13 = cap("m13-partial");
    expect(m13.pillLabel).toMatch(/Partial-on-UI-SSH/);
    expect(m13.body).toContain("browser does not run Thor SSH");
    expect(m13.body).toContain("spike:thor-dual");
  });

  it("keeps G4-P3/P4 Not run and paid cloud $0", () => {
    expect(cap("g4-not-run").pillLabel).toMatch(/Not run/);
    expect(cap("g4-not-run").body).toMatch(/G4-P3 and G4-P4 remain Not run/);
    expect(cap("g4-not-run").body).toMatch(/no jail Pass/);
    expect(cap("paid-zero").pillLabel).toMatch(/\$0/);
  });

  it("separates #50 UI enablement from a closed live pitch", () => {
    expect(cap("ui-dual-50").pillLabel).toBe("Done · pitch not closed");
    expect(cap("ui-dual-50").body).toMatch(/#50/);
  });

  it("never renders blocked_as_expected as secure", () => {
    const secure = cap("no-secure");
    expect(secure.pillLabel).toBe("blocked_as_expected ≠ secure");
    expect(secure.pillKind).toBe("blocked_as_expected");
    // No pill may be a bare/positive secure or pass badge.
    for (const c of PITCH_CAPS) {
      expect(c.pillLabel).not.toMatch(/^\s*secure\s*$/i);
      expect(c.pillLabel).not.toMatch(/\bpass\b/i);
    }
    expect(PITCH_NON_CLAIMS.join(" ")).toMatch(/"secure"/);
  });

  it("only mentions Pass / secure in negated form", () => {
    for (const line of allText.split("\n")) {
      if (/\b(G4|jail|security) Pass\b/.test(line)) {
        expect(line).toMatch(/\b(no|not|never|does not|do not)\b|A G4 Pass/i);
      }
    }
    expect(allText).not.toMatch(/\bis secure\b/i);
  });

  it("center-of-gravity pill and chip use the neutral kind", () => {
    expect(cap("offline-p0").pillKind).toBe("neutral");
    const chip = PITCH_CHIPS.find((c) => c.label === "Offline P0 = demo center");
    expect(chip?.kind).toBe("neutral");
  });

  it("no cap or chip reads as a store-backed confirmed finding", () => {
    const kinds = [
      ...PITCH_CAPS.map((c) => c.pillKind),
      ...PITCH_CHIPS.map((c) => c.kind),
    ];
    expect(FindingStatusSchema.options).toContain("confirmed");
    expect(kinds).not.toContain("confirmed");
    expect(kinds.some((k) => /secure|green|pass/i.test(k))).toBe(false);
  });

  it("exposes all required cap ids in order", () => {
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

describe("pitch-caps status pills", () => {
  const pitchKinds = () => [
    ...PITCH_CAPS.map((c) => c.pillKind),
    ...PITCH_CHIPS.map((c) => c.kind),
    PITCH_NOT_CLOSED_CHIP.kind,
  ];

  it("pins each open cap's pill text and kind to its status", () => {
    expect(
      PITCH_CAPS.filter((c) => c.status in CAP_STATUS_PILL).map((c) => [
        c.id,
        c.status,
        c.pillKind,
        c.pillLabel,
      ]),
    ).toEqual([
      ["rb011-48", "done_pitch_open", "cap_not_closed", "Done · pitch not closed"],
      ["m13-partial", "partial", "cap_partial", "Partial-on-UI-SSH"],
      ["g4-not-run", "not_run", "cap_not_run", "Not run"],
      ["ui-dual-50", "done_pitch_open", "cap_not_closed", "Done · pitch not closed"],
    ]);
    for (const c of PITCH_CAPS) {
      if (!(c.status in CAP_STATUS_PILL)) continue;
      const want = CAP_STATUS_PILL[c.status as keyof typeof CAP_STATUS_PILL];
      expect(c.pillKind).toBe(want.kind);
      expect(c.pillLabel).toContain(want.text);
    }
  });

  it("keeps G4-P3 and G4-P4 Not run", () => {
    expect(cap("g4-not-run").pillLabel).toBe("Not run");
    expect(cap("g4-not-run").pillKind).toBe("cap_not_run");
    expect(PITCH_CHIPS).toContainEqual({ kind: "cap_not_run", label: "G4-P3/P4 Not run" });
  });

  it("pins the summary chips' text and kind", () => {
    expect(PITCH_CHIPS.map((c) => [c.kind, c.label])).toEqual([
      ["neutral", "Offline P0 = demo center"],
      ["cap_not_closed", "pitch not closed"],
      ["blocked_as_expected", "SSH≠G4"],
      ["cap_not_claim", "not AgenC dual sessions"],
      ["cap_partial", "M13 Partial-on-UI-SSH"],
      ["cap_not_run", "G4-P3/P4 Not run"],
      ["blocked_as_expected", "paid $0"],
      ["blocked_as_expected", "blocked_as_expected ≠ secure"],
    ]);
    expect(PITCH_NOT_CLOSED_CHIP).toEqual({ kind: "cap_not_closed", label: "pitch not closed" });
  });

  it("no pitch pill borrows a finding status kind", () => {
    for (const status of FindingStatusSchema.options) {
      expect(pitchKinds()).not.toContain(status);
    }
  });

  it("the setup screen's pitch chip uses the shared not-closed chip", () => {
    const setup = readFileSync(new URL("./CampaignSetup.tsx", import.meta.url), "utf8");
    expect(setup).toContain("PITCH_NOT_CLOSED_CHIP.kind");
    expect(setup).not.toMatch(/kind="(candidate|inconclusive|confirmed|not_reproduced)"\s+label="pitch not closed"/);
  });

  it("each cap kind has its own outlined, unfilled, non-green style", () => {
    const css = readFileSync(
      new URL("../components/StatusPill.module.css", import.meta.url),
      "utf8",
    );
    for (const kind of ["cap_not_closed", "cap_partial", "cap_not_run", "cap_not_claim"]) {
      const rule = css.match(new RegExp(`(^|\\n)([^{}]*)\\.${kind}\\b[^{]*\\{([^}]*)\\}`));
      expect(rule, kind).not.toBeNull();
      const [, , selector, body] = rule!;
      // Not grouped with a finding-status selector.
      for (const status of FindingStatusSchema.options) {
        expect(selector).not.toContain(`.${status}`);
      }
      expect(body).toMatch(/border-style:\s*(dashed|dotted)/);
      expect(body).toMatch(/background:\s*transparent/);
      expect(body).not.toMatch(/green|teal|--ok\b|--pass\b/i);
    }
  });

  it("pill text never says verified, complete or secure (except the negated secure cap)", () => {
    const labels = [...PITCH_CAPS.map((c) => c.pillLabel), ...PITCH_CHIPS.map((c) => c.label)];
    for (const label of labels) {
      expect(label).not.toMatch(/verified|complete/i);
      if (/secure/i.test(label)) expect(label).toBe("blocked_as_expected ≠ secure");
    }
  });
});
