import { describe, expect, it } from "vitest";

import { deriveTaskStatus } from "@/domain/workflow";
import type { AnnotationStatus } from "@/generated/prisma/enums";

function statuses(...values: AnnotationStatus[]) {
  return values.map((status) => ({ status }));
}

describe("deriveTaskStatus", () => {
  it("returns IN_PROGRESS when there are no non-draft annotations", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("DRAFT", "DRAFT"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("IN_PROGRESS");
  });

  it("returns SUBMITTED while only one required annotation is submitted", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("SUBMITTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("SUBMITTED");
  });

  it("returns IN_REVIEW when required submissions are present", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("SUBMITTED", "SUBMITTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("IN_REVIEW");
    expect(
      deriveTaskStatus({
        annotations: statuses("ACCEPTED", "SUBMITTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("IN_REVIEW");
    expect(
      deriveTaskStatus({
        annotations: statuses("ACCEPTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("IN_REVIEW");
  });

  it("returns ACCEPTED when all required annotations are accepted", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("ACCEPTED", "ACCEPTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("ACCEPTED");
  });

  it("returns REJECTED when exhausted annotations are final but short of acceptance", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("ACCEPTED", "REJECTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("REJECTED");
    expect(
      deriveTaskStatus({
        annotations: statuses("REJECTED", "REJECTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("REJECTED");
  });

  it("returns the correction and dispute states before final counts", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("RETURNED_FOR_CORRECTION", "SUBMITTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("RETURNED_FOR_CORRECTION");
    expect(
      deriveTaskStatus({
        annotations: statuses("DISPUTED", "SUBMITTED"),
        requiredAnnotations: 2,
        hasAdjudication: false,
      }),
    ).toBe("DISPUTED");
  });

  it("returns RESOLVED when an adjudication exists", () => {
    expect(
      deriveTaskStatus({
        annotations: statuses("SUBMITTED", "DISPUTED"),
        requiredAnnotations: 2,
        hasAdjudication: true,
      }),
    ).toBe("RESOLVED");
  });
});
