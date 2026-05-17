import { getPrisma } from "@/lib/prisma";
import { parseJsonArray, parseJsonRecord, toJson } from "@/lib/json";

type PatternCandidate = {
  patternName: string;
  patternType: "topic" | "format" | "hook" | "audience_problem" | "title" | "thumbnail" | "business_opportunity";
  videoId: string;
  creatorId: string;
  auditId: string;
  scoreId: string;
  formatType: string;
  overperformance: number;
  businessRelevance: number;
  repeatability: number;
  evidenceQuality: string;
  createdAt: Date;
};

export type PatternScoreInput = {
  medianOverperformance: number;
  supportingVideoCount: number;
  creatorCount: number;
  averageBusinessRelevance: number;
  averageRepeatability: number;
  evidenceQuality: string;
  newestEvidenceAgeDays: number;
};

export function calculatePatternScore(input: PatternScoreInput) {
  const creatorDiversityFactor = input.creatorCount >= 2 ? 1 : 0.55;
  const evidenceQualityFactor = evidenceQualityFactorFor(input.evidenceQuality);
  const recencyFactor = Math.max(0.55, 1 - input.newestEvidenceAgeDays / 365);
  const smallSamplePenalty = input.supportingVideoCount >= 5 ? 1 : 0.65;

  return round(
    input.medianOverperformance *
      Math.log(1 + input.supportingVideoCount) *
      creatorDiversityFactor *
      (input.averageBusinessRelevance / 10) *
      (input.averageRepeatability / 10) *
      evidenceQualityFactor *
      recencyFactor *
      smallSamplePenalty
  );
}

export function qualifiesAsCrossCreatorTrend(input: {
  supportingVideoCount: number;
  creatorCount: number;
}) {
  return input.creatorCount >= 2 && input.supportingVideoCount >= 2;
}

