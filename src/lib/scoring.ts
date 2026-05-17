import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { getNumberSetting } from "@/lib/settings";
import { inferFormatType } from "@/lib/youtube";

export type FormatType = "long_form" | "short_candidate" | "unknown";

export type ScoreFlag =
  | "too_new"
  | "missing_stats"
  | "outlier"
  | "celebrity_or_event_driven_possible"
  | "insufficient_baseline";

export type ScoreInput = {
  id: string;
  creatorId: string;
  layer: string;
  title: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  formatType?: string | null;
  viewCount: bigint | number | null;
  likeCount: bigint | number | null;
  commentCount: bigint | number | null;
};

export type ScoreOutput = {
  contentItemId: string;
  ageDays: number | null;
  viewsPerDay: number | null;
  likesPer1000Views: number | null;
  commentsPer1000Views: number | null;
  creatorMedianViewsPerDay: number | null;
  overperformanceScore: number | null;
  percentileWithinCreator: number | null;
  percentileWithinLayer: number | null;
  formatType: FormatType;
  flags: ScoreFlag[];
};

type ScoreOptions = {
  now?: Date;
  tooNewDays?: number;
  minCreatorBaselineVideos?: number;
};

export function calculatePerformanceScores(
  items: ScoreInput[],
  options: ScoreOptions = {}
): ScoreOutput[] {
  const now = options.now ?? new Date();
  const tooNewDays = options.tooNewDays ?? 2;
  const minCreatorBaselineVideos = options.minCreatorBaselineVideos ?? 3;

  const initialScores = items.map((item) => {
    const flags = new Set<ScoreFlag>();
    const formatType = normalizeFormatType(
      item.formatType && item.formatType !== "unknown"
        ? item.formatType
        : inferFormatType(item.durationSeconds)
    );
    const ageDays = item.publishedAt
      ? Math.max(0, (now.getTime() - item.publishedAt.getTime()) / 86_400_000)
      : null;
    const viewCount = numericMetric(item.viewCount);
    const likeCount = numericMetric(item.likeCount);
    const commentCount = numericMetric(item.commentCount);

    if (ageDays !== null && ageDays < tooNewDays) {
      flags.add("too_new");
    }

    if (viewCount === null || item.publishedAt === null) {
      flags.add("missing_stats");
    }

    if (mightBeEventDriven(item.title)) {
      flags.add("celebrity_or_event_driven_possible");
    }

    const viewsPerDay =
      viewCount !== null && ageDays !== null && ageDays > 0
        ? viewCount / Math.max(ageDays, 0.25)
        : null;
    const likesPer1000Views =
      likeCount !== null && viewCount !== null && viewCount > 0
        ? (likeCount / viewCount) * 1000
        : null;
    const commentsPer1000Views =
      commentCount !== null && viewCount !== null && viewCount > 0
        ? (commentCount / viewCount) * 1000
        : null;

    return {
      item,
      ageDays,
      viewsPerDay,
      likesPer1000Views,
      commentsPer1000Views,
      formatType,
      flags
    };
  });

  return initialScores.map((score) => {
    const creatorPopulation = initialScores.filter(
      (candidate) =>
        candidate.item.creatorId === score.item.creatorId &&
        candidate.formatType === score.formatType &&
        candidate.viewsPerDay !== null &&
        !candidate.flags.has("too_new") &&
        !candidate.flags.has("missing_stats")
    );
    const layerPopulation = initialScores.filter(
      (candidate) =>
        candidate.item.layer === score.item.layer &&
        candidate.formatType === score.formatType &&
        candidate.viewsPerDay !== null &&
        !candidate.flags.has("too_new") &&
        !candidate.flags.has("missing_stats")
    );

    const baselineValues = creatorPopulation
      .map((candidate) => candidate.viewsPerDay)
      .filter(isNumber);
    const creatorMedianViewsPerDay =
      baselineValues.length >= minCreatorBaselineVideos ? median(baselineValues) : null;

    if (creatorMedianViewsPerDay === null) {
      score.flags.add("insufficient_baseline");
    }

    const benchmarkEligible = !score.flags.has("too_new") && !score.flags.has("missing_stats");
    const overperformanceScore =
      benchmarkEligible &&
      score.viewsPerDay !== null &&
      creatorMedianViewsPerDay !== null &&
      creatorMedianViewsPerDay > 0
        ? score.viewsPerDay / creatorMedianViewsPerDay
        : null;

    if (overperformanceScore !== null && overperformanceScore >= 5) {
      score.flags.add("outlier");
    }

    return {
      contentItemId: score.item.id,
      ageDays: roundNullable(score.ageDays),
      viewsPerDay: roundNullable(score.viewsPerDay),
      likesPer1000Views: roundNullable(score.likesPer1000Views),
      commentsPer1000Views: roundNullable(score.commentsPer1000Views),
      creatorMedianViewsPerDay: roundNullable(creatorMedianViewsPerDay),
      overperformanceScore: roundNullable(overperformanceScore),
      percentileWithinCreator: benchmarkEligible
        ? percentile(
            score.viewsPerDay,
            creatorPopulation.map((candidate) => candidate.viewsPerDay).filter(isNumber)
          )
        : null,
      percentileWithinLayer: benchmarkEligible
        ? percentile(
            score.viewsPerDay,
            layerPopulation.map((candidate) => candidate.viewsPerDay).filter(isNumber)
          )
        : null,
      formatType: score.formatType,
      flags: [...score.flags].sort()
    };
  });
}

