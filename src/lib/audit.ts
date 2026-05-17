import OpenAI from "openai";
import { z } from "zod";

import {
  ANALYSIS_DEPTHS,
  EVIDENCE_QUALITIES,
  buildVideoEvidencePack,
  type AnalysisDepth,
  type EvidencePack,
  type EvidenceQuality,
  serializeEvidencePack
} from "@/lib/evidence";
import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";

let openai: OpenAI | null = null;

const zeroToTen = z.number().min(0).max(10);
const confidence = z.number().min(0).max(1);
const nonEmptyStringArray = z.array(z.string().min(1)).min(1);
const stringArray = z.array(z.string());

export const deepVideoAuditSchema = z.object({
  audit_version: z.literal("deep_video_audit_v2"),
  analysis_depth: z.enum(ANALYSIS_DEPTHS),
  evidence_quality: z.enum(EVIDENCE_QUALITIES),
  evidence_limitations: nonEmptyStringArray,
  video_identity: z.object({
    topic: z.string().min(1),
    sport_layer: z.enum([
      "mma_specific",
      "combat_sport",
      "general_sport",
      "generic_fitness",
      "unclear"
    ]),
    primary_audience: z.enum([
      "mma_athletes",
      "combat_sport_athletes",
      "coaches",
      "general_athletes",
      "general_fitness",
      "casual_fans",
      "unclear"
    ]),
    business_relevance_score: zeroToTen,
    business_relevance_reasoning: nonEmptyStringArray
  }),
  format_breakdown: z.object({
    content_archetype: z.enum([
      "mistake_fix",
      "myth_busting",
      "exercise_demo",
      "case_study",
      "programming_framework",
      "science_explainer",
      "reaction_breakdown",
      "listicle",
      "q_and_a",
      "vlog",
      "podcast",
      "entertainment",
      "other",
      "unclear"
    ]),
    hook_type: z.enum([
      "pain_point",
      "mistake",
      "controversial_claim",
      "fighter_case",
      "performance_outcome",
      "curiosity",
      "demonstration",
      "scientific_claim",
      "question",
      "unclear"
    ]),
    video_promise: z.string().min(1),
    likely_viewer_problem: z.string().min(1),
    format_repeatability_score: zeroToTen,
    format_repeatability_reasoning: nonEmptyStringArray
  }),
  title_analysis: z.object({
    clarity_score: zeroToTen,
    specificity_score: zeroToTen,
    search_intent_score: zeroToTen,
    click_trigger_score: zeroToTen,
    title_strengths: stringArray,
    title_weaknesses: stringArray,
    better_title_variations_for_my_channel: stringArray
  }),
  thumbnail_analysis: z.object({
    thumbnail_available: z.boolean(),
    thumbnail_analyzed: z.boolean(),
    visual_promise: z.string(),
    visual_clarity_score: zeroToTen,
    combat_sport_specificity_score: zeroToTen,
    thumbnail_strengths: stringArray,
    thumbnail_weaknesses: stringArray,
    limitations: stringArray
  }),
  coaching_and_science_analysis: z.object({
    coaching_quality_score: zeroToTen,
    scientific_quality_score: zeroToTen,
    practical_application_score: zeroToTen,
    specificity_to_combat_sport_score: zeroToTen,
    transfer_to_mma_score: zeroToTen,
    overclaiming_risk_score: zeroToTen,
    what_seems_practically_useful: stringArray,
    what_requires_caution: stringArray,
    what_is_unknown_from_available_evidence: stringArray
  }),
  performance_interpretation: z.object({
    performance_bucket: z.enum([
      "high_overperformer",
      "moderate_overperformer",
      "baseline",
      "underperformer",
      "unknown"
    ]),
    performance_context: nonEmptyStringArray,
    likely_reasons_it_performed: stringArray,
    alternative_explanations: nonEmptyStringArray,
    why_it_might_not_be_repeatable: stringArray,
    confidence_in_performance_interpretation: confidence
  }),
  audience_response_analysis: z.object({
    comments_available: z.boolean(),
    main_viewer_reactions: stringArray,
    viewer_questions_or_requests: stringArray,
    unmet_needs_detected: stringArray,
    signals_of_athlete_or_coach_audience: stringArray,
    signals_of_low_business_relevance: stringArray,
    confidence
  }),
  strategic_application_for_my_channel: z.object({
    should_adapt: z.boolean(),
    adaptation_priority: z.enum(["high", "medium", "low"]),
    why_this_matters_for_my_channel: nonEmptyStringArray,
    how_to_adapt_ethically: nonEmptyStringArray,
    what_not_to_copy: nonEmptyStringArray,
    specific_video_ideas_for_me: stringArray,
    lead_magnet_or_offer_connection: stringArray,
    recommended_followup_tests: stringArray
  }),
  evidence: z.object({
    observable_evidence: nonEmptyStringArray,
    interpretations: nonEmptyStringArray,
    evidence_content_item_ids: z.array(z.string()).min(1),
    evidence_snapshot_ids: z.array(z.string()).min(1),
    evidence_score_ids: z.array(z.string()),
    evidence_comment_ids: z.array(z.string()),
    manual_note_ids: z.array(z.string())
  }),
  confidence_score: confidence
});