export async function generateCreatorPatternReports() {
  const prisma = getPrisma();
  const creators = await prisma.creator.findMany({
    where: { status: "approved" },
    include: {
      contentItems: {
        include: {
          scores: true,
          audits: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });
  const reports = [];

  for (const creator of creators) {
    const formatTypes = [...new Set(creator.contentItems.map((item) => item.formatType))];

    for (const formatType of formatTypes) {
      const comparable = creator.contentItems
        .map((item) => ({
          item,
          score: item.scores[0],
          audit: item.audits[0]
        }))
        .filter(({ score }) => {
          const flags = parseJsonArray(score?.flags);
          return (
            Boolean(score && score.overperformanceScore !== null) &&
            Boolean(score && score.formatType === formatType) &&
            Boolean(score && isScorePatternEligible(flags))
          );
        })
        .filter(({ audit }) => Boolean(audit))
        .sort(
          (left, right) =>
            (right.score?.overperformanceScore ?? 0) -
            (left.score?.overperformanceScore ?? 0)
        );

      if (comparable.length < 5) {
        continue;
      }

      const bucketSize = Math.max(1, Math.ceil(comparable.length * 0.2));
      const top = comparable.slice(0, bucketSize);
      const bottom = comparable.slice(-bucketSize);
      const structuredJson = buildCreatorPatternJson(creator.name, formatType, comparable, top, bottom);
      const averageAuditConfidence = average(
        comparable
          .map(({ audit }) => audit?.confidenceScore)
          .filter((value): value is number => typeof value === "number")
      );

      reports.push(
        await prisma.creatorPatternReport.create({
          data: {
            creatorId: creator.id,
            creatorName: creator.name,
            analysisScope: `Compared ${formatType} videos for one approved creator only.`,
            formatType,
            videosAnalyzedCount: comparable.length,
            topVideoIds: toJson(top.map(({ item }) => item.id)),
            bottomVideoIds: toJson(bottom.map(({ item }) => item.id)),
            evidenceAuditIds: toJson(comparable.map(({ audit }) => audit?.id).filter(Boolean)),
            evidenceScoreIds: toJson(comparable.map(({ score }) => score?.id).filter(Boolean)),
            evidenceLimitations: toJson([
              "Creator-level pattern only; do not treat this as a cross-creator trend.",
              "Only videos with comparable format type, usable score data, and saved audits are included."
            ]),
            structuredJson: toJson(structuredJson),
            confidenceScore: Math.min(0.8, averageAuditConfidence || 0.45)
          }
        })
      );
    }
  }

  return reports;
}

export async function generateCrossCreatorTrendReport() {
  const prisma = getPrisma();
  const audits = await prisma.contentAudit.findMany({
    include: {
      contentItem: {
        include: {
          creator: true,
          scores: { orderBy: { scoredAt: "desc" }, take: 1 }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });

  const candidates: PatternCandidate[] = [];
  for (const audit of audits) {
    const parsed = parseJsonRecord<AuditJsonShape>(audit.fullAuditJson, {});
    const score = audit.contentItem.scores[0];
    const flags = parseJsonArray(score?.flags);

    if (!score || score.overperformanceScore === null || !isScorePatternEligible(flags)) {
      continue;
    }

    const businessRelevance = numberOrNull(
      parsed.video_identity?.business_relevance_score,
      audit.businessRelevanceScore
    );
    const repeatability = numberOrNull(
      parsed.format_breakdown?.format_repeatability_score,
      audit.repeatabilityScore
    );

    if (businessRelevance === null || repeatability === null) {
      continue;
    }

    const base = {
      videoId: audit.contentItemId,
      creatorId: audit.contentItem.creatorId,
      auditId: audit.id,
      scoreId: score.id,
      formatType: score.formatType,
      overperformance: score.overperformanceScore,
      businessRelevance,
      repeatability,
      evidenceQuality: audit.evidenceQuality,
      createdAt: audit.createdAt
    };

    addCandidate(candidates, parsed.video_identity?.topic ?? audit.topic, "topic", base);
    addCandidate(candidates, audit.contentArchetype, "format", base);
    addCandidate(candidates, audit.hookType, "hook", base);
    addCandidate(candidates, audit.audienceProblem, "audience_problem", base);
  }

  const videosAnalyzedCount = new Set(candidates.map((candidate) => candidate.videoId)).size;
  const creatorsAnalyzedCount = new Set(candidates.map((candidate) => candidate.creatorId)).size;

  if (videosAnalyzedCount === 0 || creatorsAnalyzedCount === 0) {
    throw new Error(
      "Generate scored video audits before creating a cross-creator trend report."
    );
  }

  const grouped = groupPatterns(candidates);
  const strongestPatterns = grouped
    .filter((pattern) =>
      qualifiesAsCrossCreatorTrend({
        supportingVideoCount: pattern.supporting_video_ids.length,
        creatorCount: pattern.supporting_creator_ids.length
      })
    )
    .sort((left, right) => right.pattern_score - left.pattern_score)
    .slice(0, 12);
  const weakOrRiskyPatterns = grouped
    .filter(
      (pattern) =>
        pattern.supporting_creator_ids.length === 1
    )
    .slice(0, 8)
    .map((pattern) => ({
      pattern_name: pattern.pattern_name,
      why_risky:
        "Observed in this watchlist but only within one creator or too few videos, so it should not be treated as a cross-creator trend.",
      supporting_video_ids: pattern.supporting_video_ids,
      recommended_action: "Treat as a creator-specific research prompt and collect more evidence before adapting heavily.",
      confidence: Math.min(pattern.confidence, 0.45)
    }));
  const contentOpportunities = strongestPatterns.slice(0, 6).map((pattern) => ({
    idea: `Adapt the ${pattern.pattern_name} pattern for combat-sport performance coaching`,
    target_audience: "mma_athletes",
    suggested_format: pattern.pattern_type === "format" ? pattern.pattern_name : "mistake_fix",
    suggested_hook: pattern.pattern_type === "hook" ? pattern.pattern_name : "pain_point",
    why_it_is_supported_by_research:
      `Observed in this watchlist across ${pattern.supporting_creator_ids.length} creator(s) and ${pattern.supporting_video_ids.length} audited video(s).`,
    evidence_video_ids: pattern.supporting_video_ids,
    business_connection: "Use the video to lead into a practical checklist, programming framework, or coaching offer.",
    confidence: pattern.confidence
  }));
  const reportJson = {
    report_version: "cross_creator_trend_report_v2",
    date_range: "all stored audited evidence",
    videos_analyzed_count: videosAnalyzedCount,
    creators_analyzed_count: creatorsAnalyzedCount,
    evidence_limitations: [
      "This is an analysis of the approved watchlist only, not all of YouTube.",
      "Cross-creator trends are called only when observed across at least 2 creators.",
      "Videos flagged too_new, missing_stats, insufficient_baseline, outlier, or celebrity/event-driven possible are excluded.",
      "Do not interpret these patterns as algorithmic causation."
    ],
    strongest_patterns: strongestPatterns,
    weak_or_risky_patterns: weakOrRiskyPatterns,
    content_opportunities_for_my_channel: contentOpportunities,
    next_research_actions: [
      "Fetch comments for top/bottom videos with weak audience-response evidence.",
      "Add manual notes to strategic top and bottom videos before deep audits.",
      "Run creator-level pattern reports after each creator has at least 5 comparable audited videos."
    ]
  };
  const confidenceScore =
    strongestPatterns.length > 0
      ? average(strongestPatterns.map((pattern) => pattern.confidence))
      : 0.25;

  return prisma.trendReport.create({
    data: {
      dateRange: reportJson.date_range,
      videosAnalyzedCount: reportJson.videos_analyzed_count,
      creatorsAnalyzedCount: reportJson.creators_analyzed_count,
      evidenceLimitations: toJson(reportJson.evidence_limitations),
      strongestPatterns: toJson(reportJson.strongest_patterns),
      weakOrRiskyPatterns: toJson(reportJson.weak_or_risky_patterns),
      contentOpportunities: toJson(reportJson.content_opportunities_for_my_channel),
      nextResearchActions: toJson(reportJson.next_research_actions),
      structuredJson: toJson(reportJson),
      confidenceScore
    }
  });
}

export async function generateContentBriefsFromLatestTrendReport() {
  const prisma = getPrisma();
  const trendReport = await prisma.trendReport.findFirst({
    orderBy: { createdAt: "desc" }
  });

  if (!trendReport) {
    throw new Error("Generate a trend report before creating content briefs.");
  }

  const opportunities = parseJsonArrayOfRecords<ContentOpportunity>(
    trendReport.contentOpportunities
  ).slice(0, 6);

  if (opportunities.length === 0) {
    throw new Error("The latest trend report has no supported content opportunities.");
  }

  const briefs = [];
  for (const opportunity of opportunities) {
    briefs.push(
      await prisma.contentBrief.create({
        data: {
          trendReportId: trendReport.id,
          titleIdea: titleFromOpportunity(opportunity),
          targetAudience: opportunity.target_audience,
          businessObjective:
            "Attract combat-sport athletes and coaches who want practical performance coaching.",
          platform: "YouTube long-form",
          evidenceBasis: opportunity.why_it_is_supported_by_research,
          openingHook: hookFromOpportunity(opportunity),
          videoStructure:
            "Original proposed structure, not copied from evidence: open with the audience problem, explain the mechanism, show an original coaching example, explain programming context, and close with a relevant checklist or coaching next step.",
          keyCoachingPoints:
            "Keep claims specific, practical, and tied to combat-sport transfer. Separate what is known from what needs individualization.",
          suggestedDemoVisuals:
            "Use fighter-relevant demos, simple before/after movement contrast, and programming examples rather than generic gym montage.",
          cta: "Invite viewers to download a conditioning or strength checklist related to the topic.",
          patternAdapted: opportunity.idea,
          whatNotToCopy:
            "Do not copy the original title, thumbnail, structure, creator persona, or claims. Adapt the underlying audience problem ethically.",
          confidenceScore: opportunity.confidence,
          evidenceVideoIds: toJson(opportunity.evidence_video_ids)
        }
      })
    );
  }

  return briefs;
}

function groupPatterns(candidates: PatternCandidate[]) {
  const grouped = new Map<string, PatternCandidate[]>();

  for (const candidate of candidates) {
    const key = `${candidate.formatType}:${candidate.patternType}:${candidate.patternName.toLowerCase()}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  return [...grouped.values()].map((items) => {
    const representative = items[0];
    const supportingVideoIds = [...new Set(items.map((item) => item.videoId))];
    const supportingCreatorIds = [...new Set(items.map((item) => item.creatorId))];
    const supportingAuditIds = [...new Set(items.map((item) => item.auditId))];
    const supportingScoreIds = [...new Set(items.map((item) => item.scoreId))];
    const medianOverperformance = median(items.map((item) => item.overperformance));
    const averageBusinessRelevance = average(items.map((item) => item.businessRelevance));
    const averageRepeatability = average(items.map((item) => item.repeatability));
    const evidenceQuality = weakestEvidenceQuality(items.map((item) => item.evidenceQuality));
    const newestEvidenceAgeDays = Math.min(
      ...items.map((item) => (Date.now() - item.createdAt.getTime()) / 86_400_000)
    );
    const patternScore = calculatePatternScore({
      medianOverperformance,
      supportingVideoCount: supportingVideoIds.length,
      creatorCount: supportingCreatorIds.length,
      averageBusinessRelevance,
      averageRepeatability,
      evidenceQuality,
      newestEvidenceAgeDays
    });

    return {
      pattern_name: representative.patternName,
      pattern_type: representative.patternType,
      format_type: representative.formatType,
      supporting_video_ids: supportingVideoIds,
      supporting_creator_ids: supportingCreatorIds,
      supporting_audit_ids: supportingAuditIds,
      supporting_score_ids: supportingScoreIds,
      evidence_quality: evidenceQuality,
      median_overperformance: round(medianOverperformance),
      business_relevance: round(averageBusinessRelevance),
      repeatability: round(averageRepeatability),
      pattern_score: patternScore,
      interpretation:
        qualifiesAsCrossCreatorTrend({
          supportingVideoCount: supportingVideoIds.length,
          creatorCount: supportingCreatorIds.length
        })
          ? "Observed in this watchlist with enough support to treat as a watchlist-level pattern."
          : "Creator-specific pattern only; more evidence is needed before treating it as a trend.",
      confidence: confidenceForPattern(patternScore, supportingCreatorIds.length, evidenceQuality),
      recommended_action:
        "Use as a research-backed prompt for an original combat-sport performance video; verify with deeper audits before scaling."
    };
  });
}

function buildCreatorPatternJson(
  creatorName: string,
  formatType: string,
  comparable: CreatorComparable[],
  top = comparable.slice(0, Math.max(1, Math.ceil(comparable.length * 0.2))),
  bottom = comparable.slice(-Math.max(1, Math.ceil(comparable.length * 0.2)))
) {
  return {
    creator_id: comparable[0]?.item.creatorId ?? "",
    creator_name: creatorName,
    analysis_scope: `Creator-specific comparison of ${formatType} videos.`,
    videos_analyzed_count: comparable.length,
    top_video_ids: top.map(({ item }) => item.id),
    bottom_video_ids: bottom.map(({ item }) => item.id),
    evidence_limitations:
      comparable.length < 5
        ? ["Fewer than 5 comparable videos; low confidence."]
        : ["Creator-level report only; not a cross-creator trend."],
    top_performer_patterns: summarizeCreatorBucket(top),
    bottom_performer_patterns: summarizeCreatorBucket(bottom),
    lessons_for_my_channel: {
      adapt_these_patterns: summarizeValues(
        top
          .filter(({ audit }) => isHighValueAudit(audit))
          .map(({ audit }) => audit?.contentArchetype)
      ),
      avoid_these_patterns: summarizeValues(bottom.map(({ audit }) => audit?.contentArchetype)),
      high_value_content_opportunities: summarizeValues(
        top
          .filter(({ audit }) => isHighValueAudit(audit))
          .map(({ audit }) => audit?.audienceProblem)
      ),
      low_value_viral_traps: summarizeValues(
        top
          .filter(({ audit }) => isLowBusinessAudit(audit))
          .map(({ audit }) => audit?.audienceProblem)
      ),
      suggested_experiments: top
        .map(({ audit }) => audit?.suggestedAdaptationForUser)
        .filter((value): value is string => Boolean(value))
        .slice(0, 5)
    },
    confidence_score: comparable.length >= 5 ? 0.65 : 0.35
  };
}

function summarizeCreatorBucket(bucket: CreatorComparable[]) {
  return {
    topics: summarizeValues(bucket.map(({ audit }) => audit?.topic)),
    formats: summarizeValues(bucket.map(({ audit }) => audit?.contentArchetype)),
    hook_types: summarizeValues(bucket.map(({ audit }) => audit?.hookType)),
    audience_problems: summarizeValues(bucket.map(({ audit }) => audit?.audienceProblem)),
    title_patterns: summarizeValues(bucket.map(({ item }) => classifyTitlePattern(item.title))),
    thumbnail_patterns: ["Thumbnail pattern requires explicit thumbnail analysis."],
    comment_patterns: ["Comment pattern requires fetched comments and standard/deep audits."],
    business_relevance_patterns: summarizeValues(
      bucket.map(({ audit }) =>
        audit?.businessRelevanceScore !== null && audit?.businessRelevanceScore !== undefined
          ? `business relevance ${audit.businessRelevanceScore}/10`
          : undefined
      )
    ),
    possible_weaknesses: summarizeValues(bucket.map(({ audit }) => audit?.risksOrCaveats))
  };
}

function addCandidate(
  candidates: PatternCandidate[],
  patternName: string | undefined,
  patternType: PatternCandidate["patternType"],
  base: Omit<PatternCandidate, "patternName" | "patternType">
) {
  const normalized = patternName?.trim();
  if (!normalized || normalized === "unclear") {
    return;
  }

  candidates.push({ ...base, patternName: normalized, patternType });
}

function summarizeValues(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([value]) => value);
}

function classifyTitlePattern(title: string) {
  if (/\b(mistake|wrong|stop|avoid)\b/i.test(title)) {
    return "mistake/fix framing";
  }
  if (/\b(why|reason|science)\b/i.test(title)) {
    return "why/science framing";
  }
  if (/\b(how|build|program|workout|drill)\b/i.test(title)) {
    return "how-to/programming framing";
  }
  if (/\b(ufc|mma|fighter|boxing|grappling)\b/i.test(title)) {
    return "combat-sport-specific framing";
  }
  return "general performance framing";
}

function evidenceQualityFactorFor(evidenceQuality: string) {
  if (evidenceQuality === "metadata_only") return 0.65;
  if (evidenceQuality === "metadata_plus_comments") return 0.8;
  if (evidenceQuality === "metadata_plus_thumbnail") return 0.78;
  if (evidenceQuality === "metadata_plus_comments_thumbnail") return 0.88;
  if (evidenceQuality === "transcript_or_manual_notes") return 0.95;
  if (evidenceQuality === "mixed") return 1;
  return 0.6;
}

function weakestEvidenceQuality(values: string[]) {
  const order = [
    "metadata_only",
    "metadata_plus_thumbnail",
    "metadata_plus_comments",
    "metadata_plus_comments_thumbnail",
    "transcript_or_manual_notes",
    "mixed"
  ];
  return values.sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] ?? "metadata_only";
}

function confidenceForPattern(patternScore: number, creatorCount: number, evidenceQuality: string) {
  const base = Math.max(0.25, patternScore / 5 + (creatorCount >= 2 ? 0.2 : 0));
  const evidenceCap = evidenceQuality === "metadata_only" ? 0.45 : 0.9;
  return Math.min(evidenceCap, base);
}

function isScorePatternEligible(flags: string[]) {
  return !flags.some((flag) =>
    [
      "too_new",
      "missing_stats",
      "insufficient_baseline",
      "outlier",
      "celebrity_or_event_driven_possible"
    ].includes(flag)
  );
}

function numberOrNull(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function isHighValueAudit(audit: CreatorComparable["audit"]) {
  return (
    audit !== null &&
    audit !== undefined &&
    (audit.businessRelevanceScore ?? 0) >= 7 &&
    (audit.repeatabilityScore ?? 0) >= 7
  );
}

function isLowBusinessAudit(audit: CreatorComparable["audit"]) {
  return audit !== null && audit !== undefined && (audit.businessRelevanceScore ?? 0) < 5;
}

function titleFromOpportunity(opportunity: ContentOpportunity) {
  if (/conditioning|gas|fatigue/i.test(opportunity.idea)) {
    return "A Combat-Sport Conditioning Problem Worth Fixing";
  }
  if (/mistake/i.test(opportunity.suggested_format)) {
    return "The Conditioning Mistake Holding Fighters Back";
  }
  return `${capitalize(opportunity.suggested_hook)} for Combat-Sport Performance`;
}

function hookFromOpportunity(opportunity: ContentOpportunity) {
  if (opportunity.suggested_hook === "pain_point") {
    return "Name the painful fighter problem in the first sentence and make it specific to training or fight performance.";
  }

  return `Open with a ${opportunity.suggested_hook} hook, then immediately connect it to a practical fighter performance problem.`;
}

function parseJsonArrayOfRecords<T extends Record<string, unknown>>(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

type CreatorComparable = {
  item: { id: string; title: string; creatorId: string };
  score:
    | {
        id: string;
        overperformanceScore: number | null;
        flags: string;
      }
    | null
    | undefined;
  audit:
    | {
        id: string;
        topic: string;
        contentArchetype: string;
        hookType: string;
        audienceProblem: string;
        businessRelevanceScore: number | null;
        repeatabilityScore: number | null;
        confidenceScore: number;
        suggestedAdaptationForUser: string;
        risksOrCaveats: string;
      }
    | null
    | undefined;
};

type AuditJsonShape = {
  video_identity?: {
    topic?: string;
    business_relevance_score?: number;
  };
  format_breakdown?: {
    format_repeatability_score?: number;
  };
};

type ContentOpportunity = {
  idea: string;
  target_audience: string;
  suggested_format: string;
  suggested_hook: string;
  why_it_is_supported_by_research: string;
  evidence_video_ids: string[];
  business_connection: string;
  confidence: number;
};
