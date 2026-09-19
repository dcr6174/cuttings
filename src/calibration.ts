import type { EvaluationProvenance } from './types.js';

// Replay the accept/reject decision a provenance record would have produced at
// a different threshold, without calling any evaluator again. This is what
// makes stored provenance replayable: raw result and confidence are enough.
export function replayAccepted(result: boolean | null, confidence: number, threshold: number): boolean | null {
  return result !== null && confidence >= threshold ? result : null;
}

export interface CalibrationBucket {
  min: number;
  max: number;
  labeled: number;
  correct: number;
}

export interface CalibrationSummary {
  labeled: number;
  answered: number;
  correct: number;
  agreement: number | null;
  buckets: CalibrationBucket[];
}

const EDGES = [0, 0.6, 0.75, 0.9, 1.000_001] as const;

// Confidence calibration against human labels. Agreement is measured only over
// labeled records the evaluator actually answered (result is not null); a
// refused answer is honest and is never counted as right or wrong.
export function summarizeCalibration(records: readonly EvaluationProvenance[]): CalibrationSummary {
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < EDGES.length - 1; i += 1) {
    buckets.push({ min: EDGES[i]!, max: EDGES[i + 1]!, labeled: 0, correct: 0 });
  }
  let labeled = 0;
  let answered = 0;
  let correct = 0;
  for (const record of records) {
    if (record.humanLabel === undefined) continue;
    labeled += 1;
    const bucket = buckets.find(b => record.confidence >= b.min && record.confidence < b.max);
    if (bucket) bucket.labeled += 1;
    if (record.result === null) continue;
    answered += 1;
    if (record.result === record.humanLabel) {
      correct += 1;
      if (bucket) bucket.correct += 1;
    }
  }
  return { labeled, answered, correct, agreement: answered > 0 ? correct / answered : null, buckets };
}
