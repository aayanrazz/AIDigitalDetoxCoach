module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',

  extensionsToTreatAsEsm: ['.ts'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },

  testMatch: [
    '<rootDir>/tests/controllers/**/*.test.ts',
    '<rootDir>/tests/ai/**/*.test.js',
    '<rootDir>/src/**/__tests__/**/*.test.js',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  moduleFileExtensions: ['ts', 'js', 'json'],

  clearMocks: true,
  verbose: true,
  testTimeout: 120000,
};