const logger = {
  log: (message) => console.log(`[SnapDB] ${message}`),
  error: (message) => console.error(`[SnapDB] ${message}`)
};

module.exports = logger;