export type DeepVideoAuditPayload = z.infer<typeof deepVideoAuditSchema>;

const DEEP_AUDIT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "audit_version",
    "analysis_depth",
    "evidence_quality",
    "evidence_limitations",
    "video_identity",
    "format_breakdown",
    "title_analysis",
    "thumbnail_analysis",
    "coaching_and_science_analysis",
    "performance_interpretation",
    "audience_response_analysis",
    "strategic_application_for_my_channel",
    "evidence",
    "confidence_score"
  ],
  properties: {
    audit_version: { type: "string", enum: ["deep_video_audit_v2"] },
    analysis_depth: { type: "string", enum: [...ANALYSIS_DEPTHS] },
    evidence_quality: { type: "string", enum: [...EVIDENCE_QUALITIES] },
    evidence_limitations: { type: "array", items: { type: "string" }, minItems: 1 },
    video_identity: objectSchema({
      topic: { type: "string" },
      sport_layer: {
        type: "string",
        enum: ["mma_specific", "combat_sport", "general_sport", "generic_fitness", "unclear"]
      },
      primary_audience: {
        type: "string",
        enum: [
          "mma_athletes",
          "combat_sport_athletes",
          "coaches",
          "general_athletes",
          "general_fitness",
          "casual_fans",
          "unclear"
        ]
      },
      business_relevance_score: numberSchema(0, 10),
      business_relevance_reasoning: arraySchema()
    }),
    format_breakdown: objectSchema({
      content_archetype: {
        type: "string",
        enum: [
          "mistake_fix",
          "myth_busting",
          "exercise_demo",
          "case_study",
          "programming_framework",
          "science_explainer",
          "reaction_breakdown",
          "listicle",
          "q_and_a",
          "vlog",
          "podcast",
          "entertainment",
          "other",
          "unclear"
        ]
      },
      hook_type: {
        type: "string",
        enum: [
          "pain_point",
          "mistake",
          "controversial_claim",
          "fighter_case",
          "performance_outcome",
          "curiosity",
          "demonstration",
          "scientific_claim",
          "question",
          "unclear"
        ]
      },
      video_promise: { type: "string" },
      likely_viewer_problem: { type: "string" },
      format_repeatability_score: numberSchema(0, 10),
      format_repeatability_reasoning: arraySchema()
    }),
    title_analysis: objectSchema({
      clarity_score: numberSchema(0, 10),
      specificity_score: numberSchema(0, 10),
      search_intent_score: numberSchema(0, 10),
      click_trigger_score: numberSchema(0, 10),
      title_strengths: arraySchema(),
      title_weaknesses: arraySchema(),
      better_title_variations_for_my_channel: arraySchema()
    }),
    thumbnail_analysis: objectSchema({
      thumbnail_available: { type: "boolean" },
      thumbnail_analyzed: { type: "boolean" },
      visual_promise: { type: "string" },
      visual_clarity_score: numberSchema(0, 10),
      combat_sport_specificity_score: numberSchema(0, 10),
      thumbnail_strengths: arraySchema(),
      thumbnail_weaknesses: arraySchema(),
      limitations: arraySchema()
    }),
    coaching_and_science_analysis: objectSchema({
      coaching_quality_score: numberSchema(0, 10),
      scientific_quality_score: numberSchema(0, 10),
      practical_application_score: numberSchema(0, 10),
      specificity_to_combat_sport_score: numberSchema(0, 10),
      transfer_to_mma_score: numberSchema(0, 10),
      overclaiming_risk_score: numberSchema(0, 10),
      what_seems_practically_useful: arraySchema(),
      what_requires_caution: arraySchema(),
      what_is_unknown_from_available_evidence: arraySchema()
    }),
    performance_interpretation: objectSchema({
      performance_bucket: {
        type: "string",
        enum: ["high_overperformer", "moderate_overperformer", "baseline", "underperformer", "unknown"]
      },
      performance_context: arraySchema(),
      likely_reasons_it_performed: arraySchema(),
      alternative_explanations: arraySchema(),
      why_it_might_not_be_repeatable: arraySchema(),
      confidence_in_performance_interpretation: numberSchema(0, 1)
    }),
    audience_response_analysis: objectSchema({
      comments_available: { type: "boolean" },
      main_viewer_reactions: arraySchema(),
      viewer_questions_or_requests: arraySchema(),
      unmet_needs_detected: arraySchema(),
      signals_of_athlete_or_coach_audience: arraySchema(),
      signals_of_low_business_relevance: arraySchema(),
      confidence: numberSchema(0, 1)
    }),
    strategic_application_for_my_channel: objectSchema({
      should_adapt: { type: "boolean" },
      adaptation_priority: { type: "string", enum: ["high", "medium", "low"] },
      why_this_matters_for_my_channel: arraySchema(),
      how_to_adapt_ethically: arraySchema(),
      what_not_to_copy: arraySchema(),
      specific_video_ideas_for_me: arraySchema(),
      lead_magnet_or_offer_connection: arraySchema(),
      recommended_followup_tests: arraySchema()
    }),
    evidence: objectSchema({
      observable_evidence: arraySchema(),
      interpretations: arraySchema(),
      evidence_content_item_ids: { type: "array", items: { type: "string" }, minItems: 1 },
      evidence_snapshot_ids: { type: "array", items: { type: "string" }, minItems: 1 },
      evidence_score_ids: { type: "array", items: { type: "string" } },
      evidence_comment_ids: { type: "array", items: { type: "string" } },
      manual_note_ids: { type: "array", items: { type: "string" } }
    }),
    confidence_score: numberSchema(0, 1)
  }
};

