import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
process.env.DATABASE_URL ??= "file:./dev.db";

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const settings = [
  ["YOUTUBE_DAILY_QUOTA_LIMIT", "10000"],
  ["YOUTUBE_MAX_DISCOVERY_PAGES", "1"],
  ["YOUTUBE_DEFAULT_MAX_RESULTS", "10"],
  ["YOUTUBE_DATA_RETENTION_DAYS", "30"],
  ["TOO_NEW_VIDEO_DAYS", "2"],
  ["MIN_CREATOR_BASELINE_VIDEOS", "3"]
];

async function main() {
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
