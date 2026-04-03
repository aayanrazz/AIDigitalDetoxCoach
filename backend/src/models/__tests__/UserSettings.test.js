import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import UserSettings from '../UserSettings.js';

describe('UserSettings model', () => {
  it('TC_PROFILE_013 applies schema defaults', () => {
    const doc = new UserSettings({
      user: new mongoose.Types.ObjectId(),
    });

    expect(doc.dailyLimitMinutes).toBe(240);
    expect(doc.focusAreas).toEqual(['Social Media', 'Productivity']);
    expect(doc.sleepSchedule).toEqual(
      expect.objectContaining({
        bedTime: '23:00',
        wakeTime: '07:00',
      })
    );
    expect(doc.notificationSettings).toEqual(
      expect.objectContaining({
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      })
    );
    expect(doc.privacySettings).toEqual(
      expect.objectContaining({
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      })
    );
    expect(doc.integrations).toEqual(
      expect.objectContaining({
        googleFitConnected: false,
        appleHealthConnected: false,
      })
    );
    expect(doc.theme).toBe('dark');
  });

  it('TC_PROFILE_014 preserves provided custom values', () => {
    const userId = new mongoose.Types.ObjectId();

    const doc = new UserSettings({
      user: userId,
      dailyLimitMinutes: 300,
      focusAreas: ['Study', 'Sleep'],
      sleepSchedule: {
        bedTime: '22:15',
        wakeTime: '06:30',
      },
      notificationSettings: {
        gentleNudges: false,
        dailySummaries: false,
        achievementAlerts: true,
        limitWarnings: false,
      },
      privacySettings: {
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: true,
        appleHealthConnected: false,
      },
      theme: 'light',
    });

    expect(String(doc.user)).toBe(String(userId));
    expect(doc.dailyLimitMinutes).toBe(300);
    expect(doc.focusAreas).toEqual(['Study', 'Sleep']);
    expect(doc.sleepSchedule).toEqual(
      expect.objectContaining({
        bedTime: '22:15',
        wakeTime: '06:30',
      })
    );
    expect(doc.notificationSettings).toEqual(
      expect.objectContaining({
        gentleNudges: false,
        dailySummaries: false,
        achievementAlerts: true,
        limitWarnings: false,
      })
    );
    expect(doc.privacySettings).toEqual(
      expect.objectContaining({
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v1.0',
      })
    );
    expect(doc.integrations).toEqual(
      expect.objectContaining({
        googleFitConnected: true,
        appleHealthConnected: false,
      })
    );
    expect(doc.theme).toBe('light');
  });
});