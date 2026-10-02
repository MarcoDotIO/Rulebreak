import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FindingStatusSchema } from "@rulebreak/contracts";
import { PILL_KINDS } from "../components/StatusPill.js";
import {
  CAP_STATUS_COVERAGE,
  CAP_STATUS_PILL,
  PITCH_CAN_SAY,
  PITCH_CAPS,
  PITCH_CHIPS,
  PITCH_DEMO_GRAVITY,
  PITCH_NON_CLAIMS,
  PITCH_NOT_CLOSED_CHIP,
  PITCH_PILL_KINDS,
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

  it("PITCH_PILL_KINDS holds no finding status", () => {
    const findingKinds: readonly string[] = FindingStatusSchema.options;
    expect(PITCH_PILL_KINDS.filter((k) => findingKinds.includes(k))).toEqual([]);
  });

  it("no pitch pill borrows a finding status kind", () => {
    for (const status of FindingStatusSchema.options) {
      expect(pitchKinds()).not.toContain(status);
    }
  });

  it("the setup screen's pitch chip is the shared not-closed chip", () => {
    const setup = readFileSync(new URL("./CampaignSetup.tsx", import.meta.url), "utf8");
    expect(setup).toContain("<PitchPill {...PITCH_NOT_CLOSED_CHIP} />");
    // No hand-written label containing "pitch" on the setup screen.
    expect(setup).not.toMatch(/label=["{][^>]*pitch/i);
    expect(PITCH_NOT_CLOSED_CHIP.label).toBe("pitch not closed");
  });

  it("PitchLimitations renders every pill through PitchPill", () => {
    const page = readFileSync(new URL("./PitchLimitations.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/StatusPill/);
    expect(page).toMatch(/<PitchPill /);
  });

  it("every cap status is pinned in CAP_STATUS_PILL or deliberately left out", () => {
    const pinned = Object.entries(CAP_STATUS_COVERAGE)
      .filter(([, v]) => v === "pill")
      .map(([k]) => k)
      .sort();
    expect(pinned).toEqual(Object.keys(CAP_STATUS_PILL).sort());
    for (const c of PITCH_CAPS) expect(CAP_STATUS_COVERAGE).toHaveProperty(c.status);
  });

  describe("StatusPill.module.css", () => {
    const css = readFileSync(
      new URL("../components/StatusPill.module.css", import.meta.url),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    // A flat parser: it would misread @media or nested blocks. The stylesheet
    // has none; the first test below fails if one is added.
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({
      selector: sel!.trim(),
      classes: [...sel!.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!),
      decls: body!
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const k = d.indexOf(":");
          return [d.slice(0, k).trim(), d.slice(k + 1).trim()] as const;
        }),
    }));
    const capKinds = ["cap_not_closed", "cap_partial", "cap_not_run", "cap_not_claim"] as const;
    const findingKinds: readonly string[] = FindingStatusSchema.options;

    it("the stylesheet has no at-rules or nested blocks for the flat parser to misread", () => {
      expect(css).not.toMatch(/@/);
      for (const r of rules) expect(r.selector, r.selector).not.toMatch(/[{}]/);
      expect(css.split("{").length).toBe(css.split("}").length);
      expect(css.split("{").length - 1).toBe(rules.length);
    });

    it("PILL_KINDS lists exactly the pill classes in the CSS", () => {
      const classes = new Set(rules.flatMap((r) => r.classes));
      classes.delete("pill");
      expect([...classes].sort()).toEqual([...PILL_KINDS].sort());
    });

    it("no rule mixes a cap kind with a finding status", () => {
      for (const r of rules) {
        if (!r.classes.some((c) => c.startsWith("cap_"))) continue;
        expect(r.classes.filter((c) => findingKinds.includes(c)), r.selector).toEqual([]);
      }
    });

    it.each(capKinds)("%s has exactly one rule (its own selector), dashed or dotted, transparent", (kind) => {
      const own = rules.filter((r) => r.classes.includes(kind));
      expect(own.map((r) => r.selector)).toEqual([`.${kind}`]);
      const decls = own[0]!.decls;
      for (const [prop, value] of decls) {
        if (prop.startsWith("background")) {
          expect([prop, value]).toEqual(["background", "transparent"]);
        }
        if (prop.startsWith("border")) expect(value, prop).not.toMatch(/\bsolid\b/);
        expect(value, prop).not.toMatch(/green|teal|--ok\b|--pass\b/i);
      }
      expect(decls.filter(([p]) => p === "background")).toEqual([["background", "transparent"]]);
      expect(decls.filter(([p]) => p === "border-style").map(([, v]) => v)).toEqual([
        kind === "cap_not_claim" ? "dotted" : "dashed",
      ]);
    });
  });

  it("pill text never says verified, complete or secure (except the negated secure cap)", () => {
    const labels = [...PITCH_CAPS.map((c) => c.pillLabel), ...PITCH_CHIPS.map((c) => c.label)];
    for (const label of labels) {
      expect(label).not.toMatch(/verified|complete/i);
      if (/secure/i.test(label)) expect(label).toBe("blocked_as_expected ≠ secure");
    }
  });
});
