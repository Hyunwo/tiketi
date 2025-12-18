const noop = () => {};
const noopWithLabels = () => ({ inc: noop, dec: noop, set: noop, observe: noop, labels: noopWithLabels });
module.exports = {
  httpRequestCounter: noopWithLabels(),
  httpRequestDuration: noopWithLabels(),
  activeRequests: noopWithLabels(),
  dailyPayments: noopWithLabels(),
  dailyRevenue: noopWithLabels(),
};
