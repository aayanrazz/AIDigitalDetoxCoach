import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

class MockChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = {
      write: jest.fn(),
      end: jest.fn(),
    };
    this.kill = jest.fn();
  }
}

const loadPlanMlService = async (spawnImpl) => {
  const spawn = jest.fn(spawnImpl);

  jest.unstable_mockModule('child_process', () => ({
    spawn,
  }));

  const module = await import('../planMl.service.js');

  return {
    ...module,
    mocks: { spawn },
  };
};

describe('Module 7 - planMl.service.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ML_011 buildPlanTargetInsight returns a normalized TensorFlow plan target', async () => {
    const child = new MockChildProcess();
    const { buildPlanTargetInsight, mocks } = await loadPlanMlService(() => child);

    const featureRow = { dailyLimitMinutes: 220, score: 52 };
    const promise = buildPlanTargetInsight({
      featureRow,
      fallbackDailyLimit: 180,
    });

    child.stdout.emit(
      'data',
      JSON.stringify({
        predictions: [
          {
            predictedTargetDailyLimitMinutes: 58.4,
          },
        ],
      })
    );
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      source: 'tensorflow',
      predictedTargetDailyLimitMinutes: 60,
      fallbackUsed: false,
    });

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify({ rows: [featureRow] })
    );
  });

  it('TC_ML_012 buildPlanTargetInsight falls back to a normalized daily limit when bridge fails', async () => {
    const child = new MockChildProcess();
    const { buildPlanTargetInsight } = await loadPlanMlService(() => child);

    const promise = buildPlanTargetInsight({
      featureRow: { dailyLimitMinutes: 200 },
      fallbackDailyLimit: 520,
    });

    child.stderr.emit('data', 'bridge failure');
    child.emit('close', 1);

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        source: 'rule_based_fallback',
        predictedTargetDailyLimitMinutes: 480,
        fallbackUsed: true,
      })
    );
  });
});