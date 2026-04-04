import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import Notification from '../Notification.js';

describe('Module 12 - Notification model', () => {
  it('TC_ENGAGE_007 validates required fields and applies defaults', () => {
    const doc = new Notification({
      user: new mongoose.Types.ObjectId(),
      title: 'Daily summary',
      body: 'Review your progress',
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
    expect(doc.type).toBe('system');
    expect(doc.isRead).toBe(false);
    expect(doc.cta).toBeUndefined();
    expect(doc.metadata.generatedBy).toBe('');
    expect(doc.metadata.safeguardApplied).toBe(false);
  });

  it('TC_ENGAGE_008 rejects unsupported notification types', () => {
    const doc = new Notification({
      user: new mongoose.Types.ObjectId(),
      type: 'reminder_popup',
      title: 'Bad type',
      body: 'Bad body',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.type.message).toContain('`reminder_popup` is not a valid enum value');
  });
});