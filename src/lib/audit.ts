import OpenAI from "openai";
import { z } from "zod";

import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";

let openai: OpenAI | null = null;

const scoreSchema = z.number().int().min(0).max(10).nullable();

export const contentAuditSchema = z.object({
  evidence_snapshot_ids: z.array(z.string()).min(1),
  evidence_content_item_ids: z.array(z.string()).min(1),
  topic: z.string().min(1),
  sport_layer: z.string().min(1),
  content_archetype: z.string().min(1),
  format_type: z.string().min(1),
  hook_type: z.string().min(1),
  audience_problem: z.string().min(1),
  coaching_quality_score: scoreSchema,
  scientific_quality_score: scoreSchema,
  business_relevance_score: scoreSchema,
  repeatability_score: scoreSchema,
  observable_evidence: z.string().min(1),
  interpretation: z.string().min(1),
  why_it_likely_performed: z.string().min(1),
  why_it_might_underperform: z.string().min(1),
  risks_or_caveats: z.string().min(1),
  suggested_adaptation_for_user: z.string().min(1),
  confidence_score: z.number().min(0).max(1)
});

export type ContentAuditPayload = z.infer<typeof contentAuditSchema>;

const AUDIT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "evidence_snapshot_ids",
    "evidence_content_item_ids",
    "topic",
    "sport_layer",
    "content_archetype",
    "format_type",
    "hook_type",
    "audience_problem",
    "coaching_quality_score",
    "scientific_quality_score",
    "business_relevance_score",
    "repeatability_score",
    "observable_evidence",
    "interpretation",
    "why_it_likely_performed",
    "why_it_might_underperform",
    "risks_or_caveats",
    "suggested_adaptation_for_user",
    "confidence_score"
  ],
  properties: {
    evidence_snapshot_ids: { type: "array", items: { type: "string" }, minItems: 1 },
    evidence_content_item_ids: { type: "array", items: { type: "string" }, minItems: 1 },
    topic: { type: "string" },
    sport_layer: { type: "string" },
    content_archetype: { type: "string" },
    format_type: { type: "string" },
    hook_type: { type: "string" },
    audience_problem: { type: "string" },
    coaching_quality_score: { anyOf: [{ type: "integer", minimum: 0, maximum: 10 }, { type: "null" }] },
    scientific_quality_score: { anyOf: [{ type: "integer", minimum: 0, maximum: 10 }, { type: "null" }] },
    business_relevance_score: { anyOf: [{ type: "integer", minimum: 0, maximum: 10 }, { type: "null" }] },
    repeatability_score: { anyOf: [{ type: "integer", minimum: 0, maximum: 10 }, { type: "null" }] },
    observable_evidence: { type: "string" },
    interpretation: { type: "string" },
    why_it_likely_performed: { type: "string" },
    why_it_might_underperform: { type: "string" },
    risks_or_caveats: { type: "string" },
    suggested_adaptation_for_user: { type: "string" },
    confidence_score: { type: "number", minimum: 0, maximum: 1 }
  }
};

type EvidenceConstraint = {
  allowedSnapshotIds: string[];
  allowedContentItemIds: string[];
};

export function validateAuditPayload(
  payload: unknown,
  constraints?: EvidenceConstraint
): ContentAuditPayload {
  const parsed = contentAuditSchema.parse(payload);

  if (constraints) {
    const allowedSnapshots = new Set(constraints.allowedSnapshotIds);
    const allowedContentItems = new Set(constraints.allowedContentItemIds);
    const hasUnknownSnapshot = parsed.evidence_snapshot_ids.some((id) => !allowedSnapshots.has(id));
    const hasUnknownContentItem = parsed.evidence_content_item_ids.some(
      (id) => !allowedContentItems.has(id)
    );

    if (hasUnknownSnapshot || hasUnknownContentItem) {
      throw new Error("Audit evidence IDs must reference stored evidence supplied to the model.");
    }
  }

  return parsed;
}

export async function auditSelectedContentItems(contentItemIds: string[]) {
  const uniqueIds = [...new Set(contentItemIds)].filter(Boolean);
  const results = [];

  for (const contentItemId of uniqueIds) {
    results.push(await auditContentItem(contentItemId));
  }

  return results;
}

