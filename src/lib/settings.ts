import { getPrisma } from "@/lib/prisma";

const DEFAULT_SETTINGS: Record<string, string> = {
  YOUTUBE_DAILY_QUOTA_LIMIT: "10000",
  YOUTUBE_MAX_DISCOVERY_PAGES: "1",
  YOUTUBE_DEFAULT_MAX_RESULTS: "10",
  YOUTUBE_COMMENT_MAX_RESULTS: "25",
  YOUTUBE_DATA_RETENTION_DAYS: "30",
  TOO_NEW_VIDEO_DAYS: "2",
  MIN_CREATOR_BASELINE_VIDEOS: "3"
};

export async function getSetting(key: string) {
  const setting = await getPrisma().appSetting.findUnique({ where: { key } });
  return setting?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function getNumberSetting(key: string) {
  const rawValue = await getSetting(key);
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : Number(DEFAULT_SETTINGS[key] ?? 0);
}

export async function updateSetting(key: string, value: string) {
  return getPrisma().appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

export async function listSettings() {
  const prisma = getPrisma();
  const existing = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  const existingKeys = new Set(existing.map((setting) => setting.key));
  const missing = Object.entries(DEFAULT_SETTINGS)
    .filter(([key]) => !existingKeys.has(key))
    .map(([key, value]) => ({ key, value, updatedAt: new Date(0) }));

  return [...existing, ...missing].sort((left, right) => left.key.localeCompare(right.key));
}

export async function getDataExpiryDate(from = new Date()) {
  const days = await getNumberSetting("YOUTUBE_DATA_RETENTION_DAYS");
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
