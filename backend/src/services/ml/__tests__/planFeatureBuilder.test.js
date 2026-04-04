import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeSortedLeanResult = (value) => ({
  sort: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

const loadPlanFeatureBuilder = async ({
  baseResult,
  existingInsight = null,
} = {}) => {
  const buildMlFeaturesForDay = jest.fn().mockResolvedValue(
    baseResult || {
      dayKey: '2026-04-04',
      dailyAnalysis: { score: 80, riskLevel: 'medium' },
      featureRow: { dailyLimitMinutes: 180 },
    }
  );

  const AiInsight = {
    findOne: jest.fn(() => makeSortedLeanResult(existingInsight)),
  };

  jest.unstable_mockModule('../featureBuilder.js', () => ({
    buildMlFeaturesForDay,
  }));

  jest.unstable_mockModule('../../../models/AiInsight.js', () => ({
    default: AiInsight,
  }));

  const module = await import('../planFeatureBuilder.js');

  return {
    ...module,
    mocks: {
      buildMlFeaturesForDay,
      AiInsight,
    },
  };
};

describe('Module 7 - planFeatureBuilder.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ML_003 normalizePlanTarget clamps values into the supported range', async () => {
    const { normalizePlanTarget } = await loadPlanFeatureBuilder();

    expect(normalizePlanTarget(45)).toBe(60);
    expect(normalizePlanTarget(181.6)).toBe(182);
    expect(normalizePlanTarget(999)).toBe(480);
    expect(normalizePlanTarget('invalid', 200)).toBe(200);
  });

  it('TC_ML_004 buildPlanMlFeaturesForDay prefers latest AiInsight score and riskLevel', async () => {
    const baseResult = {
      dayKey: '2026-04-04',
      dailyAnalysis: {
        score: 72,
        riskLevel: 'medium',
      },
      featureRow: {
        dailyLimitMinutes: 180,
        totalScreenMinutes: 210,
      },
    };

    const existingInsight = {
      score: 64,
      riskLevel: 'high',
    };

    const { buildPlanMlFeaturesForDay, mocks } = await loadPlanFeatureBuilder({
      baseResult,
      existingInsight,
    });

    const result = await buildPlanMlFeaturesForDay({
      user: { _id: 'user-1' },
      date: new Date('2026-04-04T10:00:00.000Z'),
      sessions: [{ durationMinutes: 50 }],
    });

    expect(mocks.buildMlFeaturesForDay).toHaveBeenCalledWith({
      user: { _id: 'user-1' },
      date: new Date('2026-04-04T10:00:00.000Z'),
      sessions: [{ durationMinutes: 50 }],
    });

    expect(mocks.AiInsight.findOne).toHaveBeenCalledWith({
      user: 'user-1',
      dayKey: '2026-04-04',
    });

    expect(result.existingInsight).toEqual(existingInsight);
    expect(result.featureRow).toEqual({
      dailyLimitMinutes: 180,
      totalScreenMinutes: 210,
      score: 64,
      riskLevel: 'high',
    });
  });

  it('TC_ML_005 buildPlanMlFeaturesForDay falls back to daily analysis when AiInsight is missing', async () => {
    const baseResult = {
      dayKey: '2026-04-04',
      dailyAnalysis: {
        score: 88,
        riskLevel: 'low',
      },
      featureRow: {
        totalScreenMinutes: 95,
      },
    };

    const { buildPlanMlFeaturesForDay } = await loadPlanFeatureBuilder({
      baseResult,
      existingInsight: null,
    });

    const result = await buildPlanMlFeaturesForDay({
      user: { _id: 'user-2' },
    });

    expect(result.featureRow).toEqual({
      totalScreenMinutes: 95,
      score: 88,
      riskLevel: 'low',
    });
  });
});