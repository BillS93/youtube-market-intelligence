import { getPrisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const prisma = getPrisma();
  const [
    approvedCreators,
    pendingCandidates,
    contentItems,
    scoredVideos,
    audits,
    comments,
    deepAudits,
    lowConfidenceAudits,
    scores,
    latestBriefs
  ] =
    await Promise.all([
      prisma.creator.count({ where: { status: "approved" } }),
      prisma.discoveryCandidate.count({ where: { status: "pending" } }),
      prisma.contentItem.count(),
      prisma.performanceScore.count({ where: { overperformanceScore: { not: null } } }),
      prisma.contentAudit.count(),
      prisma.videoComment.count(),
      prisma.contentAudit.count({ where: { analysisDepth: "deep" } }),
      prisma.contentAudit.count({ where: { confidenceScore: { lt: 0.55 } } }),
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
      }),
      prisma.contentBrief.findMany({
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

  return {
    approvedCreators,
    pendingCandidates,
    contentItems,
    scoredVideos,
    audits,
    comments,
    deepAudits,
    lowConfidenceAudits,
    latestBriefs,
    topVideos: scores.map((score) => ({
      id: score.contentItem.id,
      title: score.contentItem.title,
      creatorName: score.contentItem.creator.name,
      overperformanceScore: score.overperformanceScore,
      confidenceScore: score.contentItem.audits[0]?.confidenceScore ?? null
    }))
  };
}
