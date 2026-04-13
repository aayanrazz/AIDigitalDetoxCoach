module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  verbose: true,
  testTimeout: 120000,
  transform: {},
  testMatch: [
    '<rootDir>/src/controllers/__tests__/usage.ml.controller.test.js',
    '<rootDir>/src/controllers/__tests__/planPreview.ml.controller.test.js',
    '<rootDir>/src/controllers/__tests__/notificationPreview.ml.controller.test.js',
    '<rootDir>/tests/ai/**/*.test.js'
  ],
  moduleFileExtensions: ['js', 'json']
};