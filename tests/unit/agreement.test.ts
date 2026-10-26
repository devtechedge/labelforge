import { describe, expect, it } from "vitest";

import {
  averageJaccard,
  cohensKappa,
  metricForField,
  spanOverlap,
} from "@/domain/agreement";
import type { SchemaField, SpanAnswer } from "@/domain/schema";

describe("Cohen's kappa", () => {
  it("returns 1 for perfect agreement with label variation", () => {
    const labels = ["a", "a", "b", "b", "c", "c", "a", "b"];
    const result = cohensKappa(labels, [...labels]);
    expect(result.state).toBe("computed");
    if (result.state === "computed" && result.metric === "cohens_kappa") {
      expect(result.value).toBeCloseTo(1, 6);
      expect(result.observedAgreement.numerator).toBe(8);
      expect(result.observedAgreement.denominator).toBe(8);
      expect(result.expectedAgreement).toBeGreaterThan(0);
    }
  });

  it("computes a known mixed agreement value", () => {
    const a = ["a", "a", "b", "b", "c", "c", "a", "b"];
    const b = ["a", "a", "b", "b", "c", "c", "b", "b"];
    const result = cohensKappa(a, b);
    expect(result.state).toBe("computed");
    if (result.state === "computed" && result.metric === "cohens_kappa") {
      expect(result.value).toBeCloseTo(0.807, 2);
      expect(result.observedAgreement).toEqual({ numerator: 7, denominator: 8 });
    }
  });

  it("reports insufficient samples below five pairs", () => {
    const result = cohensKappa(["a", "b", "a", "b"], ["a", "a", "a", "b"]);
    expect(result.state).toBe("insufficient");
  });

  it("reports insufficient when chance agreement is undefined", () => {
    const result = cohensKappa(
      ["a", "a", "a", "a", "a"],
      ["a", "a", "a", "a", "a"],
    );
    expect(result.state).toBe("insufficient");
  });
});

describe("average Jaccard", () => {
  it("computes set agreement including empty sets", () => {
    const result = averageJaccard(
      [["a"], ["a", "b"], [], ["c"], ["a", "b", "c"]],
      [["a"], ["a"], [], ["c", "d"], ["a", "b"]],
    );
    expect(result.state).toBe("computed");
    if (result.state === "computed" && result.metric === "average_jaccard") {
      expect(result.sampleSize).toBe(5);
      expect(result.value).toBeGreaterThan(0);
      expect(result.value).toBeLessThan(1);
    }
  });

  it("requires five pairs", () => {
    expect(averageJaccard([["a"]], [["a"]]).state).toBe("insufficient");
  });
});

describe("span overlap", () => {
  const span = (start: number, end: number, label = "x"): SpanAnswer => ({
    start,
    end,
    label,
    quote: "text",
  });

  it("scores identical spans as full overlap", () => {
    const pairs = Array.from({ length: 5 }, () => [span(0, 4)]);
    const result = spanOverlap(pairs, pairs);
    expect(result.state).toBe("computed");
    if (result.state === "computed" && result.metric === "span_overlap") {
      expect(result.value).toBe(1);
      expect(result.matchedUnits).toBe(5);
    }
  });

  it("requires label equality and a 0.5 IoU threshold", () => {
    const a = Array.from({ length: 5 }, () => [span(0, 4, "x")]);
    const b = Array.from({ length: 5 }, () => [span(0, 4, "y")]);
    const result = spanOverlap(a, b);
    expect(result.state).toBe("computed");
    if (result.state === "computed" && result.metric === "span_overlap") {
      expect(result.value).toBe(0);
    }
  });

  it("returns insufficient below five pairs", () => {
    expect(spanOverlap([[span(0, 2)]], [[span(0, 2)]]).state).toBe("insufficient");
  });
});

describe("metric dispatch", () => {
  it("does not invent a metric for text fields", () => {
    const field: SchemaField = {
      key: "note",
      label: "Note",
      type: "text",
      required: false,
      maxLength: 100,
    };
    const result = metricForField(field, []);
    expect(result.state).toBe("unsupported");
  });
});