type EvidenceConstraint = {
  allowedContentItemIds: string[];
  allowedSnapshotIds: string[];
  allowedScoreIds: string[];
  allowedCommentIds: string[];
  allowedManualNoteIds: string[];
  expectedAnalysisDepth?: AnalysisDepth;
  expectedEvidenceQuality?: EvidenceQuality;
};

export function validateAuditPayload(
  payload: unknown,
  constraints?: EvidenceConstraint
): DeepVideoAuditPayload {
  const parsed = deepVideoAuditSchema.parse(payload);

  if (parsed.evidence.observable_evidence.length === 0) {
    throw new Error("Audit must include observable evidence.");
  }

  if (parsed.evidence_limitations.length === 0) {
    throw new Error("Audit must include evidence limitations.");
  }

  assertExpectedEvidenceLevel(parsed, constraints);
  assertEvidenceIds(parsed, constraints);
  assertNoForbiddenClaims(parsed);
  assertEvidenceLevelBoundaries(parsed);

  return parsed;
}

export async function auditSelectedContentItems(
  contentItemIds: string[],
  analysisDepth: AnalysisDepth = "quick"
) {
  const uniqueIds = [...new Set(contentItemIds)].filter(Boolean);
  const results = [];

  for (const contentItemId of uniqueIds) {
    results.push(await auditContentItem(contentItemId, analysisDepth));
  }

  return results;
}

