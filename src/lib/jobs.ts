import { getPrisma } from "@/lib/prisma";
import { toJson, parseJsonArray } from "@/lib/json";
import {
  assertYoutubeQuotaAvailable,
  estimateCommentQuotaCost,
  estimateDiscoveryQuotaCost,
  estimateRefreshQuotaCost
} from "@/lib/quota";
import { getDataExpiryDate, getNumberSetting } from "@/lib/settings";
import {
  bestThumbnail,
  getYoutubeClient,
  inferFormatType,
  parseOptionalBigInt,
  parseYoutubeDurationSeconds,
  type YoutubeChannel,
  type YoutubeCommentThread,
  type YoutubeSearchItem,
  type YoutubeVideo
} from "@/lib/youtube";
import { calculateAndStoreScores } from "@/lib/scoring";
import { auditSelectedContentItems } from "@/lib/audit";
import type { AnalysisDepth } from "@/lib/evidence";
import {
  generateContentBriefsFromLatestTrendReport,
  generateCreatorPatternReports,
  generateCrossCreatorTrendReport
} from "@/lib/trends";

export type DiscoveryInput = {
  query: string;
  layer: string;
  maxResults: number;
  maxPages: number;
  includeVideoSearch: boolean;
};

export async function runDiscoveryJob(input: DiscoveryInput) {
  const prisma = getPrisma();
  const maxResults = clamp(input.maxResults, 1, 50);
  const maxPages = clamp(input.maxPages, 1, await getNumberSetting("YOUTUBE_MAX_DISCOVERY_PAGES"));
  const estimatedQuotaCost = estimateDiscoveryQuotaCost(input.includeVideoSearch);

  await assertYoutubeQuotaAvailable(estimatedQuotaCost);

  const discoveryQuery = await prisma.discoveryQuery.create({
    data: {
      query: input.query,
      layer: input.layer,
      maxResults,
      maxPages,
      includeVideoSearch: input.includeVideoSearch,
      estimatedQuotaCost,
      status: "running"
    }
  });

  const client = getYoutubeClient(discoveryQuery.id);

  try {
    const channelResults = await client.searchChannels(input.query, maxResults);
    const expiryDate = await getDataExpiryDate();
    await storeChannelCandidates(discoveryQuery.id, channelResults.items, expiryDate);

    if (input.includeVideoSearch) {
      const videoResults = await client.searchVideos(input.query, maxResults);
      await storeVideoCandidates(discoveryQuery.id, videoResults.items, expiryDate);
    }

    return prisma.discoveryQuery.update({
      where: { id: discoveryQuery.id },
      data: {
        status: "completed",
        completedAt: new Date()
      },
      include: { candidates: true }
    });
  } catch (error) {
    await prisma.discoveryQuery.update({
      where: { id: discoveryQuery.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown discovery error",
        completedAt: new Date()
      }
    });
    throw error;
  }
}

export async function approveCandidateJob(candidateId: string) {
  const prisma = getPrisma();
  const candidate = await prisma.discoveryCandidate.findUnique({
    where: { id: candidateId },
    include: { query: true }
  });

  if (!candidate) {
    throw new Error("Candidate not found.");
  }

  const existingAccount = await prisma.creatorAccount.findUnique({
    where: { channelId: candidate.channelId },
    include: { creator: true }
  });

  if (existingAccount) {
    const creator = await prisma.creator.update({
      where: { id: existingAccount.creatorId },
      data: { status: "approved" }
    });
    await prisma.discoveryCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        creatorId: creator.id
      }
    });
    return creator;
  }

  const creator = await prisma.creator.create({
    data: {
      name: candidate.title,
      description: candidate.description,
      layer: candidate.query.layer,
      status: "approved",
      discoveryCandidates: {
        connect: { id: candidate.id }
      },
      accounts: {
        create: {
          platform: "youtube",
          channelId: candidate.channelId,
          channelUrl: `https://www.youtube.com/channel/${candidate.channelId}`,
          title: candidate.title,
          description: candidate.description,
          rawResponse: candidate.rawResponse
        }
      }
    }
  });

  await prisma.discoveryCandidate.update({
    where: { id: candidate.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      creatorId: creator.id
    }
  });

  return creator;
}

