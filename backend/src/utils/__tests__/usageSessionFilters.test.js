import { describe, it, expect } from '@jest/globals';
import {
  normalizeUsageCategory,
  isIgnoredUsageEntry,
  filterUsageSessions,
} from '../usageSessionFilters.js';

describe('Module 6 - usageSessionFilters', () => {
  it('TC_USAGESYNC_005 filterUsageSessions removes blocked packages and normalizes categories', () => {
    const result = filterUsageSessions([
      {
        appName: 'Pixel Launcher',
        appPackage: 'com.google.android.apps.nexuslauncher',
        category: 'Other',
      },
      {
        appName: 'System UI',
        appPackage: 'com.android.systemui.quickpanel',
        category: 'Other',
      },
      {
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        category: 'social networking',
      },
      {
        appName: 'Google Docs',
        appPackage: 'com.google.android.apps.docs',
        category: 'productivity tools',
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        category: 'Social Media',
      }),
      expect.objectContaining({
        appName: 'Google Docs',
        appPackage: 'com.google.android.apps.docs',
        category: 'Productivity',
      }),
    ]);
  });

  it('TC_USAGESYNC_006 normalizeUsageCategory maps supported category variants to app-friendly labels', () => {
    expect(normalizeUsageCategory('social networking')).toBe('Social Media');
    expect(normalizeUsageCategory('streaming video')).toBe('Streaming');
    expect(normalizeUsageCategory('productivity tools')).toBe('Productivity');
    expect(normalizeUsageCategory('mobile games')).toBe('Gaming');
    expect(normalizeUsageCategory('educational')).toBe('Education');
    expect(normalizeUsageCategory('communication')).toBe('Communication');
    expect(normalizeUsageCategory('')).toBe('Other');
  });

  it('TC_USAGESYNC_007 isIgnoredUsageEntry rejects missing packages and known system apps', () => {
    expect(isIgnoredUsageEntry({ appPackage: '', appName: 'Broken App' })).toBe(true);

    expect(
      isIgnoredUsageEntry({
        appPackage: 'com.google.android.apps.nexuslauncher',
        appName: 'Pixel Launcher',
      })
    ).toBe(true);

    expect(
      isIgnoredUsageEntry({
        appPackage: 'com.android.systemui.statusbar',
        appName: 'System UI',
      })
    ).toBe(true);

    expect(
      isIgnoredUsageEntry({
        appPackage: 'com.instagram.android',
        appName: 'Instagram',
      })
    ).toBe(false);
  });
});