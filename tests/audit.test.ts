import { describe, expect, it } from "vitest";

import { validateAuditPayload } from "@/lib/audit";

const validPayload = {
  audit_version: "deep_video_audit_v2",
  analysis_depth: "quick",
  evidence_quality: "metadata_only",
  evidence_limitations: [
    "Metadata-only audit: no claims about pacing, editing, spoken structure, or demonstration quality."
  ],
  video_identity: {
    topic: "MMA conditioning",
    sport_layer: "mma_specific",
    primary_audience: "mma_athletes",
    business_relevance_score: 9,
    business_relevance_reasoning: ["The title names MMA conditioning and a fighter performance problem."]
  },
  format_breakdown: {
    content_archetype: "mistake_fix",
    hook_type: "pain_point",
    video_promise: "The title promises a conditioning fix for fighters.",
    likely_viewer_problem: "Fighters want repeatable conditioning work.",
    format_repeatability_score: 8,
    format_repeatability_reasoning: ["The topic can be adapted with original drills and programming."]
  },
  title_analysis: {
    clarity_score: 8,
    specificity_score: 8,
    search_intent_score: 7,
    click_trigger_score: 7,
    title_strengths: ["Specific to MMA conditioning"],
    title_weaknesses: [],
    better_title_variations_for_my_channel: ["Why MMA Fighters Gas Out After Round 2"]
  },
  thumbnail_analysis: {
    thumbnail_available: true,
    thumbnail_analyzed: false,
    visual_promise: "",
    visual_clarity_score: 0,
    combat_sport_specificity_score: 0,
    thumbnail_strengths: [],
    thumbnail_weaknesses: [],
    limitations: ["Thumbnail URL exists but image was not analyzed."]
  },
  coaching_and_science_analysis: {
    coaching_quality_score: 5,
    scientific_quality_score: 5,
    practical_application_score: 7,
    specificity_to_combat_sport_score: 8,
    transfer_to_mma_score: 8,
    overclaiming_risk_score: 3,
    what_seems_practically_useful: ["The metadata points to a practical conditioning topic."],
    what_requires_caution: ["No transcript or manual notes were supplied."],
    what_is_unknown_from_available_evidence: ["Actual exercise selection and coaching detail are unknown."]
  },
  performance_interpretation: {
    performance_bucket: "moderate_overperformer",
    performance_context: ["Stored score shows above-baseline views per day."],
    likely_reasons_it_performed: ["The topic maps to a clear fighter problem."],
    alternative_explanations: ["Packaging, audience size, timing, or external events may contribute."],
    why_it_might_not_be_repeatable: ["The metadata does not prove the topic alone drove performance."],
    confidence_in_performance_interpretation: 0.62
  },
  audience_response_analysis: {
    comments_available: false,
    main_viewer_reactions: [],
    viewer_questions_or_requests: [],
    unmet_needs_detected: [],
    signals_of_athlete_or_coach_audience: [],
    signals_of_low_business_relevance: [],
    confidence: 0.2
  },
  strategic_application_for_my_channel: {
    should_adapt: true,
    adaptation_priority: "high",
    why_this_matters_for_my_channel: ["Conditioning is a strong business-relevant topic."],
    how_to_adapt_ethically: ["Create an original fighter conditioning framework."],
    what_not_to_copy: ["Do not copy the title, thumbnail, or claims."],
    specific_video_ideas_for_me: ["Why MMA Fighters Gas Out After Round 2"],
    lead_magnet_or_offer_connection: ["Conditioning checklist"],
    recommended_followup_tests: ["Fetch comments and add manual notes."]
  },
  evidence: {
    observable_evidence: ["Title: MMA conditioning for fighters"],
    interpretations: ["This appears business-relevant for combat-sport performance coaching."],
    evidence_content_item_ids: ["content-1"],
    evidence_snapshot_ids: ["snapshot-1"],
    evidence_score_ids: ["score-1"],
    evidence_comment_ids: [],
    manual_note_ids: []
  },
  confidence_score: 0.74
};

const constraints = {
  allowedSnapshotIds: ["snapshot-1"],
  allowedContentItemIds: ["content-1"],
  allowedScoreIds: ["score-1"],
  allowedCommentIds: [],
  allowedManualNoteIds: [],
  expectedAnalysisDepth: "quick" as const,
  expectedEvidenceQuality: "metadata_only" as const
};

describe("audit validation", () => {
  it("accepts deep structured audit output with stored evidence IDs", () => {
    expect(validateAuditPayload(validPayload, constraints).confidence_score).toBe(0.74);
  });

  it("rejects output without evidence IDs", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence: { ...validPayload.evidence, evidence_content_item_ids: [] }
      })
    ).toThrow();
  });

  it("rejects output without observable evidence", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence: { ...validPayload.evidence, observable_evidence: [] }
      })
    ).toThrow();
  });

  it("rejects output without evidence limitations", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence_limitations: []
      })
    ).toThrow();
  });

  it("rejects evidence IDs that were not supplied to the model", () => {
    expect(() =>
      validateAuditPayload(validPayload, {
        ...constraints,
        allowedSnapshotIds: ["different-snapshot"]
      })
    ).toThrow("Audit evidence snapshot IDs must reference stored evidence supplied to the model.");
  });

  it("rejects evidence quality that does not match the server-built evidence pack", () => {
    expect(() =>
      validateAuditPayload(
        {
          ...validPayload,
          evidence_quality: "mixed"
        },
        constraints
      )
    ).toThrow("Audit evidence quality must match the server-built evidence pack.");
  });

  it("rejects audits without snapshot IDs", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence: { ...validPayload.evidence, evidence_snapshot_ids: [] }
      })
    ).toThrow();
  });

  it("rejects interpretation presented as observable evidence", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence: {
          ...validPayload.evidence,
          observable_evidence: ["This likely worked because fighters need conditioning."]
        }
      })
    ).toThrow("Observable evidence must not contain interpretation language.");
  });

  it("rejects causation or algorithm-change claims", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        performance_interpretation: {
          ...validPayload.performance_interpretation,
          likely_reasons_it_performed: ["The algorithm changed and caused the performance."]
        }
      })
    ).toThrow("Audit includes forbidden causation or algorithm-change claims.");
  });

  it("rejects strong in-video structure claims from metadata-only evidence", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        coaching_and_science_analysis: {
          ...validPayload.coaching_and_science_analysis,
          what_seems_practically_useful: ["The pacing and editing clearly support coaching delivery."]
        }
      })
    ).toThrow("Audits without transcript/manual notes cannot make strong in-video structure or delivery claims.");
  });

  it("rejects in-video structure claims from metadata-only interpretation fields", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        evidence: {
          ...validPayload.evidence,
          interpretations: ["The opening sequence clearly builds retention."]
        }
      })
    ).toThrow("Audits without transcript/manual notes cannot make strong in-video structure or delivery claims.");
  });

  it("rejects audience-response claims without comment evidence", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        audience_response_analysis: {
          ...validPayload.audience_response_analysis,
          main_viewer_reactions: ["Viewers praised the progression."],
          confidence: 0.6
        }
      })
    ).toThrow("Audience-response analysis requires stored comment evidence.");
  });

  it("rejects thumbnail claims when thumbnail analysis was not performed", () => {
    expect(() =>
      validateAuditPayload({
        ...validPayload,
        thumbnail_analysis: {
          ...validPayload.thumbnail_analysis,
          visual_promise: "The thumbnail clearly promises a fighter drill."
        }
      })
    ).toThrow("Thumbnail analysis claims require performed thumbnail/image analysis.");
  });
});