export async function rejectCandidateJob(candidateId: string) {
  return getPrisma().discoveryCandidate.update({
    where: { id: candidateId },
    data: { status: "rejected" }
  });
}

export async function refreshCreatorJob(creatorId: string) {
  const prisma = getPrisma();
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    include: { accounts: true }
  });

  if (!creator) {
    throw new Error("Creator not found.");
  }

  const maxPages = await getNumberSetting("YOUTUBE_MAX_DISCOVERY_PAGES");
  await assertYoutubeQuotaAvailable(estimateRefreshQuotaCost(maxPages, maxPages * 50));
  const client = getYoutubeClient();

  for (const account of creator.accounts.filter((item) => item.platform === "youtube")) {
    const channel = await client.getChannelById(account.channelId);
    if (!channel) {
      continue;
    }

    const expiryDate = await getDataExpiryDate();
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads ?? account.uploadsPlaylistId;

    const updatedAccount = await prisma.creatorAccount.update({
      where: { id: account.id },
      data: mapChannelToAccount(channel, expiryDate)
    });

    if (!uploadsPlaylistId) {
      continue;
    }

    const uploads = await client.listUploads(uploadsPlaylistId, maxPages);
    const videoIds = uploads.items
      .map((item) => item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId)
      .filter((value): value is string => Boolean(value));

    if (videoIds.length === 0) {
      continue;
    }

    const videos = await client.getVideos(videoIds);
    for (const video of videos.items) {
      await storeVideo(creator.id, updatedAccount.id, video, expiryDate);
    }
  }

  return prisma.creator.findUnique({
    where: { id: creatorId },
    include: { accounts: true, contentItems: true }
  });
}

export async function refreshAllApprovedCreatorsJob() {
  const creators = await getPrisma().creator.findMany({
    where: { status: "approved" },
    select: { id: true }
  });
  const refreshed = [];

  for (const creator of creators) {
    refreshed.push(await refreshCreatorJob(creator.id));
  }

  return refreshed;
}

export async function calculateScoresJob() {
  return calculateAndStoreScores();
}

export async function auditSelectedVideosJob(contentItemIds: string[]) {
  return auditSelectedContentItems(contentItemIds);
}

export async function auditSelectedVideosWithDepthJob(
  contentItemIds: string[],
  analysisDepth: AnalysisDepth
) {
  return auditSelectedContentItems(contentItemIds, analysisDepth);
}

export async function saveManualEvidenceNotesJob(input: {
  contentItemId: string;
  watchedByUser: boolean;
  openingHookNotes?: string;
  videoStructureNotes?: string;
  coachingDeliveryNotes?: string;
  exerciseOrTrainingContentNotes?: string;
  scienceOrClaimsNotes?: string;
  ctaOrOfferNotes?: string;
  transcriptOrExcerpt?: string;
  userNotes?: string;
}) {
  return getPrisma().manualEvidenceNote.create({
    data: {
      contentItemId: input.contentItemId,
      watchedByUser: input.watchedByUser,
      openingHookNotes: nullableText(input.openingHookNotes),
      videoStructureNotes: nullableText(input.videoStructureNotes),
      coachingDeliveryNotes: nullableText(input.coachingDeliveryNotes),
      exerciseOrTrainingContentNotes: nullableText(input.exerciseOrTrainingContentNotes),
      scienceOrClaimsNotes: nullableText(input.scienceOrClaimsNotes),
      ctaOrOfferNotes: nullableText(input.ctaOrOfferNotes),
      transcriptOrExcerpt: nullableText(input.transcriptOrExcerpt),
      userNotes: nullableText(input.userNotes)
    }
  });
}

