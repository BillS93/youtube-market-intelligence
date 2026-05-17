"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  approveCandidateJob,
  auditSelectedVideosWithDepthJob,
  calculateScoresJob,
  fetchCommentsForOverperformingVideosJob,
  fetchCommentsForTopBottomVideosJob,
  fetchCommentsForVideosJob,
  generateContentBriefsJob,
  generateCreatorPatternReportsJob,
  generateTrendReportJob,
  generateWeeklyReportJob,
  purgeOrRefreshExpiredYoutubeDataJob,
  refreshAllApprovedCreatorsJob,
  refreshCreatorJob,
  rejectCandidateJob,
  runDiscoveryJob,
  saveManualEvidenceNotesJob
} from "@/lib/jobs";
import type { AnalysisDepth } from "@/lib/evidence";
import { errorMessage, feedbackUrl, type Feedback } from "@/lib/feedback";
import { updateSetting } from "@/lib/settings";

export async function runDiscovery(formData: FormData) {
  const query = stringField(formData, "query");
  const includeVideoSearch = formData.get("includeVideoSearch") === "on";

  try {
    const result = await runDiscoveryJob({
      query,
      layer: stringField(formData, "layer", "unknown"),
      maxResults: numberField(formData, "maxResults", 10),
      maxPages: numberField(formData, "maxPages", 1),
      includeVideoSearch
    });
    revalidateEverywhere();
    redirectWithFeedback("/candidates", {
      status: "success",
      message: "Discovery completed.",
      detail: `Query "${result.query}" created ${result.candidates?.length ?? 0} candidate records.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/discovery", {
      status: "error",
      message: "Discovery did not run.",
      detail: errorMessage(error)
    });
  }
}

export async function approveCandidate(formData: FormData) {
  try {
    const creator = await approveCandidateJob(stringField(formData, "candidateId"));
    revalidateEverywhere();
    redirectWithFeedback("/watchlist", {
      status: "success",
      message: "Candidate approved.",
      detail: `${creator.name} is now in the watchlist. Refresh the creator next to fetch channel and video evidence.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/candidates", {
      status: "error",
      message: "Candidate was not approved.",
      detail: errorMessage(error)
    });
  }
}

export async function rejectCandidate(formData: FormData) {
  try {
    await rejectCandidateJob(stringField(formData, "candidateId"));
    revalidateEverywhere();
    redirectWithFeedback("/candidates", {
      status: "success",
      message: "Candidate rejected.",
      detail: "It will not enter the watchlist unless approved later from a new discovery result."
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/candidates", {
      status: "error",
      message: "Candidate was not rejected.",
      detail: errorMessage(error)
    });
  }
}

export async function refreshCreator(formData: FormData) {
  const redirectTo = safeRedirectPath(stringField(formData, "redirectTo", "/watchlist"));

  try {
    const creator = await refreshCreatorJob(stringField(formData, "creatorId"));
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "success",
      message: "Creator refresh completed.",
      detail: `${creator?.contentItems.length ?? 0} tracked videos are now stored for ${creator?.name ?? "this creator"}. See recent API logs below.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "Creator refresh failed.",
      detail: errorMessage(error)
    });
  }
}

export async function refreshAllApprovedCreators() {
  try {
    const creators = await refreshAllApprovedCreatorsJob();
    const trackedVideos = creators.reduce(
      (sum, creator) => sum + (creator?.contentItems.length ?? 0),
      0
    );
    revalidateEverywhere();
    redirectWithFeedback("/watchlist", {
      status: "success",
      message: "Approved creators refreshed.",
      detail: `${creators.length} creator records were refreshed. ${trackedVideos} tracked videos are stored.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/watchlist", {
      status: "error",
      message: "Refresh all failed.",
      detail: errorMessage(error)
    });
  }
}

