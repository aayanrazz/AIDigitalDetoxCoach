import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const fixedNow = new Date('2026-04-04T09:00:00.000Z');

describe('Module 11 - detoxPlan.service', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('TC_PLAN_001 buildDetoxPlan creates a 21-day rule-based plan with gradual target reduction', async () => {
    const { buildDetoxPlan } = await import('../detoxPlan.service.js');

    const plan = buildDetoxPlan({
      avgDailyMinutes: 220,
      settings: {
        dailyLimitMinutes: 240,
        focusAreas: ['Social Media', 'Sleep'],
        sleepSchedule: {
          bedTime: '23:00',
          wakeTime: '07:00',
        },
        notificationSettings: {
          dailySummaries: true,
        },
      },
      score: 50,
      predictedTargetDailyLimitMinutes: null,
      planPredictionSource: 'rule_based_fallback',
    });

    expect(plan.durationDays).toBe(21);
    expect(plan.active).toBe(true);
    expect(plan.targetDailyLimitMinutes).toBe(165);
    expect(plan.days).toHaveLength(21);
    expect(plan.days[0]).toEqual(
      expect.objectContaining({
        dayNumber: 1,
        targetLimitMinutes: 220,
        status: 'in_progress',
      })
    );
    expect(plan.days[20]).toEqual(
      expect.objectContaining({
        dayNumber: 21,
        targetLimitMinutes: 165,
        status: 'pending',
      })
    );
    expect(plan.days[0].tasks[0]).toEqual(
      expect.objectContaining({
        title: 'Mindful Start after 7:00 AM',
        type: 'wellness',
        status: 'in_progress',
      })
    );
    expect(plan.days[0].tasks[1]).toEqual(
      expect.objectContaining({
        title: 'No Social Media Focus Block',
        type: 'restriction',
      })
    );
    expect(plan.days[0].tasks[4]).toEqual(
      expect.objectContaining({
        title: 'Start wind-down before 10:30 PM',
        type: 'sleep',
        targetTime: '10:30 PM',
      })
    );
    expect(plan.planSummary).toContain('rule-based target of 165 minutes');
    expect(plan.aiInsight).toContain('Moderate-risk behavior detected');
  });

  it('TC_PLAN_002 buildDetoxPlan blends TensorFlow target with rule-based target when ML source is tensorflow', async () => {
    const { buildDetoxPlan } = await import('../detoxPlan.service.js');

    const plan = buildDetoxPlan({
      avgDailyMinutes: 300,
      settings: {
        dailyLimitMinutes: 240,
        focusAreas: ['Study', 'Productivity'],
        sleepSchedule: {
          bedTime: '22:45',
          wakeTime: '06:30',
        },
        notificationSettings: {
          dailySummaries: false,
        },
      },
      score: 40,
      predictedTargetDailyLimitMinutes: 120,
      planPredictionSource: 'tensorflow',
    });

    expect(plan.targetDailyLimitMinutes).toBe(142);
    expect(plan.days[0].targetLimitMinutes).toBe(240);
    expect(plan.days[20].targetLimitMinutes).toBe(142);
    expect(plan.days[0].tasks[1].title).toBe('Study Without Distractions');
    expect(plan.days[0].tasks[2].title).toBe('Prioritize productive apps only');
    expect(plan.days[0].tasks[5]).toEqual(
      expect.objectContaining({
        title: 'Quick evening reflection',
        type: 'reflection',
      })
    );
    expect(plan.aiInsight).toContain('trained plan model');
    expect(plan.planSummary).toContain('ML-assisted target of 142 minutes');
  });

  it('TC_PLAN_003 buildDetoxPlan falls back to safe defaults for focus areas and sleep schedule', async () => {
    const { buildDetoxPlan } = await import('../detoxPlan.service.js');

    const plan = buildDetoxPlan({
      avgDailyMinutes: 80,
      settings: null,
      score: 80,
      predictedTargetDailyLimitMinutes: 'invalid',
      planPredictionSource: 'tensorflow',
    });

    expect(plan.targetDailyLimitMinutes).toBe(75);
    expect(plan.days[0].targetLimitMinutes).toBe(90);
    expect(plan.days[0].tasks[0].title).toBe('Mindful Start after 7:00 AM');
    expect(plan.days[0].tasks[1].title).toBe('No Social Media Focus Block');
    expect(plan.days[0].tasks[2].title).toBe('Prioritize productive apps only');
    expect(plan.days[0].tasks[4].targetTime).toBe('10:30 PM');
    expect(plan.aiInsight).toContain('Stable behavior detected');
  });
});