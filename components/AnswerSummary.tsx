import { describeAnswer } from "@/lib/answer-display";
import type { AnnotationAnswer, AnnotationSchema } from "@/domain/schema";

export function AnswerSummary({
  schema,
  answer,
  differingFields = [],
}: {
  schema: AnnotationSchema;
  answer: AnnotationAnswer;
  differingFields?: string[];
}) {
  const values = describeAnswer(schema, answer);
  return (
    <dl className="answer-values">
      {values.map((value) => (
        <div key={value.fieldKey}>
          <dt>
            {value.label}
            {differingFields.includes(value.fieldKey) ? (
              <span className="badge status-disputed" style={{ marginLeft: "0.4rem" }}>
                Differs
              </span>
            ) : null}
          </dt>
          <dd className={value.missing ? "muted" : undefined}>{value.text}</dd>
        </div>
      ))}
    </dl>
  );
}
