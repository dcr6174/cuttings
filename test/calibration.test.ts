import { describe, expect, it } from 'vitest';
import { replayAccepted, summarizeCalibration } from '../src/calibration.js';
import type { EvaluationProvenance } from '../src/types.js';

function record(confidence: number, result: boolean | null, humanLabel?: boolean): EvaluationProvenance {
  return {
    conditionId: 'c0', question: 'q', criteria: 'c', confidenceThreshold: 0.75,
    evaluatorVersion: 'jev:jev-latest', confidence, result,
    acceptedResult: replayAccepted(result, confidence, 0.75), mode: 'shadow',
    ...(humanLabel === undefined ? {} : { humanLabel }),
  };
}

describe('replayAccepted', () => {
  it('replays accept decisions at a new threshold without an evaluator', () => {
    expect(replayAccepted(true, 0.9, 0.75)).toBe(true);
    expect(replayAccepted(true, 0.9, 0.95)).toBeNull();
    expect(replayAccepted(null, 0.9, 0.5)).toBeNull();
  });
});

describe('summarizeCalibration', () => {
  it('measures agreement only over answered labeled records', () => {
    const summary = summarizeCalibration([
      record(0.9, true, true),
      record(0.8, false, true),
      record(0.7, null, false),
      record(0.95, true),
    ]);
    expect(summary.labeled).toBe(3);
    expect(summary.answered).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.agreement).toBe(0.5);
  });
  it('buckets labeled records by confidence', () => {
    const summary = summarizeCalibration([record(0.92, true, true), record(0.65, false, false)]);
    const top = summary.buckets.find(b => b.min === 0.9);
    const mid = summary.buckets.find(b => b.min === 0.6);
    expect(top).toMatchObject({ labeled: 1, correct: 1 });
    expect(mid).toMatchObject({ labeled: 1, correct: 1 });
  });
  it('reports null agreement with no answered labels', () => {
    expect(summarizeCalibration([]).agreement).toBeNull();
    expect(summarizeCalibration([record(0.9, true)]).agreement).toBeNull();
  });
});
