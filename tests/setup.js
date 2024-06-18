jest.mock('../src/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));
