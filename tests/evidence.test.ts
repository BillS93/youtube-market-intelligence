import { describe, expect, it } from "vitest";

import {
  assignEvidenceQuality,
  evidenceLimitationsFor,
  hasManualOrTranscriptEvidence
} from "@/lib/evidence";
import { canDeepAudit } from "@/lib/audit";

describe("evidence quality", () => {
  it("assigns metadata_only when only title, description, metrics, and URLs are available", () => {
    expect(
      assignEvidenceQuality({
        hasComments: false,
        hasThumbnailAnalysis: false,
        hasManualOrTranscript: false
      })
    ).toBe("metadata_only");
  });

  it("assigns metadata_plus_comments when comments are stored", () => {
    expect(
      assignEvidenceQuality({
        hasComments: true,
        hasThumbnailAnalysis: false,
        hasManualOrTranscript: false
      })
    ).toBe("metadata_plus_comments");
  });

  it("treats manual notes or transcript as stronger evidence", () => {
    expect(
      hasManualOrTranscriptEvidence([
        {
          openingHookNotes: "",
          transcriptOrExcerpt: "Round 2 gas tank explanation excerpt"
        }
      ])
    ).toBe(true);
    expect(
      assignEvidenceQuality({
        hasComments: false,
        hasThumbnailAnalysis: false,
        hasManualOrTranscript: true
      })
    ).toBe("transcript_or_manual_notes");
  });

  it("does not treat generic notes as direct video evidence", () => {
    expect(
      hasManualOrTranscriptEvidence([
        {
          watchedByUser: false,
          userNotes: "This seems relevant."
        }
      ])
    ).toBe(false);
  });

  it("requires watched confirmation for direct observation fields without transcript", () => {
    expect(
      hasManualOrTranscriptEvidence([
        {
          watchedByUser: false,
          openingHookNotes: "Opens with a fighter problem."
        }
      ])
    ).toBe(false);
    expect(
      hasManualOrTranscriptEvidence([
        {
          watchedByUser: true,
          openingHookNotes: "Opens with a fighter problem."
        }
      ])
    ).toBe(true);
  });

  it("lists limitations for metadata-only evidence", () => {
    const limitations = evidenceLimitationsFor({
      evidenceQuality: "metadata_only",
      hasComments: false,
      hasThumbnailUrl: true,
      hasThumbnailAnalysis: false,
      hasManualOrTranscript: false
    });

    expect(limitations.join(" ")).toContain("Metadata-only audit");
    expect(limitations.join(" ")).toContain("No stored comments");
  });

  it("requires richer evidence for deep audits", () => {
    expect(canDeepAudit({ analysisDepth: "deep", evidenceQuality: "metadata_only" })).toBe(false);
    expect(canDeepAudit({ analysisDepth: "deep", evidenceQuality: "transcript_or_manual_notes" })).toBe(true);
  });
});
