import { describe, expect, it } from "vitest";

import { saveContentAudit, validateAuditPayload } from "@/lib/audit";

const validPayload = {
  evidence_snapshot_ids: ["snapshot-1"],
  evidence_content_item_ids: ["content-1"],
  topic: "MMA conditioning",
  sport_layer: "mma_specific",
  content_archetype: "coaching breakdown",
  format_type: "long_form",
  hook_type: "problem-led",
  audience_problem: "fighters need repeatable conditioning work",
  coaching_quality_score: 8,
  scientific_quality_score: 7,
  business_relevance_score: 9,
  repeatability_score: 8,
  observable_evidence: "The supplied title mentions MMA conditioning and the stored snapshot has view metrics.",
  interpretation: "The topic appears aligned with performance coaching.",
  why_it_likely_performed: "It may match a clear athlete problem; this is correlation, not causation.",
  why_it_might_underperform: "The metadata may be too niche or unclear without stronger packaging.",
  risks_or_caveats: "Only stored metadata was supplied, not full video content.",
  suggested_adaptation_for_user: "Create an original conditioning framework for fighters and cite practical coaching evidence.",
  confidence_score: 0.74
};

describe("audit validation", () => {
  it("accepts structured audit output with stored evidence IDs", () => {
    expect(
      validateAuditPayload(validPayload, {
        allowedSnapshotIds: ["snapshot-1"],
        allowedContentItemIds: ["content-1"]
      }).confidence_score
    ).toBe(0.74);
  });

  it("rejects output without evidence IDs before save", async () => {
    const invalidPayload = {
      ...validPayload,
      evidence_snapshot_ids: []
    };

    await expect(saveContentAudit("content-1", invalidPayload, "test-model")).rejects.toThrow();
  });

  it("rejects evidence IDs that were not supplied to the model", () => {
    expect(() =>
      validateAuditPayload(validPayload, {
        allowedSnapshotIds: ["different-snapshot"],
        allowedContentItemIds: ["content-1"]
      })
    ).toThrow("Audit evidence IDs must reference stored evidence supplied to the model.");
  });
});
