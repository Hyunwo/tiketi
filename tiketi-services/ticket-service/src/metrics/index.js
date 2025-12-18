const noop = () => {};
const noopWithLabels = () => ({ inc: noop, dec: noop, set: noop, observe: noop, labels: noopWithLabels });
module.exports = {
  eventViews: noopWithLabels(),
  conversionFunnel: noopWithLabels(),
  queueUsers: noopWithLabels(),
  seatsReserved: noopWithLabels(),
  seatsAvailable: noopWithLabels(),
  queueWaitTime: noopWithLabels(),
};
