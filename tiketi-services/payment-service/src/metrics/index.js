const noop = () => {};
const noopWithLabels = () => ({ inc: noop, dec: noop, set: noop, observe: noop, labels: noopWithLabels });
module.exports = {
  paymentsTotal: noopWithLabels(),
  paymentAmount: noopWithLabels(),
  reservationsCreated: noopWithLabels(),
  reservationsCancelled: noopWithLabels(),
  reservationsExpired: noopWithLabels(),
  seatsReserved: noopWithLabels(),
  seatsAvailable: noopWithLabels(),
  conversionFunnel: noopWithLabels(),
};
