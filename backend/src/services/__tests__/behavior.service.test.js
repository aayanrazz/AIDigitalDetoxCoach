import { describe, it, expect } from '@jest/globals';
import { analyzeDailyUsage, evaluateAppLimits } from '../behavior.service.js';

describe('Module 6 - behavior.service', () => {
  it('TC_USAGESYNC_001 analyzeDailyUsage calculates score, risk, totals, and late-night usage correctly', () => {
    const result = analyzeDailyUsage({
      settings: {
        dailyLimitMinutes: 180,
        notificationSettings: {
          gentleNudges: true,
          limitWarnings: true,
        },
      },
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 120,
          pickups: 30,
          unlocks: 20,
          startTime: '2026-04-04T23:15:00.000Z',
        },
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          category: 'Streaming',
          durationMinutes: 90,
          pickups: 25,
          unlocks: 15,
          startTime: '2026-04-04T10:00:00.000Z',
        },
        {
          appName: 'Docs',
          appPackage: 'com.google.android.apps.docs',
          category: 'Productivity',
          durationMinutes: 60,
          pickups: 10,
          unlocks: 10,
          startTime: '2026-04-04T11:00:00.000Z',
        },
      ],
    });

    expect(result.totalScreenMinutes).toBe(270);
    expect(result.pickups).toBe(65);
    expect(result.unlocks).toBe(45);
    expect(result.lateNightMinutes).toBe(120);
    expect(result.socialMinutes).toBe(120);
    expect(result.productivityMinutes).toBe(60);
    expect(result.dailyLimit).toBe(180);
    expect(result.score).toBe(66);
    expect(result.riskLevel).toBe('high');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'You are 90 minutes above your daily target.',
        'Late-night usage was detected and may affect sleep quality.',
        'High pickup frequency suggests compulsive checking behavior.',
      ])
    );
    expect(result.recommendations).toEqual(
      expect.arrayContaining([
        'Reduce social media usage by at least 15 minutes tomorrow.',
        'Start wind-down mode 30 minutes earlier tonight.',
        'Turn off non-essential notifications for one focus block.',
      ])
    );
  });

  it('TC_USAGESYNC_002 analyzeDailyUsage generates limit-warning and sleep notifications when thresholds are crossed', () => {
    const result = analyzeDailyUsage({
      settings: {
        dailyLimitMinutes: 180,
        notificationSettings: {
          gentleNudges: true,
          limitWarnings: true,
        },
      },
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 210,
          pickups: 20,
          unlocks: 20,
          startTime: '2026-04-04T23:30:00.000Z',
        },
      ],
    });

    expect(result.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'limit_warning',
          title: 'Daily limit reached',
          body: 'You passed your 180 minute target today.',
          cta: { label: '5 MIN BREAK', action: 'start_break' },
        }),
        expect.objectContaining({
          type: 'sleep',
          title: 'Time to sleep',
          body: 'It is getting late. Put the phone away.',
          cta: { label: 'START WIND DOWN', action: 'wind_down' },
        }),
      ])
    );
  });

  it('TC_USAGESYNC_003 evaluateAppLimits calculates exceeded apps, remaining minutes, and warning notifications', () => {
    const result = evaluateAppLimits({
      limitWarningsEnabled: true,
      appLimits: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          dailyLimitMinutes: 60,
        },
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          category: 'Streaming',
          dailyLimitMinutes: 30,
        },
      ],
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 50,
        },
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 30,
        },
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          category: 'Streaming',
          durationMinutes: 45,
        },
      ],
    });

    expect(result.monitoredApps).toEqual([
      expect.objectContaining({
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        usedMinutes: 80,
        dailyLimitMinutes: 60,
        exceededMinutes: 20,
        remainingMinutes: 0,
        isExceeded: true,
      }),
      expect.objectContaining({
        appName: 'YouTube',
        appPackage: 'com.google.android.youtube',
        usedMinutes: 45,
        dailyLimitMinutes: 30,
        exceededMinutes: 15,
        remainingMinutes: 0,
        isExceeded: true,
      }),
    ]);

    expect(result.exceededCount).toBe(2);
    expect(result.topExceededApp).toEqual(
      expect.objectContaining({
        appName: 'Instagram',
        exceededMinutes: 20,
      })
    );

    expect(result.notifications).toEqual([
      expect.objectContaining({
        type: 'limit_warning',
        title: 'Instagram limit exceeded',
      }),
      expect.objectContaining({
        type: 'limit_warning',
        title: 'YouTube limit exceeded',
      }),
    ]);
  });

  it('TC_USAGESYNC_004 evaluateAppLimits suppresses notifications when limit warnings are disabled', () => {
    const result = evaluateAppLimits({
      limitWarningsEnabled: false,
      appLimits: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          dailyLimitMinutes: 60,
        },
      ],
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          durationMinutes: 90,
        },
      ],
    });

    expect(result.exceededCount).toBe(1);
    expect(result.notifications).toEqual([]);
  });
});