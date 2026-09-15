import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ActionEnvelope,
  ActionResult,
  Campaign,
  CampaignEvent,
  Finding,
  InvariantViolation,
  WorldState,
} from "@rulebreak/contracts";

export type PersistedActionRow = {
  campaignId: string;
  sequence: number;
  transportDispatchId: string;
  logicalActionId: string;
  envelopeJson: string;
  resultJson: string;
  preStateHash: string;
  postStateHash: string;
  worldJson: string;
};

export class EvidenceStore {
  readonly #db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#db.exec("PRAGMA foreign_keys = ON;");
    this.#migrate();
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        outcome TEXT,
        stop_requested INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS actions (
        campaign_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        transport_dispatch_id TEXT NOT NULL,
        logical_action_id TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        pre_state_hash TEXT NOT NULL,
        post_state_hash TEXT NOT NULL,
        world_json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, sequence),
        UNIQUE (campaign_id, transport_dispatch_id),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        campaign_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, sequence),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );
      CREATE TABLE IF NOT EXISTS findings (
        finding_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        json TEXT NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );
      CREATE TABLE IF NOT EXISTS violations (
        campaign_id TEXT NOT NULL,
        finding_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, sequence),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );
    `);
  }

  createCampaign(campaign: Campaign): void {
    this.#db
      .prepare(
        `INSERT INTO campaigns (campaign_id, json, stop_requested) VALUES (?, ?, ?)`,
      )
      .run(campaign.campaignId, JSON.stringify(campaign), campaign.stopRequested ? 1 : 0);
  }

  getCampaign(campaignId: string): Campaign | null {
    const row = this.#db
      .prepare(`SELECT json FROM campaigns WHERE campaign_id = ?`)
      .get(campaignId) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Campaign) : null;
  }

  updateCampaign(campaign: Campaign, outcome?: string): void {
    this.#db
      .prepare(
        `UPDATE campaigns SET json = ?, stop_requested = ?, outcome = COALESCE(?, outcome) WHERE campaign_id = ?`,
      )
      .run(
        JSON.stringify(campaign),
        campaign.stopRequested ? 1 : 0,
        outcome ?? null,
        campaign.campaignId,
      );
  }

  findActionByDispatch(
    campaignId: string,
    transportDispatchId: string,
  ): PersistedActionRow | null {
    const row = this.#db
      .prepare(
        `SELECT campaign_id as campaignId, sequence, transport_dispatch_id as transportDispatchId,
                logical_action_id as logicalActionId, envelope_json as envelopeJson,
                result_json as resultJson, pre_state_hash as preStateHash,
                post_state_hash as postStateHash, world_json as worldJson
         FROM actions WHERE campaign_id = ? AND transport_dispatch_id = ?`,
      )
      .get(campaignId, transportDispatchId) as PersistedActionRow | undefined;
    return row ?? null;
  }

  /**
   * Persist action + world snapshot + event in one transaction.
   * Returns 'duplicate' when the same dispatch id already exists with identical envelope.
   * Throws when the same dispatch id exists with a different payload.
   */
  persistAcceptedAction(input: {
    campaignId: string;
    sequence: number;
    envelope: ActionEnvelope;
    result: ActionResult;
    preStateHash: string;
    postStateHash: string;
    world: WorldState;
    event: CampaignEvent;
  }): "inserted" | "duplicate" {
    const existing = this.findActionByDispatch(
      input.campaignId,
      input.envelope.transportDispatchId,
    );
    if (existing) {
      if (existing.envelopeJson === JSON.stringify(input.envelope)) {
        return "duplicate";
      }
      throw new Error(
        `dispatch id reused with different payload: ${input.envelope.transportDispatchId}`,
      );
    }

    const insertAction = this.#db.prepare(`
      INSERT INTO actions (
        campaign_id, sequence, transport_dispatch_id, logical_action_id,
        envelope_json, result_json, pre_state_hash, post_state_hash, world_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEvent = this.#db.prepare(`
      INSERT INTO events (campaign_id, sequence, event_id, json) VALUES (?, ?, ?, ?)
    `);

    const tx = this.#db.prepare("BEGIN IMMEDIATE");
    const commit = this.#db.prepare("COMMIT");
    const rollback = this.#db.prepare("ROLLBACK");
    tx.run();
    try {
      insertAction.run(
        input.campaignId,
        input.sequence,
        input.envelope.transportDispatchId,
        input.envelope.logicalActionId,
        JSON.stringify(input.envelope),
        JSON.stringify(input.result),
        input.preStateHash,
        input.postStateHash,
        JSON.stringify(input.world),
      );
      insertEvent.run(
        input.campaignId,
        input.event.sequence,
        input.event.eventId,
        JSON.stringify(input.event),
      );
      commit.run();
      return "inserted";
    } catch (error) {
      rollback.run();
      throw error;
    }
  }

  appendEvent(event: CampaignEvent): void {
    this.#db
      .prepare(
        `INSERT INTO events (campaign_id, sequence, event_id, json) VALUES (?, ?, ?, ?)`,
      )
      .run(event.campaignId, event.sequence, event.eventId, JSON.stringify(event));
  }

  saveFinding(finding: Finding, violation: InvariantViolation): void {
    const tx = this.#db.prepare("BEGIN IMMEDIATE");
    const commit = this.#db.prepare("COMMIT");
    const rollback = this.#db.prepare("ROLLBACK");
    tx.run();
    try {
      this.#db
        .prepare(
          `INSERT INTO findings (finding_id, campaign_id, json) VALUES (?, ?, ?)`,
        )
        .run(finding.findingId, finding.campaignId, JSON.stringify(finding));
      this.#db
        .prepare(
          `INSERT INTO violations (campaign_id, finding_id, sequence, json) VALUES (?, ?, ?, ?)`,
        )
        .run(
          finding.campaignId,
          finding.findingId,
          violation.sequence,
          JSON.stringify(violation),
        );
      commit.run();
    } catch (error) {
      rollback.run();
      throw error;
    }
  }

  listActions(campaignId: string): PersistedActionRow[] {
    return this.#db
      .prepare(
        `SELECT campaign_id as campaignId, sequence, transport_dispatch_id as transportDispatchId,
                logical_action_id as logicalActionId, envelope_json as envelopeJson,
                result_json as resultJson, pre_state_hash as preStateHash,
                post_state_hash as postStateHash, world_json as worldJson
         FROM actions WHERE campaign_id = ? ORDER BY sequence ASC`,
      )
      .all(campaignId) as PersistedActionRow[];
  }

  listEvents(campaignId: string): CampaignEvent[] {
    const rows = this.#db
      .prepare(
        `SELECT json FROM events WHERE campaign_id = ? ORDER BY sequence ASC`,
      )
      .all(campaignId) as Array<{ json: string }>;
    return rows.map((row) => JSON.parse(row.json) as CampaignEvent);
  }

  getFinding(campaignId: string): Finding | null {
    const row = this.#db
      .prepare(`SELECT json FROM findings WHERE campaign_id = ? LIMIT 1`)
      .get(campaignId) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Finding) : null;
  }

  close(): void {
    this.#db.close();
  }
}
