import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import {
  buildAnalytics,
  buildAnalyticsComparison,
  buildInsightsFromAnalytics,
} from '../analytics.service.js';

describe('Module 9 - analytics.service dashboard insights', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T12:00:00.000Z'));
  });

  test('TC_DASH_006 buildAnalytics maps weekly trend points, category breakdown, peak hour, and totals', () => {
    const result = buildAnalytics({
      sessions: [
        {
          dayKey: '2026-04-01',
          startTime: '2026-04-01T10:15:00.000Z',
          durationMinutes: 60,
          pickups: 4,
          unlocks: 3,
          category: 'Social Media',
        },
        {
          dayKey: '2026-04-02',
          startTime: '2026-04-02T10:45:00.000Z',
          durationMinutes: 40,
          pickups: 2,
          unlocks: 2,
          category: 'Productivity',
        },
        {
          dayKey: '2026-04-02',
          startTime: '2026-04-02T23:30:00.000Z',
          durationMinutes: 30,
          pickups: 1,
          unlocks: 1,
          category: 'Social Media',
        },
      ],
      user: { streakCount: 6 },
      range: 'week',
      startDate: new Date('2026-03-29T00:00:00.000Z'),
      endDate: new Date('2026-04-04T23:59:59.000Z'),
    });

    expect(result.totalScreenMinutes).toBe(130);
    expect(result.pickups).toBe(7);
    expect(result.unlocks).toBe(6);
    expect(result.lateNightMinutes).toBe(30);
    expect(result.totalActiveDays).toBe(2);
    expect(result.streakCount).toBe(6);

    expect(result.peakHour).toBe(
      new Date('2026-04-01T10:15:00.000Z').getHours()
    );
    expect(result.peakHourLabel).toBe(
      `${String(new Date('2026-04-01T10:15:00.000Z').getHours()).padStart(2, '0')}:00`
    );
    expect(result.trendLabel).toBe('Daily Usage');

    expect(Array.isArray(result.trendPoints)).toBe(true);
    expect(result.trendPoints.length).toBeGreaterThanOrEqual(7);
    expect(result.trendPoints.length).toBeLessThanOrEqual(8);

    expect(
      result.trendPoints.reduce((sum, point) => sum + point.minutes, 0)
    ).toBe(130);

    expect(result.averageDailyMinutes).toBe(
      Math.round(130 / result.trendPoints.length)
    );

    expect(result.bestDayLabel).toEqual(expect.any(String));
    expect(result.worstDayLabel).toEqual(expect.any(String));
    expect(result.bestDayLabel.length).toBeGreaterThan(0);
    expect(result.worstDayLabel.length).toBeGreaterThan(0);

    expect(result.categoryBreakdown).toEqual([
      expect.objectContaining({
        category: 'Social Media',
        minutes: 90,
        sharePct: 69,
      }),
      expect.objectContaining({
        category: 'Productivity',
        minutes: 40,
        sharePct: 31,
      }),
    ]);
  });

  test('TC_DASH_007 buildAnalytics prefers latest AI insight scores over derived score', () => {
    const result = buildAnalytics({
      sessions: [
        {
          dayKey: '2026-04-03',
          startTime: '2026-04-03T23:30:00.000Z',
          durationMinutes: 180,
          pickups: 30,
          unlocks: 10,
          category: 'Social Media',
        },
      ],
      aiInsights: [
        {
          dayKey: '2026-04-03',
          score: 88,
          createdAt: '2026-04-03T08:00:00.000Z',
        },
        {
          dayKey: '2026-04-03',
          score: 91,
          createdAt: '2026-04-03T10:00:00.000Z',
        },
        {
          dayKey: '2026-04-04',
          score: 79,
          createdAt: '2026-04-04T09:00:00.000Z',
        },
      ],
      range: 'week',
      startDate: new Date('2026-03-29T00:00:00.000Z'),
      endDate: new Date('2026-04-04T23:59:59.000Z'),
    });

    expect(result.score).toBe(85);
    expect(result.riskLevel).toBe('low');
  });

  test('TC_DASH_008 buildAnalyticsComparison flags improving usage and builds positive summary', () => {
    const comparison = buildAnalyticsComparison(
      { averageDailyMinutes: 120, pickups: 20, unlocks: 12 },
      { averageDailyMinutes: 200, pickups: 25, unlocks: 15 }
    );

    expect(comparison).toEqual({
      usageChangePct: -40,
      pickupChangePct: -20,
      unlockChangePct: -20,
      direction: 'improving',
      summary:
        'Great progress. Average daily screen time is down 40% versus the previous period.',
    });
  });

  test('TC_DASH_009 buildAnalyticsComparison flags worsening usage and builds caution summary', () => {
    const comparison = buildAnalyticsComparison(
      { averageDailyMinutes: 180, pickups: 35, unlocks: 25 },
      { averageDailyMinutes: 120, pickups: 20, unlocks: 10 }
    );

    expect(comparison).toEqual({
      usageChangePct: 50,
      pickupChangePct: 75,
      unlockChangePct: 150,
      direction: 'worsening',
      summary:
        'Screen time is up 50% versus the previous period. Try reducing distractions tomorrow.',
    });
  });

  test('TC_DASH_010 buildInsightsFromAnalytics builds category, late-night, pickups, usage, and best-day insights', () => {
    const insights = buildInsightsFromAnalytics(
      {
        categoryBreakdown: [
          { category: 'Social Media', minutes: 140, sharePct: 52 },
        ],
        lateNightMinutes: 45,
        pickups: 55,
        averageDailyMinutes: 260,
        bestDayLabel: 'Wed, Apr 2',
      },
      {
        direction: 'improving',
        summary:
          'Great progress. Average daily screen time is down 20% versus the previous period.',
      }
    );

    expect(insights).toEqual([
      'Great progress. Average daily screen time is down 20% versus the previous period.',
      'Social Media is your top category this period.',
      'Late-night usage is high and may be affecting sleep quality.',
      'Pickup frequency is high. Try disabling non-essential notifications.',
      'Average daily usage is elevated. Aim to reduce at least 20 minutes tomorrow.',
    ]);
  });

  test('TC_DASH_011 buildInsightsFromAnalytics returns balanced fallback when no strong concerns exist', () => {
    const insights = buildInsightsFromAnalytics(
      {
        categoryBreakdown: [],
        lateNightMinutes: 0,
        pickups: 8,
        averageDailyMinutes: 90,
        bestDayLabel: '',
      },
      {
        direction: 'steady',
        summary: 'Your usage is stable compared with the previous period.',
      }
    );

    expect(insights).toEqual([
      'Your digital wellness pattern looks balanced this period.',
    ]);
  });
});