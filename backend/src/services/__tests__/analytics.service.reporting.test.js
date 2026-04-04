import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
  buildAnalytics,
  buildAnalyticsComparison,
  buildInsightsFromAnalytics,
} from '../analytics.service.js';

describe('Module 10 - analytics.service reporting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('TC_ANALYTICS_007 buildAnalytics calculates day range hourly trend and totals', () => {
    const morningSessionTime = '2026-04-04T09:10:00.000Z';
    const lateSessionTime = '2026-04-04T23:45:00.000Z';

    const morningHour = new Date(morningSessionTime).getHours();
    const lateHour = new Date(lateSessionTime).getHours();

    const result = buildAnalytics({
      sessions: [
        {
          dayKey: '2026-04-04',
          startTime: morningSessionTime,
          durationMinutes: 30,
          pickups: 3,
          unlocks: 2,
          category: 'Productivity',
        },
        {
          dayKey: '2026-04-04',
          startTime: lateSessionTime,
          durationMinutes: 45,
          pickups: 5,
          unlocks: 3,
          category: 'Social Media',
        },
      ],
      user: { streakCount: 4 },
      range: 'day',
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-04T23:59:59.000Z'),
    });

    expect(result.totalScreenMinutes).toBe(75);
    expect(result.averageDailyMinutes).toBe(75);
    expect(result.pickups).toBe(8);
    expect(result.unlocks).toBe(5);
    expect(result.lateNightMinutes).toBe(45);
    expect(result.trendLabel).toBe('Hourly Usage');
    expect(result.trendPoints).toHaveLength(24);

    expect(result.trendPoints[morningHour]).toEqual(
      expect.objectContaining({
        key: String(morningHour),
        label: `${String(morningHour).padStart(2, '0')}:00`,
        minutes: 30,
      })
    );

    expect(result.trendPoints[lateHour]).toEqual(
      expect.objectContaining({
        key: String(lateHour),
        label: `${String(lateHour).padStart(2, '0')}:00`,
        minutes: 45,
      })
    );

    expect(
      result.trendPoints.reduce((sum, point) => sum + point.minutes, 0)
    ).toBe(75);
  });

  test('TC_ANALYTICS_008 buildAnalytics calculates week range, category breakdown, and trend generation', () => {
    const result = buildAnalytics({
      sessions: [
        {
          dayKey: '2026-03-30',
          startTime: '2026-03-30T10:00:00.000Z',
          durationMinutes: 60,
          pickups: 4,
          unlocks: 3,
          category: 'Social Media',
        },
        {
          dayKey: '2026-03-31',
          startTime: '2026-03-31T11:00:00.000Z',
          durationMinutes: 40,
          pickups: 2,
          unlocks: 2,
          category: 'Productivity',
        },
        {
          dayKey: '2026-04-01',
          startTime: '2026-04-01T23:15:00.000Z',
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
    expect(result.averageDailyMinutes).toBe(Math.round(130 / result.trendPoints.length));
    expect(result.pickups).toBe(7);
    expect(result.unlocks).toBe(6);
    expect(result.lateNightMinutes).toBe(30);
    expect(result.totalActiveDays).toBe(3);
    expect(result.streakCount).toBe(6);

    expect(result.categoryBreakdown).toEqual([
      expect.objectContaining({ category: 'Social Media', minutes: 90, sharePct: 69 }),
      expect.objectContaining({ category: 'Productivity', minutes: 40, sharePct: 31 }),
    ]);

    expect(
      result.trendPoints.reduce((sum, item) => sum + item.minutes, 0)
    ).toBe(130);
  });

  test('TC_ANALYTICS_009 buildAnalytics calculates month range and prefers latest AI insight score average', () => {
    const result = buildAnalytics({
      sessions: [
        {
          dayKey: '2026-03-10',
          startTime: '2026-03-10T12:00:00.000Z',
          durationMinutes: 120,
          pickups: 20,
          unlocks: 12,
          category: 'Social Media',
        },
      ],
      aiInsights: [
        { dayKey: '2026-03-10', score: 80, createdAt: '2026-03-10T08:00:00.000Z' },
        { dayKey: '2026-03-10', score: 84, createdAt: '2026-03-10T11:00:00.000Z' },
        { dayKey: '2026-03-11', score: 76, createdAt: '2026-03-11T09:00:00.000Z' },
      ],
      range: 'month',
      startDate: new Date('2026-03-05T00:00:00.000Z'),
      endDate: new Date('2026-04-04T23:59:59.000Z'),
    });

    expect(result.trendLabel).toBe('Daily Usage');
    expect(result.bestDayLabel).toEqual(expect.any(String));
    expect(result.worstDayLabel).toEqual(expect.any(String));
    expect(result.score).toBe(80);
    expect(result.riskLevel).toBe('low');
  });

  test('TC_ANALYTICS_010 buildAnalyticsComparison calculates previous-window comparison direction and percentages', () => {
    const improving = buildAnalyticsComparison(
      { averageDailyMinutes: 120, pickups: 20, unlocks: 12 },
      { averageDailyMinutes: 200, pickups: 25, unlocks: 15 }
    );

    const worsening = buildAnalyticsComparison(
      { averageDailyMinutes: 180, pickups: 35, unlocks: 25 },
      { averageDailyMinutes: 120, pickups: 20, unlocks: 10 }
    );

    expect(improving).toEqual({
      usageChangePct: -40,
      pickupChangePct: -20,
      unlockChangePct: -20,
      direction: 'improving',
      summary: 'Great progress. Average daily screen time is down 40% versus the previous period.',
    });

    expect(worsening).toEqual({
      usageChangePct: 50,
      pickupChangePct: 75,
      unlockChangePct: 150,
      direction: 'worsening',
      summary: 'Screen time is up 50% versus the previous period. Try reducing distractions tomorrow.',
    });
  });

  test('TC_ANALYTICS_011 buildInsightsFromAnalytics builds strong recommendations from trend and category data', () => {
    const insights = buildInsightsFromAnalytics(
      {
        categoryBreakdown: [{ category: 'Social Media', minutes: 140, sharePct: 52 }],
        lateNightMinutes: 45,
        pickups: 55,
        averageDailyMinutes: 260,
        bestDayLabel: 'Wed, Apr 2',
      },
      {
        direction: 'improving',
        summary: 'Great progress. Average daily screen time is down 20% versus the previous period.',
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

  test('TC_ANALYTICS_012 buildInsightsFromAnalytics returns balanced fallback when there are no strong concerns', () => {
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