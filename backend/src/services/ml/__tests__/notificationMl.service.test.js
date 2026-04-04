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

const loadNotificationMlService = async (spawnImpl) => {
  const spawn = jest.fn(spawnImpl);

  jest.unstable_mockModule('child_process', () => ({
    spawn,
  }));

  const module = await import('../notificationMl.service.js');

  return {
    ...module,
    mocks: { spawn },
  };
};

describe('Module 7 - notificationMl.service.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ML_013 buildNotificationInsight maps a predicted limit_warning to action flags', async () => {
    const child = new MockChildProcess();
    const { buildNotificationInsight } = await loadNotificationMlService(() => child);

    const promise = buildNotificationInsight({
      featureRow: { overLimitMinutes: 45, lateNightMinutes: 0 },
    });

    child.stdout.emit(
      'data',
      JSON.stringify({
        predictions: [
          {
            predictedNotificationType: 'limit_warning',
            confidence: 0.88,
            classProbabilities: { limit_warning: 0.88, none: 0.12 },
          },
        ],
      })
    );
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      source: 'tensorflow',
      confidence: 0.88,
      classProbabilities: { limit_warning: 0.88, none: 0.12 },
      fallbackUsed: false,
      dominantNotificationType: 'limit_warning',
      sendLimitWarning: true,
      sendSleepNudge: false,
    });
  });

  it('TC_ML_014 buildNotificationInsight normalizes unknown TensorFlow types to none', async () => {
    const child = new MockChildProcess();
    const { buildNotificationInsight } = await loadNotificationMlService(() => child);

    const promise = buildNotificationInsight({
      featureRow: { overLimitMinutes: 0, lateNightMinutes: 0 },
    });

    child.stdout.emit(
      'data',
      JSON.stringify({
        predictions: [
          {
            predictedNotificationType: 'unexpected_type',
            confidence: 0.51,
            classProbabilities: { unexpected_type: 0.51 },
          },
        ],
      })
    );
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      source: 'tensorflow',
      confidence: 0.51,
      classProbabilities: { unexpected_type: 0.51 },
      fallbackUsed: false,
      dominantNotificationType: 'none',
      sendLimitWarning: false,
      sendSleepNudge: false,
    });
  });

  it('TC_ML_015 buildNotificationInsight falls back to both notifications when thresholds are met', async () => {
    const child = new MockChildProcess();
    const { buildNotificationInsight } = await loadNotificationMlService(() => child);

    const promise = buildNotificationInsight({
      featureRow: {
        overLimitMinutes: 25,
        lateNightMinutes: 35,
        limitWarningsEnabled: 1,
        gentleNudgesEnabled: 1,
      },
    });

    child.stderr.emit('data', 'bridge crash');
    child.emit('close', 1);

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        source: 'rule_based_fallback',
        fallbackUsed: true,
        dominantNotificationType: 'both',
        sendLimitWarning: true,
        sendSleepNudge: true,
      })
    );
  });

  it('TC_ML_016 buildNotificationInsight falls back to none when thresholds are not met', async () => {
    const child = new MockChildProcess();
    const { buildNotificationInsight } = await loadNotificationMlService(() => child);

    const promise = buildNotificationInsight({
      featureRow: {
        overLimitMinutes: 0,
        lateNightMinutes: 10,
        limitWarningsEnabled: 1,
        gentleNudgesEnabled: 1,
      },
    });

    child.stderr.emit('data', 'bridge crash');
    child.emit('close', 1);

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        source: 'rule_based_fallback',
        fallbackUsed: true,
        dominantNotificationType: 'none',
        sendLimitWarning: false,
        sendSleepNudge: false,
      })
    );
  });
});