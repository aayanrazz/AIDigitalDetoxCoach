import { describe, test, expect } from '@jest/globals';
import { evaluateAppLimits } from '../behavior.service.js';

describe('Module 8 - behavior.service app limits', () => {
  test('TC_LIMITS_006 evaluateAppLimits calculates exceeded and remaining minutes correctly', () => {
    const result = evaluateAppLimits({
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 40,
        },
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 35,
        },
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          category: 'Streaming',
          durationMinutes: 30,
        },
      ],
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
          dailyLimitMinutes: 45,
        },
      ],
    });

    expect(result.monitoredApps).toEqual([
      expect.objectContaining({
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        usedMinutes: 75,
        dailyLimitMinutes: 60,
        exceededMinutes: 15,
        remainingMinutes: 0,
        isExceeded: true,
      }),
      expect.objectContaining({
        appName: 'YouTube',
        appPackage: 'com.google.android.youtube',
        usedMinutes: 30,
        dailyLimitMinutes: 45,
        exceededMinutes: 0,
        remainingMinutes: 15,
        isExceeded: false,
      }),
    ]);
  });

  test('TC_LIMITS_007 evaluateAppLimits sorts exceeded apps by severity and builds notifications when enabled', () => {
    const result = evaluateAppLimits({
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 100,
        },
        {
          appName: 'TikTok',
          appPackage: 'com.zhiliaoapp.musically',
          category: 'Social Media',
          durationMinutes: 95,
        },
      ],
      appLimits: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          dailyLimitMinutes: 60,
        },
        {
          appName: 'TikTok',
          appPackage: 'com.zhiliaoapp.musically',
          category: 'Social Media',
          dailyLimitMinutes: 80,
        },
      ],
      limitWarningsEnabled: true,
    });

    expect(result.exceededCount).toBe(2);
    expect(result.topExceededApp).toEqual(
      expect.objectContaining({
        appName: 'Instagram',
        exceededMinutes: 40,
      })
    );
    expect(result.exceededApps.map(item => item.appName)).toEqual([
      'Instagram',
      'TikTok',
    ]);
    expect(result.notifications).toEqual([
      expect.objectContaining({
        type: 'limit_warning',
        title: 'Instagram limit exceeded',
      }),
      expect.objectContaining({
        type: 'limit_warning',
        title: 'TikTok limit exceeded',
      }),
    ]);
  });

  test('TC_LIMITS_008 evaluateAppLimits suppresses notifications when limit warnings are disabled', () => {
    const result = evaluateAppLimits({
      sessions: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 75,
        },
      ],
      appLimits: [
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          dailyLimitMinutes: 60,
        },
      ],
      limitWarningsEnabled: false,
    });

    expect(result.exceededCount).toBe(1);
    expect(result.notifications).toEqual([]);
  });
});