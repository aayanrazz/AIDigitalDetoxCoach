import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import UsageSession from '../UsageSession.js';

describe('Module 6 - UsageSession model', () => {
  it('TC_USAGESYNC_022 UsageSession model validates required fields and applies defaults', () => {
    const doc = new UsageSession({
      user: new mongoose.Types.ObjectId(),
      appName: '  Instagram  ',
      appPackage: '  com.instagram.android  ',
      durationMinutes: 45,
      startTime: new Date('2026-04-04T10:00:00.000Z'),
      endTime: new Date('2026-04-04T10:45:00.000Z'),
      dayKey: '2026-04-04',
      hourBucket: 10,
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
    expect(doc.appName).toBe('Instagram');
    expect(doc.appPackage).toBe('com.instagram.android');
    expect(doc.category).toBe('Other');
    expect(doc.pickups).toBe(0);
    expect(doc.unlocks).toBe(0);
    expect(doc.platform).toBe('android');
    expect(doc.source).toBe('native_bridge');
  });

  it('TC_USAGESYNC_023 UsageSession model rejects invalid platform, source, and hourBucket values', () => {
    const doc = new UsageSession({
      user: new mongoose.Types.ObjectId(),
      appName: 'Instagram',
      appPackage: 'com.instagram.android',
      durationMinutes: -5,
      pickups: -1,
      unlocks: -1,
      startTime: new Date('2026-04-04T10:00:00.000Z'),
      endTime: new Date('2026-04-04T10:45:00.000Z'),
      dayKey: '2026-04-04',
      hourBucket: 24,
      platform: 'desktop',
      source: 'api',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.durationMinutes.message).toContain('Path `durationMinutes`');
    expect(error.errors.pickups.message).toContain('Path `pickups`');
    expect(error.errors.unlocks.message).toContain('Path `unlocks`');
    expect(error.errors.hourBucket.message).toContain('Path `hourBucket`');
    expect(error.errors.platform.message).toContain('`desktop` is not a valid enum value');
    expect(error.errors.source.message).toContain('`api` is not a valid enum value');
  });
});