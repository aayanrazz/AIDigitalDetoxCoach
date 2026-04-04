import { describe, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import UserSettings from '../UserSettings.js';

describe('UserSettings privacy, consent, and data-control model', () => {
  test('TC_PRIVACY_013 UserSettings privacy defaults are applied correctly', () => {
    const doc = new UserSettings({
      user: new mongoose.Types.ObjectId(),
    });

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
  });

  test('TC_PRIVACY_014 UserSettings custom privacy settings are preserved correctly', () => {
    const doc = new UserSettings({
      user: new mongoose.Types.ObjectId(),
      privacySettings: {
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v2.0',
        consentedAt: new Date('2026-04-01T10:00:00.000Z'),
        policyLastViewedAt: new Date('2026-04-01T09:00:00.000Z'),
        deletionRequestedAt: null,
      },
    });

    expect(doc.privacySettings).toEqual(
      expect.objectContaining({
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v2.0',
      })
    );
  });
});