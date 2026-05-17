import { getPrisma } from "@/lib/prisma";
import { parseJsonArray, toJson } from "@/lib/json";

export const EVIDENCE_QUALITIES = [
  "metadata_only",
  "metadata_plus_comments",
  "metadata_plus_thumbnail",
  "metadata_plus_comments_thumbnail",
  "transcript_or_manual_notes",
  "mixed"
] as const;

export const ANALYSIS_DEPTHS = ["quick", "standard", "deep"] as const;

export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];
export type AnalysisDepth = (typeof ANALYSIS_DEPTHS)[number];

export type EvidencePack = Awaited<ReturnType<typeof buildVideoEvidencePack>>;

export function hasManualOrTranscriptEvidence(notes: ManualEvidenceLike[]) {
  return notes.some((note) => {
    if (note.transcriptOrExcerpt?.trim()) {
      return true;
    }

    if (!note.watchedByUser) {
      return false;
    }

    return [
      note.openingHookNotes,
      note.videoStructureNotes,
      note.coachingDeliveryNotes,
      note.exerciseOrTrainingContentNotes,
      note.scienceOrClaimsNotes,
      note.ctaOrOfferNotes
    ].some((value) => Boolean(value?.trim()));
  });
}

export function assignEvidenceQuality(input: {
  hasComments: boolean;
  hasThumbnailAnalysis: boolean;
  hasManualOrTranscript: boolean;
}): EvidenceQuality {
  if (input.hasManualOrTranscript) {
    return input.hasComments || input.hasThumbnailAnalysis
      ? "mixed"
      : "transcript_or_manual_notes";
  }

  if (input.hasComments && input.hasThumbnailAnalysis) {
    return "metadata_plus_comments_thumbnail";
  }

  if (input.hasComments) {
    return "metadata_plus_comments";
  }

  if (input.hasThumbnailAnalysis) {
    return "metadata_plus_thumbnail";
  }

  return "metadata_only";
}

export function evidenceLimitationsFor(input: {
  evidenceQuality: EvidenceQuality;
  hasComments: boolean;
  hasThumbnailUrl: boolean;
  hasThumbnailAnalysis: boolean;
  hasManualOrTranscript: boolean;
}) {
  const limitations = [
    "Analysis uses stored YouTube API data and user-supplied evidence only.",
    "Performance interpretation is correlational and cannot prove why viewers clicked or watched."
  ];

  if (input.evidenceQuality === "metadata_only") {
    limitations.push(
      "Metadata-only audit: do not make strong claims about pacing, editing, spoken hook, exercise demonstration quality, delivery style, or full video structure."
    );
  }

  if (!input.hasComments) {
    limitations.push("No stored comments were available, so audience-response interpretation is limited.");
  }

  if (input.hasThumbnailUrl && !input.hasThumbnailAnalysis) {
    limitations.push(
      "A thumbnail URL is stored, but no visual thumbnail analysis was performed."
    );
  }

  if (!input.hasManualOrTranscript) {
    limitations.push(
      "No manual notes or transcript/excerpt were supplied, so coaching delivery and in-video structure claims must remain cautious."
    );
  }

  return limitations;
}

