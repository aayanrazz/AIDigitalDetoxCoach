import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import RewardLedger from '../RewardLedger.js';

describe('Module 12 - RewardLedger model', () => {
  it('TC_ENGAGE_009 validates earn and redeem ledger entries', () => {
    const earnDoc = new RewardLedger({
      user: new mongoose.Types.ObjectId(),
      type: 'earn',
      points: 25,
      title: 'Task completed',
    });

    const redeemDoc = new RewardLedger({
      user: new mongoose.Types.ObjectId(),
      type: 'redeem',
      points: -500,
      title: 'Dark Theme Pro',
      description: 'Redeemed Dark Theme Pro',
    });

    expect(earnDoc.validateSync()).toBeUndefined();
    expect(redeemDoc.validateSync()).toBeUndefined();
  });

  it('TC_ENGAGE_010 rejects invalid ledger type values', () => {
    const doc = new RewardLedger({
      user: new mongoose.Types.ObjectId(),
      type: 'bonus',
      points: 10,
      title: 'Bad type',
    });

    const error = doc.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.type.message).toContain('`bonus` is not a valid enum value');
  });
});