export async function fetchCommentsForVideosJob(
  contentItemIds: string[],
  maxResults?: number
) {
  const prisma = getPrisma();
  const configuredMax = await getNumberSetting("YOUTUBE_COMMENT_MAX_RESULTS");
  const boundedMaxResults = clamp(maxResults ?? configuredMax, 1, 100);
  const videos = await prisma.contentItem.findMany({
    where: { id: { in: [...new Set(contentItemIds)].filter(Boolean) } },
    select: { id: true, youtubeVideoId: true, title: true }
  });

  if (videos.length === 0) {
    throw new Error("No matching stored videos were found for comment collection.");
  }

  await assertYoutubeQuotaAvailable(estimateCommentQuotaCost(videos.length));

  const client = getYoutubeClient();
  const results: {
    contentItemId: string;
    title: string;
    status: "success" | "error";
    storedComments: number;
    message?: string;
  }[] = [];

  for (const video of videos) {
    try {
      const response = await client.getCommentThreads(video.youtubeVideoId, boundedMaxResults, "relevance");
      let storedComments = 0;

      for (const item of response.items) {
        const stored = await storeComment(video.id, item);
        if (stored) {
          storedComments += 1;
        }
      }

      results.push({
        contentItemId: video.id,
        title: video.title,
        status: "success",
        storedComments
      });
    } catch (error) {
      results.push({
        contentItemId: video.id,
        title: video.title,
        status: "error",
        storedComments: 0,
        message: classifyCommentError(error)
      });
    }
  }

  return results;
}

export async function fetchCommentsForTopBottomVideosJob(maxResults?: number) {
  const top = await getPrisma().performanceScore.findMany({
    where: { overperformanceScore: { not: null } },
    orderBy: { overperformanceScore: "desc" },
    take: 10,
    select: { contentItemId: true }
  });
  const bottom = await getPrisma().performanceScore.findMany({
    where: { overperformanceScore: { not: null } },
    orderBy: { overperformanceScore: "asc" },
    take: 10,
    select: { contentItemId: true }
  });

  return fetchCommentsForVideosJob(
    [...new Set([...top, ...bottom].map((score) => score.contentItemId))],
    maxResults
  );
}

export async function fetchCommentsForOverperformingVideosJob(maxResults?: number) {
  const videos = await getPrisma().performanceScore.findMany({
    where: { overperformanceScore: { gte: 1.5 } },
    orderBy: { overperformanceScore: "desc" },
    take: 25,
    select: { contentItemId: true }
  });

  return fetchCommentsForVideosJob(videos.map((score) => score.contentItemId), maxResults);
}

