import { getPrisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const prisma = getPrisma();
  const [approvedCreators, pendingCandidates, contentItems, audits, scores] =
    await Promise.all([
      prisma.creator.count({ where: { status: "approved" } }),
      prisma.discoveryCandidate.count({ where: { status: "pending" } }),
      prisma.contentItem.count(),
      prisma.contentAudit.count(),
      prisma.performanceScore.findMany({
        where: {
          overperformanceScore: { not: null },
          formatType: "long_form"
        },
        orderBy: { overperformanceScore: "desc" },
        take: 5,
        include: {
          contentItem: {
            include: {
              creator: true,
              audits: { orderBy: { createdAt: "desc" }, take: 1 }
            }
          }
        }
      })
    ]);

  return {
    approvedCreators,
    pendingCandidates,
    contentItems,
    audits,
    topVideos: scores.map((score) => ({
      id: score.contentItem.id,
      title: score.contentItem.title,
      creatorName: score.contentItem.creator.name,
      overperformanceScore: score.overperformanceScore,
      confidenceScore: score.contentItem.audits[0]?.confidenceScore ?? null
    }))
  };
}
