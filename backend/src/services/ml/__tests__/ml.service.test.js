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

const loadMlService = async (spawnImpl) => {
  const spawn = jest.fn(spawnImpl);

  jest.unstable_mockModule('child_process', () => ({
    spawn,
  }));

  const module = await import('../ml.service.js');

  return {
    ...module,
    mocks: { spawn },
  };
};

describe('Module 7 - ml.service.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ML_008 buildMlInsight returns TensorFlow prediction details when bridge succeeds', async () => {
    const child = new MockChildProcess();
    const { buildMlInsight, mocks } = await loadMlService(() => child);

    const featureRow = { totalScreenMinutes: 240, overLimitMinutes: 60 };
    const promise = buildMlInsight({
      featureRow,
      fallbackAnalysis: { score: 41, riskLevel: 'medium' },
    });

    child.stdout.emit(
      'data',
      JSON.stringify({
        predictions: [
          {
            predictedRiskLevel: 'high',
            confidence: 0.91,
            classProbabilities: { high: 0.91, medium: 0.06, low: 0.03 },
          },
        ],
      })
    );
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      source: 'tensorflow',
      riskLevel: 'high',
      confidence: 0.91,
      classProbabilities: { high: 0.91, medium: 0.06, low: 0.03 },
      score: 41,
      fallbackUsed: false,
    });

    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify({ rows: [featureRow] })
    );
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('TC_ML_009 predictRiskWithTensorFlow rejects invalid JSON returned by the bridge', async () => {
    const child = new MockChildProcess();
    const { predictRiskWithTensorFlow } = await loadMlService(() => child);

    const promise = predictRiskWithTensorFlow({
      featureRow: { totalScreenMinutes: 50 },
      timeoutMs: 1000,
    });

    child.stdout.emit('data', 'not-json');
    child.emit('close', 0);

    await expect(promise).rejects.toThrow(
      'TensorFlow bridge returned invalid JSON. not-json'
    );
  });

  it('TC_ML_010 buildMlInsight falls back when bridge returns no predictions', async () => {
    const child = new MockChildProcess();
    const { buildMlInsight } = await loadMlService(() => child);

    const promise = buildMlInsight({
      featureRow: { totalScreenMinutes: 300 },
      fallbackAnalysis: { score: 37, riskLevel: 'high' },
    });

    child.stdout.emit('data', JSON.stringify({ predictions: [] }));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        source: 'rule_based_fallback',
        riskLevel: 'high',
        confidence: 0,
        classProbabilities: {},
        score: 37,
        fallbackUsed: true,
        errorMessage: 'TensorFlow bridge returned no predictions.',
      })
    );
  });
});