export async function generateWeeklyReportJob() {
  const prisma = getPrisma();
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const candidateScores = await prisma.performanceScore.findMany({
    where: {
      formatType: "long_form",
      overperformanceScore: { not: null },
      contentItem: { audits: { some: {} } }
    },
    orderBy: { overperformanceScore: "desc" },
    take: 50,
    include: {
      contentItem: {
        include: {
          creator: true,
          audits: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });
  const eligibleScores = candidateScores.filter((score) =>
    isReportScoreEligible(parseJsonArray(score.flags))
  );

  if (eligibleScores.length < 2) {
    throw new Error(
      "Generate at least two distinct scored, audited, eligible long-form videos before creating a weekly report."
    );
  }

  const bucketSize = Math.min(5, Math.floor(eligibleScores.length / 2));
  const topScores = eligibleScores.slice(0, bucketSize);
  const topIds = new Set(topScores.map((score) => score.contentItemId));
  const bottomScores = [...eligibleScores]
    .reverse()
    .filter((score) => !topIds.has(score.contentItemId))
    .slice(0, bucketSize);

  const evidenceContentItemIds = [
    ...new Set([...topScores, ...bottomScores].map((score) => score.contentItemId))
  ];
  const evidenceAuditIds = [
    ...new Set(
      [...topScores, ...bottomScores]
        .map((score) => score.contentItem.audits[0]?.id)
        .filter((value): value is string => Boolean(value))
    )
  ];
  const confidenceValues = [...topScores, ...bottomScores]
    .map((score) => score.contentItem.audits[0]?.confidenceScore)
    .filter((value): value is number => typeof value === "number");
  const confidenceScore =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0.5;

  if (evidenceContentItemIds.length === 0 || evidenceAuditIds.length === 0) {
    throw new Error(
      "Generate at least one scored and audited long-form video before creating a weekly report."
    );
  }

  const summary = buildWeeklySummary(topScores, bottomScores);
  const evidenceQuality = weakestEvidenceQuality(
    [...topScores, ...bottomScores].map((score) => score.contentItem.audits[0]?.evidenceQuality)
  );

  return prisma.weeklyReport.create({
    data: {
      weekStart,
      weekEnd,
      title: `Weekly YouTube market report: ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
      summary,
      reportVersion: "weekly_evidence_summary_v2",
      analysisDepth: "standard",
      evidenceQuality,
      evidenceLimitations: toJson([
        "Weekly report uses saved scores and audits only.",
        `Aggregate evidence quality is conservatively labelled ${evidenceQuality}.`,
        "Report cannot claim causation or platform-wide trends.",
        "Videos without saved audits or with serious score flags are excluded."
      ]),
      evidenceContentItemIds: toJson(evidenceContentItemIds),
      evidenceAuditIds: toJson(evidenceAuditIds),
      confidenceScore,
      structuredJson: toJson({
        evidence_content_item_ids: evidenceContentItemIds,
        evidence_audit_ids: evidenceAuditIds,
        top_score_ids: topScores.map((score) => score.id),
        bottom_score_ids: bottomScores.map((score) => score.id)
      }),
      rawInput: toJson({
        top_score_ids: topScores.map((score) => score.id),
        bottom_score_ids: bottomScores.map((score) => score.id)
      })
    }
  });
}

export async function generateCreatorPatternReportsJob() {
  return generateCreatorPatternReports();
}

export async function generateTrendReportJob() {
  return generateCrossCreatorTrendReport();
}

export async function generateContentBriefsJob() {
  return generateContentBriefsFromLatestTrendReport();
}

export async function purgeOrRefreshExpiredYoutubeDataJob() {
  const prisma = getPrisma();
  const now = new Date();
  const expiredAccounts = await prisma.creatorAccount.findMany({
    where: {
      dataExpiresAt: { lt: now },
      creator: { status: "approved" }
    },
    select: { creatorId: true }
  });
  const creatorIds = [...new Set(expiredAccounts.map((account) => account.creatorId))];

  for (const creatorId of creatorIds) {
    await refreshCreatorJob(creatorId);
  }

  const audits = await prisma.contentAudit.findMany({
    select: { evidenceSnapshotIds: true, evidenceCommentIds: true }
  });
  const referencedSnapshotIds = new Set(
    audits.flatMap((audit) => parseJsonArray(audit.evidenceSnapshotIds))
  );
  const referencedCommentIds = new Set(
    audits.flatMap((audit) => parseJsonArray(audit.evidenceCommentIds))
  );
  const expiredSnapshots = await prisma.contentSnapshot.findMany({
    where: { dataExpiresAt: { lt: now } },
    select: { id: true }
  });
  const unreferencedExpiredSnapshotIds = expiredSnapshots
    .map((snapshot) => snapshot.id)
    .filter((id) => !referencedSnapshotIds.has(id));

  if (unreferencedExpiredSnapshotIds.length > 0) {
    await prisma.contentSnapshot.deleteMany({
      where: { id: { in: unreferencedExpiredSnapshotIds } }
    });
  }

  await prisma.contentSnapshot.updateMany({
    where: { id: { in: [...referencedSnapshotIds] }, dataExpiresAt: { lt: now } },
    data: { rawResponse: null }
  });
  await prisma.contentItem.updateMany({
    where: { dataExpiresAt: { lt: now } },
    data: { rawResponse: null }
  });
  await prisma.creatorAccount.updateMany({
    where: { dataExpiresAt: { lt: now } },
    data: { rawResponse: null }
  });
  await prisma.discoveryCandidate.updateMany({
    where: { dataExpiresAt: { lt: now } },
    data: { rawResponse: null }
  });

  const expiredComments = await prisma.videoComment.findMany({
    where: { dataExpiresAt: { lt: now } },
    select: { id: true }
  });
  const unreferencedExpiredCommentIds = expiredComments
    .map((comment) => comment.id)
    .filter((id) => !referencedCommentIds.has(id));

  if (unreferencedExpiredCommentIds.length > 0) {
    await prisma.videoComment.deleteMany({
      where: { id: { in: unreferencedExpiredCommentIds } }
    });
  }

  await prisma.videoComment.updateMany({
    where: { id: { in: [...referencedCommentIds] }, dataExpiresAt: { lt: now } },
    data: { rawResponse: null }
  });

  return {
    refreshedCreators: creatorIds.length,
    deletedSnapshots: unreferencedExpiredSnapshotIds.length
  };
}

async function storeChannelCandidates(queryId: string, items: YoutubeSearchItem[], expiryDate: Date) {
  const prisma = getPrisma();

  for (const item of items) {
    const channelId = item.id.channelId ?? item.snippet.channelId;
    if (!channelId) {
      continue;
    }

    await prisma.discoveryCandidate.upsert({
      where: { queryId_channelId: { queryId, channelId } },
      update: {
        title: item.snippet.title ?? "Unknown channel",
        description: item.snippet.description ?? null,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        rawResponse: toJson(item),
        dataExpiresAt: expiryDate
      },
      create: {
        queryId,
        channelId,
        title: item.snippet.title ?? "Unknown channel",
        description: item.snippet.description ?? null,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        rawResponse: toJson(item),
        dataExpiresAt: expiryDate
      }
    });
  }
}

async function storeVideoCandidates(queryId: string, items: YoutubeSearchItem[], expiryDate: Date) {
  const prisma = getPrisma();

  for (const item of items) {
    const channelId = item.snippet.channelId;
    if (!channelId) {
      continue;
    }

    await prisma.discoveryCandidate.upsert({
      where: { queryId_channelId: { queryId, channelId } },
      update: {
        title: item.snippet.channelTitle ?? item.snippet.title ?? "Unknown channel",
        description: item.snippet.description ?? null,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        sourceVideoId: item.id.videoId,
        evidenceTitle: item.snippet.title ?? null,
        rawResponse: toJson(item),
        dataExpiresAt: expiryDate
      },
      create: {
        queryId,
        channelId,
        title: item.snippet.channelTitle ?? item.snippet.title ?? "Unknown channel",
        description: item.snippet.description ?? null,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
        sourceVideoId: item.id.videoId,
        evidenceTitle: item.snippet.title ?? null,
        rawResponse: toJson(item),
        dataExpiresAt: expiryDate
      }
    });
  }
}

function mapChannelToAccount(channel: YoutubeChannel, expiryDate: Date) {
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads ?? null;

  return {
    title: channel.snippet.title ?? "Unknown channel",
    description: channel.snippet.description ?? null,
    customUrl: channel.snippet.customUrl ?? null,
    handle: channel.snippet.customUrl?.startsWith("@") ? channel.snippet.customUrl : null,
    country: channel.snippet.country ?? null,
    publishedAt: channel.snippet.publishedAt ? new Date(channel.snippet.publishedAt) : null,
    subscriberCount: parseOptionalBigInt(channel.statistics?.subscriberCount),
    viewCount: parseOptionalBigInt(channel.statistics?.viewCount),
    videoCount: channel.statistics?.videoCount ? Number(channel.statistics.videoCount) : null,
    uploadsPlaylistId,
    channelUrl: `https://www.youtube.com/channel/${channel.id}`,
    sourceEtag: channel.etag ?? null,
    rawResponse: toJson(channel),
    fetchedAt: new Date(),
    dataExpiresAt: expiryDate
  };
}

async function storeVideo(
  creatorId: string,
  accountId: string,
  video: YoutubeVideo,
  expiryDate: Date
) {
  const prisma = getPrisma();
  const durationSeconds = parseYoutubeDurationSeconds(video.contentDetails?.duration);
  const contentItem = await prisma.contentItem.upsert({
    where: { youtubeVideoId: video.id },
    update: {
      creatorId,
      accountId,
      title: video.snippet.title ?? "Untitled video",
      description: video.snippet.description ?? null,
      publishedAt: video.snippet.publishedAt ? new Date(video.snippet.publishedAt) : null,
      durationIso: video.contentDetails?.duration ?? null,
      durationSeconds,
      formatType: inferFormatType(durationSeconds),
      url: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnailUrl: bestThumbnail(video.snippet.thumbnails),
      sourceEtag: video.etag ?? null,
      rawResponse: toJson(video),
      fetchedAt: new Date(),
      dataExpiresAt: expiryDate
    },
    create: {
      creatorId,
      accountId,
      youtubeVideoId: video.id,
      title: video.snippet.title ?? "Untitled video",
      description: video.snippet.description ?? null,
      publishedAt: video.snippet.publishedAt ? new Date(video.snippet.publishedAt) : null,
      durationIso: video.contentDetails?.duration ?? null,
      durationSeconds,
      formatType: inferFormatType(durationSeconds),
      url: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnailUrl: bestThumbnail(video.snippet.thumbnails),
      sourceEtag: video.etag ?? null,
      rawResponse: toJson(video),
      fetchedAt: new Date(),
      dataExpiresAt: expiryDate
    }
  });

  await prisma.contentSnapshot.create({
    data: {
      contentItemId: contentItem.id,
      viewCount: parseOptionalBigInt(video.statistics?.viewCount),
      likeCount: parseOptionalBigInt(video.statistics?.likeCount),
      commentCount: parseOptionalBigInt(video.statistics?.commentCount),
      favoriteCount: parseOptionalBigInt(video.statistics?.favoriteCount),
      sourceEtag: video.etag ?? null,
      rawResponse: toJson(video.statistics ?? {}),
      dataExpiresAt: expiryDate
    }
  });
}

async function storeComment(contentItemId: string, item: YoutubeCommentThread) {
  const snippet = item.snippet?.topLevelComment?.snippet;
  const youtubeCommentId = item.snippet?.topLevelComment?.id ?? item.id;
  const text = snippet?.textOriginal ?? snippet?.textDisplay;

  if (!youtubeCommentId || !text || !snippet) {
    return false;
  }

  const dataExpiresAt = await getDataExpiryDate();

  await getPrisma().videoComment.upsert({
    where: { youtubeCommentId },
    update: {
      authorDisplayName: snippet.authorDisplayName ?? null,
      text,
      likeCount: snippet.likeCount ?? null,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
      capturedAt: new Date(),
      rawResponse: toJson(item),
      dataExpiresAt
    },
    create: {
      contentItemId,
      youtubeCommentId,
      authorDisplayName: snippet.authorDisplayName ?? null,
      text,
      likeCount: snippet.likeCount ?? null,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
      rawResponse: toJson(item),
      dataExpiresAt
    }
  });

  return true;
}

export function classifyCommentError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown comment fetch error";

  if (/commentsDisabled/i.test(message)) {
    return "commentsDisabled";
  }

  if (/videoNotFound/i.test(message)) {
    return "videoNotFound";
  }

  if (/forbidden|403/i.test(message)) {
    return "forbidden";
  }

  return message;
}

function buildWeeklySummary(topScores: ReportScore[], bottomScores: ReportScore[]) {
  const lines = [
    "Evidence-backed weekly summary.",
    "",
    "Top long-form patterns:",
    ...topScores.map((score, index) => {
      const audit = score.contentItem.audits[0];
      if (!audit) {
        throw new Error("Weekly reports require saved audits for every evidence video.");
      }
      return `${index + 1}. ${score.contentItem.title} by ${score.contentItem.creator.name}: ${score.overperformanceScore?.toFixed(2) ?? "unknown"}x creator baseline. Evidence content item ${score.contentItemId}, audit ${audit.id}. ${audit.suggestedAdaptationForUser}`;
    }),
    "",
    "Bottom long-form patterns:",
    ...bottomScores.map((score, index) => {
      const audit = score.contentItem.audits[0];
      if (!audit) {
        throw new Error("Weekly reports require saved audits for every evidence video.");
      }
      return `${index + 1}. ${score.contentItem.title} by ${score.contentItem.creator.name}: ${score.overperformanceScore?.toFixed(2) ?? "unknown"}x creator baseline. Evidence content item ${score.contentItemId}, audit ${audit.id}. ${audit.risksOrCaveats}`;
    }),
    "",
    "Caveat: this report uses stored YouTube API metadata and saved audits only. It does not claim algorithmic causation."
  ];

  return lines.join("\n");
}

function isReportScoreEligible(flags: string[]) {
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

function weakestEvidenceQuality(values: Array<string | null | undefined>) {
  const order = [
    "metadata_only",
    "metadata_plus_thumbnail",
    "metadata_plus_comments",
    "metadata_plus_comments_thumbnail",
    "transcript_or_manual_notes",
    "mixed"
  ];
  const normalized = values.filter((value): value is string => Boolean(value));

  return normalized.sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] ?? "metadata_only";
}

type ReportScore = Awaited<ReturnType<typeof getPrisma>>["performanceScore"] extends never
  ? never
  : {
      id: string;
      contentItemId: string;
      overperformanceScore: number | null;
      flags: string;
      contentItem: {
        id: string;
        title: string;
        creator: { name: string };
        audits: {
          id: string;
          evidenceQuality: string;
          suggestedAdaptationForUser: string;
          risksOrCaveats: string;
        }[];
      };
    };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));
}

function nullableText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
