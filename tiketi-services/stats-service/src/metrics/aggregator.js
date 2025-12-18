const { logger } = require('@tiketi/common');
const startAggregator = () => logger.info('📊 Metrics aggregator disabled (stub)');
const stopAggregator = () => {};
module.exports = { startAggregator, stopAggregator };
