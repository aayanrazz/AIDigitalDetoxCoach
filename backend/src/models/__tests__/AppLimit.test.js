import { describe, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import AppLimit from '../AppLimit.js';

describe('Module 8 - AppLimit model', () => {
  test('TC_LIMITS_019 AppLimit model trims values and applies default category', () => {
    const doc = new AppLimit({
      user: new mongoose.Types.ObjectId(),
      appName: '  Instagram  ',
      appPackage: '  com.instagram.android  ',
      dailyLimitMinutes: 90,
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
    expect(doc.appName).toBe('Instagram');
    expect(doc.appPackage).toBe('com.instagram.android');
    expect(doc.category).toBe('Other');
    expect(doc.dailyLimitMinutes).toBe(90);
  });

  test('TC_LIMITS_020 AppLimit model rejects dailyLimitMinutes outside valid range', () => {
    const tooLow = new AppLimit({
      user: new mongoose.Types.ObjectId(),
      appName: 'Instagram',
      appPackage: 'com.instagram.android',
      dailyLimitMinutes: 0,
    });

    const tooHigh = new AppLimit({
      user: new mongoose.Types.ObjectId(),
      appName: 'Instagram',
      appPackage: 'com.instagram.android',
      dailyLimitMinutes: 1441,
    });

    const lowError = tooLow.validateSync();
    const highError = tooHigh.validateSync();

    expect(lowError).toBeDefined();
    expect(lowError.errors.dailyLimitMinutes).toBeDefined();

    expect(highError).toBeDefined();
    expect(highError.errors.dailyLimitMinutes).toBeDefined();
  });
});