export async function buildVideoEvidencePack(
  contentItemId: string,
  analysisDepth: AnalysisDepth
) {
  const prisma = getPrisma();
  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      creator: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
      scores: { orderBy: { scoredAt: "desc" }, take: 1 },
      comments: { orderBy: [{ likeCount: "desc" }, { capturedAt: "desc" }], take: 25 },
      manualNotes: { orderBy: { updatedAt: "desc" }, take: 5 },
      audits: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  if (!contentItem) {
    throw new Error("Content item not found.");
  }

  const snapshot = contentItem.snapshots[0];
  if (!snapshot) {
    throw new Error("A video must have a stored metric snapshot before it can be audited.");
  }

  const score = contentItem.scores[0] ?? null;
  const hasComments = contentItem.comments.length > 0;
  const hasManualOrTranscript = hasManualOrTranscriptEvidence(contentItem.manualNotes);
  const hasThumbnailUrl = Boolean(contentItem.thumbnailUrl);
  const hasThumbnailAnalysis = false;
  const evidenceQuality = assignEvidenceQuality({
    hasComments,
    hasThumbnailAnalysis,
    hasManualOrTranscript
  });
  const evidenceLimitations = evidenceLimitationsFor({
    evidenceQuality,
    hasComments,
    hasThumbnailUrl,
    hasThumbnailAnalysis,
    hasManualOrTranscript
  });

  if (analysisDepth === "standard" && !hasComments) {
    evidenceLimitations.push(
      "Standard mode was requested, but no comments are stored yet; this audit will remain closer to a quick metadata audit."
    );
  }

  if (analysisDepth === "deep" && !hasManualOrTranscript) {
    throw new Error(
      "Deep audits require manual notes, transcript/excerpt, or equivalent richer evidence. Add Manual Evidence Notes on the video detail page first."
    );
  }

  const comparable = await buildComparableVideos(contentItem.creatorId, contentItem.id, contentItem.formatType);

  return {
    content_item_id: contentItem.id,
    creator_id: contentItem.creatorId,
    channel_name: contentItem.creator.name,
    creator_layer: contentItem.creator.layer,
    creator_niche: contentItem.creator.notes ?? contentItem.creator.description ?? null,
    video_title: contentItem.title,
    description: contentItem.description,
    published_at: contentItem.publishedAt?.toISOString() ?? null,
    duration_seconds: contentItem.durationSeconds,
    format_type: contentItem.formatType,
    thumbnail_url: contentItem.thumbnailUrl,
    thumbnail_analyzed: hasThumbnailAnalysis,
    video_url: contentItem.url,
    latest_snapshot_id: snapshot.id,
    latest_view_count: snapshot.viewCount?.toString() ?? null,
    latest_like_count: snapshot.likeCount?.toString() ?? null,
    latest_comment_count: snapshot.commentCount?.toString() ?? null,
    score_id: score?.id ?? null,
    views_per_day: score?.viewsPerDay ?? null,
    overperformance_score: score?.overperformanceScore ?? null,
    percentile_within_creator: score?.percentileWithinCreator ?? null,
    percentile_within_layer: score?.percentileWithinLayer ?? null,
    score_flags: parseJsonArray(score?.flags),
    top_comments: contentItem.comments.map((comment) => ({
      comment_id: comment.id,
      youtube_comment_id: comment.youtubeCommentId,
      author_display_name: comment.authorDisplayName,
      text: comment.text,
      like_count: comment.likeCount,
      published_at: comment.publishedAt?.toISOString() ?? null
    })),
    manual_notes: contentItem.manualNotes.map((note) => ({
      manual_note_id: note.id,
      watched_by_user: note.watchedByUser,
      opening_hook_notes: note.openingHookNotes,
      video_structure_notes: note.videoStructureNotes,
      coaching_delivery_notes: note.coachingDeliveryNotes,
      exercise_or_training_content_notes: note.exerciseOrTrainingContentNotes,
      science_or_claims_notes: note.scienceOrClaimsNotes,
      cta_or_offer_notes: note.ctaOrOfferNotes,
      transcript_or_excerpt: note.transcriptOrExcerpt,
      user_notes: note.userNotes
    })),
    comparable_top_videos_for_creator: comparable.top,
    comparable_bottom_videos_for_creator: comparable.bottom,
    analysis_depth_requested: analysisDepth,
    evidence_quality: evidenceQuality,
    evidence_limitations: evidenceLimitations,
    evidence_ids: {
      content_item_ids: [contentItem.id],
      snapshot_ids: [snapshot.id],
      score_ids: score ? [score.id] : [],
      comment_ids: contentItem.comments.map((comment) => comment.id),
      manual_note_ids: contentItem.manualNotes.map((note) => note.id)
    }
  };
}

export function serializeEvidencePack(pack: EvidencePack) {
  return toJson(pack);
}

async function buildComparableVideos(creatorId: string, excludedId: string, formatType: string) {
  const scores = await getPrisma().performanceScore.findMany({
    where: {
      contentItem: {
        creatorId,
        id: { not: excludedId }
      },
      formatType,
      overperformanceScore: { not: null }
    },
    orderBy: { overperformanceScore: "desc" },
    take: 10,
    include: { contentItem: true }
  });

  const mapped = scores.map((score) => ({
    content_item_id: score.contentItemId,
    title: score.contentItem.title,
    overperformance_score: score.overperformanceScore,
    views_per_day: score.viewsPerDay,
    score_flags: parseJsonArray(score.flags)
  }));

  return {
    top: mapped.slice(0, 5),
    bottom: mapped.slice(-5).reverse()
  };
}

type ManualEvidenceLike = {
  watchedByUser?: boolean | null;
  openingHookNotes?: string | null;
  videoStructureNotes?: string | null;
  coachingDeliveryNotes?: string | null;
  exerciseOrTrainingContentNotes?: string | null;
  scienceOrClaimsNotes?: string | null;
  ctaOrOfferNotes?: string | null;
  transcriptOrExcerpt?: string | null;
  userNotes?: string | null;
};