export async function calculateScores() {
  try {
    const scores = await calculateScoresJob();
    const scored = scores.filter((score) => score.overperformanceScore !== null).length;
    const skipped = scores.length - scored;
    revalidateEverywhere();
    redirectWithFeedback("/videos", {
      status: "success",
      message: "Score calculation completed.",
      detail: `${scored} videos received an overperformance score. ${skipped} were skipped for overperformance because of missing metrics, too little baseline data, or unknown format.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/videos", {
      status: "error",
      message: "Score calculation failed.",
      detail: errorMessage(error)
    });
  }
}

export async function auditSelectedVideos(formData: FormData) {
  const contentItemIds = formData.getAll("contentItemId").map(String).filter(Boolean);
  const analysisDepth = analysisDepthField(formData);
  const redirectTo = safeRedirectPath(stringField(formData, "redirectTo", "/videos"));

  if (!process.env.OPENAI_API_KEY) {
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "AI audit refused to run.",
      detail: "OPENAI_API_KEY is missing. Add it to .env.local and restart the dev server before running AI audits."
    });
  }

  if (contentItemIds.length === 0) {
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "No videos selected for audit.",
      detail: "Select at least one video that has a stored evidence snapshot."
    });
  }

  try {
    const audits = await auditSelectedVideosWithDepthJob(contentItemIds, analysisDepth);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "success",
      message: "AI audit completed.",
      detail: `${audits.length} ${analysisDepth} audit records were saved with evidence packs and stored evidence IDs.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "AI audit failed.",
      detail: errorMessage(error)
    });
  }
}

export async function fetchCommentsForSelectedVideos(formData: FormData) {
  const contentItemIds = formData.getAll("contentItemId").map(String).filter(Boolean);
  const redirectTo = safeRedirectPath(stringField(formData, "redirectTo", "/videos"));

  if (contentItemIds.length === 0) {
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "No videos selected for comments.",
      detail: "Select at least one video before fetching public comments."
    });
  }

  try {
    const results = await fetchCommentsForVideosJob(
      contentItemIds,
      numberField(formData, "maxResults", 25)
    );
    const successes = results.filter((result) => result.status === "success").length;
    const failures = results.length - successes;
    const stored = results.reduce((sum, result) => sum + result.storedComments, 0);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: failures > 0 && successes === 0 ? "error" : "success",
      message: "Comment fetch completed.",
      detail: `${stored} comments stored across ${successes} videos. ${failures} videos failed or had unavailable comments.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "Comment fetch failed.",
      detail: errorMessage(error)
    });
  }
}

export async function fetchCommentsForTopBottomVideos(formData: FormData) {
  try {
    const results = await fetchCommentsForTopBottomVideosJob(
      numberField(formData, "maxResults", 25)
    );
    const stored = results.reduce((sum, result) => sum + result.storedComments, 0);
    revalidateEverywhere();
    redirectWithFeedback("/compare", {
      status: "success",
      message: "Top/bottom comment fetch completed.",
      detail: `${stored} comments were stored. Individual video failures were skipped.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/compare", {
      status: "error",
      message: "Top/bottom comment fetch failed.",
      detail: errorMessage(error)
    });
  }
}

export async function fetchCommentsForOverperformingVideos(formData: FormData) {
  try {
    const results = await fetchCommentsForOverperformingVideosJob(
      numberField(formData, "maxResults", 25)
    );
    const stored = results.reduce((sum, result) => sum + result.storedComments, 0);
    revalidateEverywhere();
    redirectWithFeedback("/videos", {
      status: "success",
      message: "Overperformer comment fetch completed.",
      detail: `${stored} comments were stored. Individual video failures were skipped.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/videos", {
      status: "error",
      message: "Overperformer comment fetch failed.",
      detail: errorMessage(error)
    });
  }
}

export async function saveManualEvidenceNotes(formData: FormData) {
  const contentItemId = stringField(formData, "contentItemId");
  const redirectTo = safeRedirectPath(stringField(formData, "redirectTo", `/videos/${contentItemId}`));

  try {
    await saveManualEvidenceNotesJob({
      contentItemId,
      watchedByUser: formData.get("watchedByUser") === "on",
      openingHookNotes: stringField(formData, "openingHookNotes"),
      videoStructureNotes: stringField(formData, "videoStructureNotes"),
      coachingDeliveryNotes: stringField(formData, "coachingDeliveryNotes"),
      exerciseOrTrainingContentNotes: stringField(formData, "exerciseOrTrainingContentNotes"),
      scienceOrClaimsNotes: stringField(formData, "scienceOrClaimsNotes"),
      ctaOrOfferNotes: stringField(formData, "ctaOrOfferNotes"),
      transcriptOrExcerpt: stringField(formData, "transcriptOrExcerpt"),
      userNotes: stringField(formData, "userNotes")
    });
    revalidateEverywhere();
    revalidatePath(`/videos/${contentItemId}`);
    redirectWithFeedback(redirectTo, {
      status: "success",
      message: "Manual evidence saved.",
      detail: "Deep audits can now use these notes as stronger evidence."
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback(redirectTo, {
      status: "error",
      message: "Manual evidence was not saved.",
      detail: errorMessage(error)
    });
  }
}

export async function generateWeeklyReport() {
  try {
    const report = await generateWeeklyReportJob();
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "success",
      message: "Weekly report generated.",
      detail: `${report.title} uses stored scored videos and saved audits only.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "error",
      message: "Weekly report was not generated.",
      detail: errorMessage(error)
    });
  }
}