export async function calculateAndStoreScores() {
  const prisma = getPrisma();
  const [tooNewDays, minCreatorBaselineVideos, contentItems] = await Promise.all([
    getNumberSetting("TOO_NEW_VIDEO_DAYS"),
    getNumberSetting("MIN_CREATOR_BASELINE_VIDEOS"),
    prisma.contentItem.findMany({
      include: {
        creator: true,
        snapshots: {
          orderBy: { capturedAt: "desc" },
          take: 1
        }
      }
    })
  ]);

  const inputs: ScoreInput[] = contentItems.map((item) => {
    const snapshot = item.snapshots[0];

    return {
      id: item.id,
      creatorId: item.creatorId,
      layer: item.creator.layer,
      title: item.title,
      publishedAt: item.publishedAt,
      durationSeconds: item.durationSeconds,
      formatType: item.formatType,
      viewCount: snapshot?.viewCount ?? null,
      likeCount: snapshot?.likeCount ?? null,
      commentCount: snapshot?.commentCount ?? null
    };
  });

  const scores = calculatePerformanceScores(inputs, {
    tooNewDays,
    minCreatorBaselineVideos
  });

  for (const score of scores) {
    await prisma.performanceScore.upsert({
      where: { contentItemId: score.contentItemId },
      update: {
        scoredAt: new Date(),
        ageDays: score.ageDays,
        viewsPerDay: score.viewsPerDay,
        likesPer1000Views: score.likesPer1000Views,
        commentsPer1000Views: score.commentsPer1000Views,
        creatorMedianViewsPerDay: score.creatorMedianViewsPerDay,
        overperformanceScore: score.overperformanceScore,
        percentileWithinCreator: score.percentileWithinCreator,
        percentileWithinLayer: score.percentileWithinLayer,
        formatType: score.formatType,
        flags: toJson(score.flags)
      },
      create: {
        contentItemId: score.contentItemId,
        ageDays: score.ageDays,
        viewsPerDay: score.viewsPerDay,
        likesPer1000Views: score.likesPer1000Views,
        commentsPer1000Views: score.commentsPer1000Views,
        creatorMedianViewsPerDay: score.creatorMedianViewsPerDay,
        overperformanceScore: score.overperformanceScore,
        percentileWithinCreator: score.percentileWithinCreator,
        percentileWithinLayer: score.percentileWithinLayer,
        formatType: score.formatType,
        flags: toJson(score.flags)
      }
    });
  }

  return scores;
}

function numericMetric(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeFormatType(value: string): FormatType {
  if (value === "long_form" || value === "short_candidate") {
    return value;
  }

  return "unknown";
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function percentile(value: number | null, values: number[]) {
  if (value === null || values.length === 0) {
    return null;
  }

  const lessOrEqual = values.filter((candidate) => candidate <= value).length;
  return roundNullable((lessOrEqual / values.length) * 100);
}

function roundNullable(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function mightBeEventDriven(title: string) {
  return /\b(ufc|bellator|pfl|one championship|champion|title fight|fight night|mcgregor|khabib|jones|pereira|adesanya|volkanovski|makhachev)\b/i.test(
    title
  );
}