export async function auditContentItem(
  contentItemId: string,
  analysisDepth: AnalysisDepth = "quick"
) {
  const evidencePack = await buildVideoEvidencePack(contentItemId, analysisDepth);
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const response = await getOpenAIClient().responses.create({
    model,
    temperature: 0.2,
    input: [
      {
        role: "system",
        content:
          "You are a YouTube market research analyst for an MMA/combat-sport performance coach. Analyze only the supplied evidence pack. Separate observable evidence, reasonable interpretation, confidence, and practical recommendation. Do not claim causation, algorithm changes, unseen video structure, creator credentials, or in-video details that are not supported by evidence. Metadata-only audits must explicitly state limitations and avoid strong claims about pacing, editing, delivery style, demonstrations, or spoken structure. Recommend ethical adaptation, not copying."
      },
      {
        role: "user",
        content: `Return a deep_video_audit_v2 structured audit for this evidence pack:\n${JSON.stringify(evidencePack, null, 2)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "deep_video_audit_v2",
        strict: true,
        schema: DEEP_AUDIT_JSON_SCHEMA
      }
    }
  } as never);

  const outputText = extractOutputText(response);
  const payload = validateAuditPayload(JSON.parse(outputText), constraintsFromEvidencePack(evidencePack));

  return saveContentAudit(contentItemId, payload, model, toJson(response), evidencePack);
}

export async function saveContentAudit(
  contentItemId: string,
  payload: unknown,
  model: string,
  rawResponse?: string,
  evidencePack?: EvidencePack
) {
  if (!evidencePack) {
    throw new Error("Content audits require a server-built evidence pack.");
  }

  if (contentItemId !== evidencePack.content_item_id) {
    throw new Error("Audit content item must match the server-built evidence pack.");
  }

  const parsed = validateAuditPayload(payload, constraintsFromEvidencePack(evidencePack));
  const scoreId = parsed.evidence.evidence_score_ids[0] ?? null;
  const serializedEvidencePack = serializeEvidencePack(evidencePack);

  return getPrisma().contentAudit.create({
    data: {
      contentItemId,
      scoreId,
      model,
      auditVersion: parsed.audit_version,
      analysisDepth: evidencePack.analysis_depth_requested,
      evidenceQuality: evidencePack.evidence_quality,
      evidenceLimitations: toJson(parsed.evidence_limitations),
      evidencePack: serializedEvidencePack,
      evidenceSnapshotIds: toJson(parsed.evidence.evidence_snapshot_ids),
      evidenceContentItemIds: toJson(parsed.evidence.evidence_content_item_ids),
      evidenceScoreIds: toJson(parsed.evidence.evidence_score_ids),
      evidenceCommentIds: toJson(parsed.evidence.evidence_comment_ids),
      manualNoteIds: toJson(parsed.evidence.manual_note_ids),
      topic: parsed.video_identity.topic,
      sportLayer: parsed.video_identity.sport_layer,
      primaryAudience: parsed.video_identity.primary_audience,
      contentArchetype: parsed.format_breakdown.content_archetype,
      formatType: evidencePack.format_type,
      hookType: parsed.format_breakdown.hook_type,
      audienceProblem: parsed.format_breakdown.likely_viewer_problem,
      coachingQualityScore: Math.round(parsed.coaching_and_science_analysis.coaching_quality_score),
      scientificQualityScore: Math.round(parsed.coaching_and_science_analysis.scientific_quality_score),
      businessRelevanceScore: Math.round(parsed.video_identity.business_relevance_score),
      repeatabilityScore: Math.round(parsed.format_breakdown.format_repeatability_score),
      observableEvidence: parsed.evidence.observable_evidence.join("\n"),
      interpretation: parsed.evidence.interpretations.join("\n"),
      whyItLikelyPerformed: parsed.performance_interpretation.likely_reasons_it_performed.join("\n"),
      whyItMightUnderperform: parsed.performance_interpretation.why_it_might_not_be_repeatable.join("\n"),
      risksOrCaveats: [
        ...parsed.evidence_limitations,
        ...parsed.performance_interpretation.alternative_explanations
      ].join("\n"),
      suggestedAdaptationForUser: parsed.strategic_application_for_my_channel.how_to_adapt_ethically.join("\n"),
      fullAuditJson: toJson(parsed),
      confidenceScore: parsed.confidence_score,
      rawResponse
    }
  });
}

export function canDeepAudit(input: {
  analysisDepth: AnalysisDepth;
  evidenceQuality: EvidenceQuality;
}) {
  return (
    input.analysisDepth !== "deep" ||
    input.evidenceQuality === "transcript_or_manual_notes" ||
    input.evidenceQuality === "mixed"
  );
}

function constraintsFromEvidencePack(evidencePack: EvidencePack): EvidenceConstraint {
  return {
    allowedContentItemIds: evidencePack.evidence_ids.content_item_ids,
    allowedSnapshotIds: evidencePack.evidence_ids.snapshot_ids,
    allowedScoreIds: evidencePack.evidence_ids.score_ids,
    allowedCommentIds: evidencePack.evidence_ids.comment_ids,
    allowedManualNoteIds: evidencePack.evidence_ids.manual_note_ids,
    expectedAnalysisDepth: evidencePack.analysis_depth_requested,
    expectedEvidenceQuality: evidencePack.evidence_quality
  };
}

function assertExpectedEvidenceLevel(
  parsed: DeepVideoAuditPayload,
  constraints?: EvidenceConstraint
) {
  if (
    constraints?.expectedAnalysisDepth &&
    parsed.analysis_depth !== constraints.expectedAnalysisDepth
  ) {
    throw new Error("Audit analysis depth must match the server-built evidence pack.");
  }

  if (
    constraints?.expectedEvidenceQuality &&
    parsed.evidence_quality !== constraints.expectedEvidenceQuality
  ) {
    throw new Error("Audit evidence quality must match the server-built evidence pack.");
  }
}

function assertEvidenceIds(parsed: DeepVideoAuditPayload, constraints?: EvidenceConstraint) {
  if (parsed.evidence.evidence_content_item_ids.length === 0) {
    throw new Error("Audit must include evidence content item IDs.");
  }

  if (parsed.evidence.evidence_snapshot_ids.length === 0) {
    throw new Error("Audit must include evidence snapshot IDs.");
  }

  if (!constraints) {
    return;
  }

  assertKnownIds(parsed.evidence.evidence_content_item_ids, constraints.allowedContentItemIds, "content item");
  assertKnownIds(parsed.evidence.evidence_snapshot_ids, constraints.allowedSnapshotIds, "snapshot");
  assertKnownIds(parsed.evidence.evidence_score_ids, constraints.allowedScoreIds, "score");
  assertKnownIds(parsed.evidence.evidence_comment_ids, constraints.allowedCommentIds, "comment");
  assertKnownIds(parsed.evidence.manual_note_ids, constraints.allowedManualNoteIds, "manual note");

  for (const contentItemId of constraints.allowedContentItemIds) {
    if (!parsed.evidence.evidence_content_item_ids.includes(contentItemId)) {
      throw new Error("Audit must cite the content item from the server-built evidence pack.");
    }
  }

  for (const snapshotId of constraints.allowedSnapshotIds) {
    if (!parsed.evidence.evidence_snapshot_ids.includes(snapshotId)) {
      throw new Error("Audit must cite the metric snapshot from the server-built evidence pack.");
    }
  }
}

function assertKnownIds(values: string[], allowed: string[], label: string) {
  const allowedSet = new Set(allowed);
  const unknown = values.find((value) => !allowedSet.has(value));

  if (unknown) {
    throw new Error(`Audit evidence ${label} IDs must reference stored evidence supplied to the model.`);
  }
}

function assertNoForbiddenClaims(parsed: DeepVideoAuditPayload) {
  const fullText = JSON.stringify(parsed).toLowerCase();
  const forbidden = [
    "algorithm changed",
    "youtube algorithm changed",
    "caused the performance",
    "caused it to perform",
    "because the algorithm",
    "proved that",
    "proves that"
  ];

  for (const phrase of forbidden) {
    if (fullText.includes(phrase)) {
      throw new Error("Audit includes forbidden causation or algorithm-change claims.");
    }
  }

  for (const evidence of parsed.evidence.observable_evidence) {
    if (/\b(likely|probably|may indicate|suggests|seems|could mean|performed because)\b/i.test(evidence)) {
      throw new Error("Observable evidence must not contain interpretation language.");
    }
  }

  const hasDirectVideoEvidence =
    parsed.evidence_quality === "transcript_or_manual_notes" ||
    parsed.evidence_quality === "mixed";

  if (!hasDirectVideoEvidence) {
    assertNoDirectVideoClaims(parsed);
  }
}

function assertEvidenceLevelBoundaries(parsed: DeepVideoAuditPayload) {
  if (parsed.evidence.evidence_comment_ids.length === 0) {
    const response = parsed.audience_response_analysis;
    const audienceClaims = [
      ...response.main_viewer_reactions,
      ...response.viewer_questions_or_requests,
      ...response.unmet_needs_detected,
      ...response.signals_of_athlete_or_coach_audience,
      ...response.signals_of_low_business_relevance
    ];

    if (response.comments_available || audienceClaims.length > 0 || response.confidence > 0.25) {
      throw new Error("Audience-response analysis requires stored comment evidence.");
    }
  }

  if (!parsed.thumbnail_analysis.thumbnail_analyzed) {
    const thumbnailClaims = [
      parsed.thumbnail_analysis.visual_promise,
      ...parsed.thumbnail_analysis.thumbnail_strengths,
      ...parsed.thumbnail_analysis.thumbnail_weaknesses
    ].filter((value) => value.trim());

    if (
      thumbnailClaims.length > 0 ||
      parsed.thumbnail_analysis.visual_clarity_score !== 0 ||
      parsed.thumbnail_analysis.combat_sport_specificity_score !== 0
    ) {
      throw new Error("Thumbnail analysis claims require performed thumbnail/image analysis.");
    }
  }
}

function assertNoDirectVideoClaims(parsed: DeepVideoAuditPayload) {
  const directVideoClaimTerms =
    /\b(pacing|editing|spoken hook|opening sequence|delivery style|demonstration quality|exercise demonstration quality|demonstrates|demonstration|explains at|shows at|cta at|call to action at|retention|watch time|b-roll|voiceover|on camera|walks through|opening hook sequence)\b/i;
  const { evidence_limitations: _evidenceLimitations, thumbnail_analysis: _thumbnailAnalysis, ...claimFields } = parsed;
  const fieldsToCheck = collectStrings(claimFields).join(" ");

  if (directVideoClaimTerms.test(fieldsToCheck)) {
    throw new Error("Audits without transcript/manual notes cannot make strong in-video structure or delivery claims.");
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
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
  const typedResponse = response as { output_text?: string };

  if (typedResponse.output_text) {
    return typedResponse.output_text;
  }

  throw new Error("OpenAI response did not include structured output text.");
}

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  };
}

function arraySchema() {
  return { type: "array", items: { type: "string" } };
}

function numberSchema(minimum: number, maximum: number) {
  return { type: "number", minimum, maximum };
}