export async function auditContentItem(contentItemId: string) {
  const prisma = getPrisma();
  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      creator: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      scores: { orderBy: { scoredAt: "desc" }, take: 1 }
    }
  });

  if (!contentItem) {
    throw new Error("Content item not found.");
  }

  const snapshot = contentItem.snapshots[0];
  if (!snapshot) {
    throw new Error("A video must have a stored metric snapshot before it can be audited.");
  }

  const evidence = {
    content_item: {
      evidence_content_item_id: contentItem.id,
      youtube_video_id: contentItem.youtubeVideoId,
      creator_id: contentItem.creatorId,
      creator_name: contentItem.creator.name,
      creator_layer: contentItem.creator.layer,
      title: contentItem.title,
      description: truncate(contentItem.description ?? "", 4000),
      published_at: contentItem.publishedAt?.toISOString() ?? null,
      duration_seconds: contentItem.durationSeconds,
      format_type: contentItem.formatType,
      source_url: contentItem.url,
      fetched_at: contentItem.fetchedAt?.toISOString() ?? null
    },
    latest_snapshot: {
      evidence_snapshot_id: snapshot.id,
      captured_at: snapshot.capturedAt.toISOString(),
      view_count: snapshot.viewCount?.toString() ?? null,
      like_count: snapshot.likeCount?.toString() ?? null,
      comment_count: snapshot.commentCount?.toString() ?? null
    },
    performance_score: contentItem.scores[0]
      ? {
          age_days: contentItem.scores[0].ageDays,
          views_per_day: contentItem.scores[0].viewsPerDay,
          creator_median_views_per_day: contentItem.scores[0].creatorMedianViewsPerDay,
          overperformance_score: contentItem.scores[0].overperformanceScore,
          percentile_within_creator: contentItem.scores[0].percentileWithinCreator,
          percentile_within_layer: contentItem.scores[0].percentileWithinLayer,
          flags: contentItem.scores[0].flags
        }
      : null
  };

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const response = await getOpenAIClient().responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You audit YouTube metadata for combat-sport performance content strategy. Analyze only the supplied evidence. Do not claim access to the video, the YouTube algorithm, creator credentials, or causation. Separate observable evidence from interpretation. Recommend ethical adaptation, not copying."
      },
      {
        role: "user",
        content: `Return a structured audit for this stored evidence:\n${JSON.stringify(evidence, null, 2)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "content_audit",
        strict: true,
        schema: AUDIT_JSON_SCHEMA
      }
    }
  } as never);

  const outputText = extractOutputText(response);
  const payload = validateAuditPayload(JSON.parse(outputText), {
    allowedSnapshotIds: [snapshot.id],
    allowedContentItemIds: [contentItem.id]
  });

  return saveContentAudit(contentItem.id, payload, model, toJson(response));
}

export async function saveContentAudit(
  contentItemId: string,
  payload: unknown,
  model: string,
  rawResponse?: string
) {
  const parsed = validateAuditPayload(payload);

  return getPrisma().contentAudit.create({
    data: {
      contentItemId,
      model,
      evidenceSnapshotIds: toJson(parsed.evidence_snapshot_ids),
      evidenceContentItemIds: toJson(parsed.evidence_content_item_ids),
      topic: parsed.topic,
      sportLayer: parsed.sport_layer,
      contentArchetype: parsed.content_archetype,
      formatType: parsed.format_type,
      hookType: parsed.hook_type,
      audienceProblem: parsed.audience_problem,
      coachingQualityScore: parsed.coaching_quality_score,
      scientificQualityScore: parsed.scientific_quality_score,
      businessRelevanceScore: parsed.business_relevance_score,
      repeatabilityScore: parsed.repeatability_score,
      observableEvidence: parsed.observable_evidence,
      interpretation: parsed.interpretation,
      whyItLikelyPerformed: parsed.why_it_likely_performed,
      whyItMightUnderperform: parsed.why_it_might_underperform,
      risksOrCaveats: parsed.risks_or_caveats,
      suggestedAdaptationForUser: parsed.suggested_adaptation_for_user,
      confidenceScore: parsed.confidence_score,
      rawResponse
    }
  });
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it to .env.local before running audits.");
  }

  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openai;
}

function extractOutputText(response: unknown) {
  const typedResponse = response as { output_text?: string; output?: unknown[] };

  if (typedResponse.output_text) {
    return typedResponse.output_text;
  }

  throw new Error("OpenAI response did not include structured output text.");
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
