import { describe, expect, it } from "vitest";

import { calculatePerformanceScores, type ScoreInput } from "@/lib/scoring";

const now = new Date("2026-05-14T00:00:00.000Z");

function item(overrides: Partial<ScoreInput>): ScoreInput {
  return {
    id: "video",
    creatorId: "creator-a",
    layer: "mma_specific",
    title: "MMA conditioning session",
    publishedAt: new Date("2026-05-04T00:00:00.000Z"),
    durationSeconds: 600,
    formatType: "long_form",
    viewCount: 1000n,
    likeCount: 50n,
    commentCount: 10n,
    ...overrides
  };
}

describe("calculatePerformanceScores", () => {
  it("uses creator median views per day and normalizes overperformance", () => {
    const scores = calculatePerformanceScores(
      [
        item({ id: "low", viewCount: 1000n }),
        item({ id: "middle", viewCount: 2000n }),
        item({ id: "high", viewCount: 3000n })
      ],
      { now, minCreatorBaselineVideos: 3 }
    );

    const high = scores.find((score) => score.contentItemId === "high");

    expect(high?.creatorMedianViewsPerDay).toBe(200);
    expect(high?.viewsPerDay).toBe(300);
    expect(high?.overperformanceScore).toBe(1.5);
    expect(high?.percentileWithinCreator).toBe(100);
  });

  it("does not mix short candidates with long-form baselines", () => {
    const scores = calculatePerformanceScores(
      [
        item({ id: "long-a", viewCount: 1000n }),
        item({ id: "long-b", viewCount: 2000n }),
        item({ id: "long-c", viewCount: 3000n }),
        item({ id: "short-a", durationSeconds: 45, formatType: "short_candidate", viewCount: 10000n })
      ],
      { now, minCreatorBaselineVideos: 3 }
    );

    const short = scores.find((score) => score.contentItemId === "short-a");

    expect(short?.formatType).toBe("short_candidate");
    expect(short?.creatorMedianViewsPerDay).toBeNull();
    expect(short?.flags).toContain("insufficient_baseline");
  });

  it("keeps missing metrics null and flags too-new videos", () => {
    const scores = calculatePerformanceScores(
      [
        item({
          id: "missing",
          viewCount: null,
          likeCount: null,
          commentCount: null
        }),
        item({
          id: "too-new",
          publishedAt: new Date("2026-05-13T12:00:00.000Z"),
          viewCount: 500n
        })
      ],
      { now, minCreatorBaselineVideos: 3, tooNewDays: 2 }
    );

    const missing = scores.find((score) => score.contentItemId === "missing");
    const tooNew = scores.find((score) => score.contentItemId === "too-new");

    expect(missing?.viewsPerDay).toBeNull();
    expect(missing?.likesPer1000Views).toBeNull();
    expect(missing?.flags).toContain("missing_stats");
    expect(tooNew?.flags).toContain("too_new");
    expect(tooNew?.overperformanceScore).toBeNull();
    expect(tooNew?.percentileWithinCreator).toBeNull();
    expect(tooNew?.percentileWithinLayer).toBeNull();
  });
});