export async function generateCreatorPatternReports() {
  try {
    const reports = await generateCreatorPatternReportsJob();
    revalidateEverywhere();
    redirectWithFeedback("/compare", {
      status: reports.length > 0 ? "success" : "info",
      message: reports.length > 0 ? "Creator pattern reports generated." : "No creator pattern reports generated.",
      detail:
        reports.length > 0
          ? `${reports.length} creator-format pattern reports were saved from scored and audited videos.`
          : "Creator patterns require at least 5 comparable scored and audited videos for a creator and format type."
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/compare", {
      status: "error",
      message: "Creator pattern reports failed.",
      detail: errorMessage(error)
    });
  }
}

export async function generateTrendReport() {
  try {
    const report = await generateTrendReportJob();
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "success",
      message: "Cross-creator trend report generated.",
      detail: `${report.videosAnalyzedCount} audited videos across ${report.creatorsAnalyzedCount} creators were analyzed.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "error",
      message: "Trend report failed.",
      detail: errorMessage(error)
    });
  }
}

export async function generateContentBriefs() {
  try {
    const briefs = await generateContentBriefsJob();
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "success",
      message: "Content briefs generated.",
      detail: `${briefs.length} practical video briefs were created from the latest trend report.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/report", {
      status: "error",
      message: "Content briefs were not generated.",
      detail: errorMessage(error)
    });
  }
}

export async function purgeOrRefreshExpiredYoutubeData() {
  try {
    const result = await purgeOrRefreshExpiredYoutubeDataJob();
    revalidateEverywhere();
    redirectWithFeedback("/settings", {
      status: "success",
      message: "Refresh/purge completed.",
      detail: `${result.refreshedCreators} expired approved creators refreshed. ${result.deletedSnapshots} unreferenced expired snapshots deleted.`
    });
  } catch (error) {
    rethrowNextRedirect(error);
    revalidateEverywhere();
    redirectWithFeedback("/settings", {
      status: "error",
      message: "Refresh/purge failed.",
      detail: errorMessage(error)
    });
  }
}

export async function saveSettings(formData: FormData) {
  const editableKeys = [
    "YOUTUBE_DAILY_QUOTA_LIMIT",
    "YOUTUBE_MAX_DISCOVERY_PAGES",
    "YOUTUBE_DEFAULT_MAX_RESULTS",
    "YOUTUBE_DATA_RETENTION_DAYS",
    "YOUTUBE_COMMENT_MAX_RESULTS",
    "TOO_NEW_VIDEO_DAYS",
    "MIN_CREATOR_BASELINE_VIDEOS"
  ];

  for (const key of editableKeys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) {
      await updateSetting(key, value.trim());
    }
  }

  revalidateEverywhere();
  redirectWithFeedback("/settings", {
    status: "success",
    message: "Settings saved.",
    detail: "Local guardrails were updated."
  });
}

function stringField(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function analysisDepthField(formData: FormData): AnalysisDepth {
  const value = stringField(formData, "analysisDepth", "quick");
  return value === "standard" || value === "deep" ? value : "quick";
}

function revalidateEverywhere() {
  for (const path of [
    "/",
    "/discovery",
    "/candidates",
    "/watchlist",
    "/videos",
    "/compare",
    "/report",
    "/settings"
  ]) {
    revalidatePath(path);
  }
}

function redirectWithFeedback(path: string, feedback: Feedback): never {
  redirect(feedbackUrl(path, feedback));
}

function safeRedirectPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/watchlist";
}

function rethrowNextRedirect(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}
