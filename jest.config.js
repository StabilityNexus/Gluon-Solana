module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/anchor/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true
      }
    }]
  },
  testTimeout: 60000,
  verbose: true
}

