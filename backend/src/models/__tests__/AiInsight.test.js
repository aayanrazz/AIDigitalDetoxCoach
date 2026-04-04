import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import AiInsight from '../AiInsight.js';

describe('Module 7 - AiInsight model', () => {
  it('TC_ML_017 validates required fields and applies defaults', () => {
    const doc = new AiInsight({
      user: new mongoose.Types.ObjectId(),
      dayKey: '2026-04-04',
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
    expect(doc.score).toBe(0);
    expect(doc.riskLevel).toBe('low');
    expect(doc.recommendations).toEqual([]);
    expect(doc.reasons).toEqual([]);
    expect(doc.predictionSource).toBe('rule_based_fallback');
    expect(doc.modelVersion).toBe('risk-v1');
    expect(doc.mlConfidence).toBe(0);
    expect(doc.classProbabilities).toEqual({});
    expect(doc.featureSnapshot).toEqual({});
    expect(doc.fallbackUsed).toBe(false);
    expect(doc.lastCalculatedAt).toBeInstanceOf(Date);
  });

  it('TC_ML_018 rejects invalid predictionSource values', () => {
    const doc = new AiInsight({
      user: new mongoose.Types.ObjectId(),
      dayKey: '2026-04-04',
      predictionSource: 'manual_override',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.predictionSource.message).toContain(
      '`manual_override` is not a valid enum value for path `predictionSource`'
    );
  });
});