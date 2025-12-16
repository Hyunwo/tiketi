/**
 * Reservation Cleaner Service
 * Automatically cleans up expired temporary reservations
 * Single Responsibility: Cleanup expired reservations
 */

const db = require('../config/database');
const { logger } = require('@tiketi/common');
const { RESERVATION_STATUS, SEAT_STATUS, PAYMENT_STATUS, RESERVATION_SETTINGS } = require('@tiketi/common');
const { 
  reservationsExpired,
  seatsReserved,
  seatsAvailable
} = require('../metrics');

class ReservationCleaner {
  constructor() {
    this.cleanupInterval = null;
    this.io = null; // Socket.IO instance
  }

  /**
   * Set Socket.IO instance for real-time updates
   */
  setIO(io) {
    this.io = io;
    logger.info('🔌 Socket.IO connected to ReservationCleaner');
  }

  /**
   * Start automatic cleanup process
   */
  start() {
    if (this.cleanupInterval) {
      logger.info('⚠️  Reservation cleaner is already running');
      return;
    }

    const intervalMs = RESERVATION_SETTINGS.CLEANUP_INTERVAL_SECONDS * 1000;

    logger.info(`🧹 Starting reservation cleaner (interval: ${RESERVATION_SETTINGS.CLEANUP_INTERVAL_SECONDS}s)`);

    // Run immediately once (with error handling)
    this.cleanup().catch(err => {
      logger.error('❌ Initial cleanup failed:', err.message);
    });

    // Then run periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        logger.error('❌ Periodic cleanup failed:', err.message);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic cleanup process
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('🛑 Reservation cleaner stopped');
    }
  }

  /**
   * Clean up expired reservations
   * @returns {Promise<number>} - Number of reservations cleaned
   */
  async cleanup() {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Find expired reservations
      const expiredReservations = await client.query(
        `SELECT id, event_id 
         FROM reservations
         WHERE payment_status = $1
         AND expires_at < NOW()
         AND status != $2`,
        [PAYMENT_STATUS.PENDING, RESERVATION_STATUS.EXPIRED]
      );

      if (expiredReservations.rows.length === 0) {
        await client.query('COMMIT');
        return 0;
      }
      logger.info(`🧹 Cleaning ${expiredReservations.rows.length} expired reservations...`);

      for (const reservation of expiredReservations.rows) {
        // Get seat IDs for this reservation
        const seatsResult = await client.query(
          `SELECT seat_id FROM reservation_items 
           WHERE reservation_id = $1 AND seat_id IS NOT NULL`,
          [reservation.id]
        );

        // Release seats back to available
        if (seatsResult.rows.length > 0) {
          const seatIds = seatsResult.rows.map(row => row.seat_id);

          const releaseResult = await client.query(
            `UPDATE seats
             SET status = $1, updated_at = NOW()
             WHERE id = ANY($2) AND status = $3
             RETURNING id`,
            [SEAT_STATUS.AVAILABLE, seatIds, SEAT_STATUS.LOCKED]
          );

          const releasedSeatIds = releaseResult.rows.map(row => row.id);

          if (releasedSeatIds.length > 0) {
            // Metrics: only update counts for seats actually released
            seatsReserved.labels(reservation.event_id).dec(releasedSeatIds.length);
            seatsAvailable.labels(reservation.event_id).inc(releasedSeatIds.length);
            // Broadcast release only for seats whose status changed
            if (this.io) {
              try {
                for (const seatId of releasedSeatIds) {
                  this.io.to(`seats:${reservation.event_id}`).emit('seat-released', {
                    seatId,
                    status: SEAT_STATUS.AVAILABLE,
                    timestamp: new Date(),
                  });
                }
                logger.info(`🪑 Seats released: ${releasedSeatIds.join(', ')} (event: ${reservation.event_id})`);
              } catch (socketError) {
                logger.error('⚠️  WebSocket broadcast error:', socketError.message);
              }
            }
          }
        }
        // Mark as expired so the cleaner doesn't reprocess this reservation
        await client.query(
          `UPDATE reservations 
           SET status = $1, payment_status = $2, updated_at = NOW()
           WHERE id = $3`,
          [RESERVATION_STATUS.EXPIRED, PAYMENT_STATUS.FAILED, reservation.id]
        );
        reservationsExpired.labels(reservation.event_id).inc();
      }

      await client.query('COMMIT');

      logger.info(`✅ Cleaned ${expiredReservations.rows.length} expired reservations`);
      return expiredReservations.rows.length;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('❌ Reservation cleanup error:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Manually expire a specific reservation
   * @param {string} reservationId - Reservation UUID
   * @returns {Promise<boolean>} - Success status
   */
  async expireReservation(reservationId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Get seat IDs
      const seatsResult = await client.query(
        `SELECT seat_id FROM reservation_items 
         WHERE reservation_id = $1 AND seat_id IS NOT NULL`,
        [reservationId]
      );

      // Release seats
      if (seatsResult.rows.length > 0) {
        const seatIds = seatsResult.rows.map(row => row.seat_id);

        await client.query(
          `UPDATE seats 
           SET status = $1, updated_at = NOW()
           WHERE id = ANY($2)`,
          [SEAT_STATUS.AVAILABLE, seatIds]
        );
      }

      // Update reservation
      await client.query(
        `UPDATE reservations 
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [RESERVATION_STATUS.EXPIRED, reservationId]
      );

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Expire reservation error:', error);
      return false;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
module.exports = new ReservationCleaner();

