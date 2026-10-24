import type { SchemaField, SpanAnswer } from "@/domain/schema";

export type MetricLimitation = {
  code: string;
  message: string;
};

export type AgreementMetric =
  | {
      state: "computed";
      metric: "cohens_kappa";
      value: number;
      observedAgreement: { numerator: number; denominator: number };
      expectedAgreement: number;
      sampleSize: number;
      limitations: MetricLimitation[];
    }
  | {
      state: "computed";
      metric: "average_jaccard";
      value: number;
      totalScore: number;
      pairCount: number;
      sampleSize: number;
      limitations: MetricLimitation[];
    }
  | {
      state: "computed";
      metric: "span_overlap";
      value: number;
      matchedUnits: number;
      possibleUnits: number;
      sampleSize: number;
      limitations: MetricLimitation[];
    }
  | {
      state: "insufficient";
      reason: string;
      sampleSize: number;
      minimumSample: number;
      limitations: MetricLimitation[];
    }
  | {
      state: "unsupported";
      reason: string;
      sampleSize: number;
      limitations: MetricLimitation[];
    };

export const MIN_PAIRS = 5;

const LIMITATION: MetricLimitation = {
  code: "small_sample",
  message:
    "Agreement on a small sample is unstable and should not be read as a population estimate.",
};

function insufficient(sampleSize: number, reason: string): AgreementMetric {
  return {
    state: "insufficient",
    reason,
    sampleSize,
    minimumSample: MIN_PAIRS,
    limitations: [LIMITATION],
  };
}

export function cohensKappa(
  labelsA: string[],
  labelsB: string[],
): AgreementMetric {
  if (labelsA.length !== labelsB.length) {
    throw new Error("Paired label arrays must have equal length.");
  }
  const pairs = labelsA.length;
  if (pairs < MIN_PAIRS) {
    return insufficient(pairs, "Insufficient comparable annotations.");
  }

  let agreements = 0;
  const pooled = new Map<string, number>();
  for (let index = 0; index < pairs; index += 1) {
    const a = labelsA[index];
    const b = labelsB[index];
    if (a === b) agreements += 1;
    if (a !== undefined) pooled.set(a, (pooled.get(a) ?? 0) + 1);
    if (b !== undefined) pooled.set(b, (pooled.get(b) ?? 0) + 1);
  }

  const observed = agreements / pairs;
  let expected = 0;
  for (const count of pooled.values()) {
    const proportion = count / (pairs * 2);
    expected += proportion * proportion;
  }

  if (expected >= 0.999) {
    return insufficient(
      pairs,
      "Every annotator used one label, so chance agreement cannot be separated from observed agreement.",
    );
  }

  const value = (observed - expected) / (1 - expected);
  const limitations: MetricLimitation[] = [LIMITATION];
  if (value < 0) {
    limitations.push({
      code: "below_chance",
      message: "This value is below chance agreement for this label distribution.",
    });
  }

  return {
    state: "computed",
    metric: "cohens_kappa",
    value,
    observedAgreement: { numerator: agreements, denominator: pairs },
    expectedAgreement: expected,
    sampleSize: pairs,
    limitations,
  };
}

export function averageJaccard(
  setsA: string[][],
  setsB: string[][],
): AgreementMetric {
  if (setsA.length !== setsB.length) {
    throw new Error("Paired set arrays must have equal length.");
  }
  const pairs = setsA.length;
  if (pairs < MIN_PAIRS) {
    return insufficient(pairs, "Insufficient comparable annotations.");
  }

  let total = 0;
  for (let index = 0; index < pairs; index += 1) {
    const a = new Set(setsA[index] ?? []);
    const b = new Set(setsB[index] ?? []);
    const union = new Set([...a, ...b]);
    if (union.size === 0) {
      total += 1;
      continue;
    }
    let intersection = 0;
    for (const value of a) if (b.has(value)) intersection += 1;
    total += intersection / union.size;
  }

  return {
    state: "computed",
    metric: "average_jaccard",
    value: total / pairs,
    totalScore: total,
    pairCount: pairs,
    sampleSize: pairs,
    limitations: [
      LIMITATION,
      {
        code: "set_metric",
        message:
          "Average Jaccard treats each selected label as a set and ignores ordering.",
      },
    ],
  };
}

function spanIoU(a: SpanAnswer, b: SpanAnswer): number {
  const intersection = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union <= 0 ? 0 : intersection / union;
}

function matchedSpanCount(a: SpanAnswer[], b: SpanAnswer[]): number {
  const used = new Set<number>();
  let matches = 0;
  for (const spanA of a) {
    let bestIndex = -1;
    let bestIou = 0;
    for (const [index, spanB] of b.entries()) {
      if (used.has(index) || spanA.label !== spanB.label) continue;
      const iou = spanIoU(spanA, spanB);
      if (iou >= 0.5 && iou > bestIou) {
        bestIndex = index;
        bestIou = iou;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches += 1;
    }
  }
  return matches;
}

export function spanOverlap(
  spansA: SpanAnswer[][],
  spansB: SpanAnswer[][],
): AgreementMetric {
  if (spansA.length !== spansB.length) {
    throw new Error("Paired span arrays must have equal length.");
  }
  const pairs = spansA.length;
  if (pairs < MIN_PAIRS) {
    return insufficient(pairs, "Insufficient comparable annotations.");
  }

  let matched = 0;
  let possible = 0;
  for (let index = 0; index < pairs; index += 1) {
    const a = spansA[index] ?? [];
    const b = spansB[index] ?? [];
    const matches = matchedSpanCount(a, b);
    matched += matches;
    possible += a.length + b.length - matches;
  }

  return {
    state: "computed",
    metric: "span_overlap",
    value: possible === 0 ? 1 : matched / possible,
    matchedUnits: matched,
    possibleUnits: possible,
    sampleSize: pairs,
    limitations: [
      LIMITATION,
      {
        code: "span_definition",
        message:
          "Span overlap uses label-aware greedy matching at a 0.5 intersection-over-union threshold.",
      },
    ],
  };
}

export function metricForField(
  field: SchemaField,
  pairs: Array<{ a: unknown; b: unknown }>,
): AgreementMetric {
  if (field.type === "single_select") {
    const labelsA: string[] = [];
    const labelsB: string[] = [];
    for (const pair of pairs) {
      if (typeof pair.a === "string" && typeof pair.b === "string") {
        labelsA.push(pair.a);
        labelsB.push(pair.b);
      }
    }
    return cohensKappa(labelsA, labelsB);
  }
  if (field.type === "multi_select") {
    const setsA: string[][] = [];
    const setsB: string[][] = [];
    for (const pair of pairs) {
      if (Array.isArray(pair.a) && Array.isArray(pair.b)) {
        setsA.push(pair.a.filter((item): item is string => typeof item === "string"));
        setsB.push(pair.b.filter((item): item is string => typeof item === "string"));
      }
    }
    return averageJaccard(setsA, setsB);
  }
  if (field.type === "span") {
    const spansA: SpanAnswer[][] = [];
    const spansB: SpanAnswer[][] = [];
    for (const pair of pairs) {
      if (Array.isArray(pair.a) && Array.isArray(pair.b)) {
        spansA.push(pair.a as SpanAnswer[]);
        spansB.push(pair.b as SpanAnswer[]);
      }
    }
    return spanOverlap(spansA, spansB);
  }
  return {
    state: "unsupported",
    reason:
      "No agreement measure is defined for this field type. LabelForge does not invent one.",
    sampleSize: pairs.length,
    limitations: [],
  };
}
