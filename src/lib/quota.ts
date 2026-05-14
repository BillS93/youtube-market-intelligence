import { getPrisma } from "@/lib/prisma";
import { getNumberSetting } from "@/lib/settings";

export async function getYoutubeQuotaStatus(estimatedCost = 0) {
  const limit = await getNumberSetting("YOUTUBE_DAILY_QUOTA_LIMIT");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const used = await getPrisma().apiRunLog.aggregate({
    _sum: { quotaCost: true },
    where: {
      service: "youtube",
      startedAt: { gte: startOfDay },
      status: { in: ["success", "error"] }
    }
  });

  const usedToday = used._sum.quotaCost ?? 0;

  return {
    limit,
    usedToday,
    estimatedCost,
    remainingAfterRun: limit - usedToday - estimatedCost,
    allowed: usedToday + estimatedCost <= limit
  };
}

export async function assertYoutubeQuotaAvailable(estimatedCost: number) {
  const status = await getYoutubeQuotaStatus(estimatedCost);

  if (!status.allowed) {
    throw new Error(
      `Estimated YouTube quota cost ${estimatedCost} exceeds today's remaining quota (${status.limit - status.usedToday}).`
    );
  }

  return status;
}

export function estimateDiscoveryQuotaCost(includeVideoSearch: boolean) {
  return includeVideoSearch ? 200 : 100;
}

export function estimateRefreshQuotaCost(maxPages: number, videoCount = 50) {
  const playlistCost = Math.max(1, maxPages);
  const videoBatches = Math.max(1, Math.ceil(videoCount / 50));
  return 1 + playlistCost + videoBatches;
}
