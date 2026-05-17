import { describe, expect, it } from "vitest";

import { calculatePatternScore, qualifiesAsCrossCreatorTrend } from "@/lib/trends";

describe("trend scoring", () => {
  it("does not call a one-creator, small-sample pattern a cross-creator trend", () => {
    expect(
      qualifiesAsCrossCreatorTrend({
        supportingVideoCount: 3,
        creatorCount: 1
      })
    ).toBe(false);
  });

  it("does not call a one-creator larger sample a cross-creator trend", () => {
    expect(
      qualifiesAsCrossCreatorTrend({
        supportingVideoCount: 8,
        creatorCount: 1
      })
    ).toBe(false);
  });

  it("allows patterns supported by multiple creators", () => {
    expect(
      qualifiesAsCrossCreatorTrend({
        supportingVideoCount: 2,
        creatorCount: 2
      })
    ).toBe(true);
  });

  it("penalizes weak metadata-only evidence", () => {
    const weak = calculatePatternScore({
      medianOverperformance: 2,
      supportingVideoCount: 3,
      creatorCount: 1,
      averageBusinessRelevance: 8,
      averageRepeatability: 8,
      evidenceQuality: "metadata_only",
      newestEvidenceAgeDays: 7
    });
    const stronger = calculatePatternScore({
      medianOverperformance: 2,
      supportingVideoCount: 6,
      creatorCount: 2,
      averageBusinessRelevance: 8,
      averageRepeatability: 8,
      evidenceQuality: "mixed",
      newestEvidenceAgeDays: 7
    });

    expect(stronger).toBeGreaterThan(weak);
  });
});
