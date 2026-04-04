import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import DetoxPlan from '../DetoxPlan.js';

describe('Module 11 - DetoxPlan model', () => {
  it('TC_PLAN_004 validates required fields and applies default statuses', () => {
    const doc = new DetoxPlan({
      user: new mongoose.Types.ObjectId(),
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-24T00:00:00.000Z'),
      targetDailyLimitMinutes: 150,
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-04-04T00:00:00.000Z'),
          targetLimitMinutes: 180,
          tasks: [
            {
              title: 'Stay under 180 minutes',
            },
          ],
        },
      ],
    });

    const error = doc.validateSync();

    expect(error).toBeUndefined();
    expect(doc.durationDays).toBe(21);
    expect(doc.active).toBe(true);
    expect(doc.days[0].status).toBe('pending');
    expect(doc.days[0].tasks[0].type).toBe('habit');
    expect(doc.days[0].tasks[0].status).toBe('pending');
    expect(doc.days[0].tasks[0].completedAt).toBeNull();
    expect(doc.aiInsight).toBe('');
    expect(doc.planSummary).toBe('');
  });

  it('TC_PLAN_005 rejects invalid enum values for task and day status', () => {
    const doc = new DetoxPlan({
      user: new mongoose.Types.ObjectId(),
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-24T00:00:00.000Z'),
      targetDailyLimitMinutes: 150,
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-04-04T00:00:00.000Z'),
          targetLimitMinutes: 180,
          status: 'done',
          tasks: [
            {
              title: 'Bad task status',
              status: 'done',
            },
          ],
        },
      ],
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error.errors['days.0.status'].message).toContain('`done` is not a valid enum value');
    expect(error.errors['days.0.tasks.0.status'].message).toContain('`done` is not a valid enum value');
  });
});