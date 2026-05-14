"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  approveCandidateJob,
  auditSelectedVideosJob,
  calculateScoresJob,
  generateWeeklyReportJob,
  purgeOrRefreshExpiredYoutubeDataJob,
  refreshAllApprovedCreatorsJob,
  refreshCreatorJob,
  rejectCandidateJob,
  runDiscoveryJob
} from "@/lib/jobs";
import { updateSetting } from "@/lib/settings";

export async function runDiscovery(formData: FormData) {
  await runDiscoveryJob({
    query: stringField(formData, "query"),
    layer: stringField(formData, "layer", "unknown"),
    maxResults: numberField(formData, "maxResults", 10),
    maxPages: numberField(formData, "maxPages", 1),
    includeVideoSearch: formData.get("includeVideoSearch") === "on"
  });
  revalidateEverywhere();
  redirect("/candidates");
}

export async function approveCandidate(formData: FormData) {
  await approveCandidateJob(stringField(formData, "candidateId"));
  revalidateEverywhere();
  redirect("/watchlist");
}

export async function rejectCandidate(formData: FormData) {
  await rejectCandidateJob(stringField(formData, "candidateId"));
  revalidateEverywhere();
  redirect("/candidates");
}

export async function refreshCreator(formData: FormData) {
  await refreshCreatorJob(stringField(formData, "creatorId"));
  revalidateEverywhere();
  redirect(stringField(formData, "redirectTo", "/watchlist"));
}

export async function refreshAllApprovedCreators() {
  await refreshAllApprovedCreatorsJob();
  revalidateEverywhere();
  redirect("/watchlist");
}

export async function calculateScores() {
  await calculateScoresJob();
  revalidateEverywhere();
  redirect("/videos");
}

export async function auditSelectedVideos(formData: FormData) {
  const contentItemIds = formData.getAll("contentItemId").map(String).filter(Boolean);
  await auditSelectedVideosJob(contentItemIds);
  revalidateEverywhere();
  redirect("/videos");
}

export async function generateWeeklyReport() {
  await generateWeeklyReportJob();
  revalidateEverywhere();
  redirect("/report");
}

export async function purgeOrRefreshExpiredYoutubeData() {
  await purgeOrRefreshExpiredYoutubeDataJob();
  revalidateEverywhere();
  redirect("/settings");
}

export async function saveSettings(formData: FormData) {
  const editableKeys = [
    "YOUTUBE_DAILY_QUOTA_LIMIT",
    "YOUTUBE_MAX_DISCOVERY_PAGES",
    "YOUTUBE_DEFAULT_MAX_RESULTS",
    "YOUTUBE_DATA_RETENTION_DAYS",
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
  redirect("/settings");
}

function stringField(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
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
