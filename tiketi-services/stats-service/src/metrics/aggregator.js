const db = require('../config/database');
const { logger } = require('@tiketi/common');
const {
  dailyRevenue,
  dailyPayments,
  reservationConversionRate,
  eventReservations24h,
  eventRevenue24h,
  eventAvgPrice,
  paymentMethodCount,
  conversionFunnelRate,
} = require('./index');

class MetricsAggregator {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * 백그라운드 작업 시작 (1분마다)
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️  Metrics aggregator already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔄 Starting metrics aggregator...');

    // 즉시 한 번 실행
    this.aggregate().catch(err => {
      logger.error('❌ Initial metrics aggregation failed:', err);
    });

    // 1분마다 실행
    this.intervalId = setInterval(async () => {
      try {
        await this.aggregate();
      } catch (error) {
        logger.error('❌ Metrics aggregation error:', error);
      }
    }, 60 * 1000); // 60초

    logger.info('✅ Metrics aggregator started');
  }

  /**
   * 백그라운드 작업 중지
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('⏹️  Metrics aggregator stopped');
    }
  }

  /**
   * 모든 메트릭 집계
   */
  async aggregate() {
    logger.debug('📊 Aggregating metrics...');

    try {
      await Promise.all([
        this.aggregateDailyMetrics(),
        this.aggregateEventMetrics(),
        this.aggregatePaymentMethodMetrics(),
        this.aggregateConversionFunnel(),
      ]);

      logger.debug('✅ Metrics aggregation complete');
    } catch (error) {
      logger.error('❌ Metrics aggregation failed:', error);
      throw error;
    }
  }

  /**
   * 1. 오늘 매출 & 결제 건수
   */
  async aggregateDailyMetrics() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as payment_count,
          COALESCE(SUM(total_amount), 0) as total_revenue
        FROM reservations
        WHERE 
          payment_status = 'completed'
          AND updated_at >= CURRENT_DATE
          AND updated_at < CURRENT_DATE + INTERVAL '1 day'
      `);

      const { payment_count, total_revenue } = result.rows[0];

      dailyPayments.set(parseInt(payment_count) || 0);
      dailyRevenue.set(parseFloat(total_revenue) || 0);

      logger.debug(`📈 Daily metrics: ${payment_count} payments, ₩${total_revenue}`);
    } catch (error) {
      logger.error('❌ Daily metrics aggregation failed:', error);
    }
  }

  /**
   * 2. 이벤트별 메트릭 (24시간)
   */
  async aggregateEventMetrics() {
    try {
      const result = await db.query(`
        SELECT 
          e.id as event_id,
          e.title as event_title,
          COUNT(r.id) as reservation_count,
          COALESCE(SUM(r.total_amount), 0) as total_revenue,
          CASE 
            WHEN COUNT(r.id) > 0 THEN COALESCE(SUM(r.total_amount), 0) / COUNT(r.id)
            ELSE 0
          END as avg_price
        FROM events e
        LEFT JOIN reservations r ON e.id = r.event_id
          AND r.payment_status = 'completed'
          AND r.updated_at >= NOW() - INTERVAL '24 hours'
        WHERE e.status != 'cancelled'
        GROUP BY e.id, e.title
        HAVING COUNT(r.id) > 0
      `);

      // 기존 메트릭 초기화 (삭제된 이벤트 처리)
      // eventReservations24h.reset(); // 필요시

      result.rows.forEach(row => {
        const { event_id, event_title, reservation_count, total_revenue, avg_price } = row;

        eventReservations24h.labels(event_id, event_title).set(parseInt(reservation_count));
        eventRevenue24h.labels(event_id, event_title).set(parseFloat(total_revenue));
        eventAvgPrice.labels(event_id, event_title).set(parseFloat(avg_price));
      });

      logger.debug(`📈 Event metrics updated: ${result.rows.length} events`);
    } catch (error) {
      logger.error('❌ Event metrics aggregation failed:', error);
    }
  }

  /**
   * 3. 결제 수단별 건수 (24시간)
   */
  async aggregatePaymentMethodMetrics() {
    try {
      const result = await db.query(`
        SELECT 
          payment_method,
          COUNT(*) as count
        FROM reservations
        WHERE 
          payment_status = 'completed'
          AND payment_method IS NOT NULL
          AND updated_at >= NOW() - INTERVAL '24 hours'
        GROUP BY payment_method
      `);

      // 기존 메트릭 초기화
      ['naver_pay', 'kakao_pay', 'bank_transfer'].forEach(method => {
        paymentMethodCount.labels(method).set(0);
      });

      result.rows.forEach(row => {
        paymentMethodCount.labels(row.payment_method).set(parseInt(row.count));
      });

      logger.debug(`📈 Payment method metrics: ${result.rows.length} methods`);
    } catch (error) {
      logger.error('❌ Payment method metrics aggregation failed:', error);
    }
  }

  /**
   * 4. 전환 퍼널 비율 (24시간)
   */
  async aggregateConversionFunnel() {
    try {
      // 각 단계별 카운트 조회
      const viewResult = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM (
          SELECT user_id FROM reservations WHERE created_at >= NOW() - INTERVAL '24 hours'
          UNION
          SELECT user_id FROM reservations WHERE updated_at >= NOW() - INTERVAL '24 hours'
        ) as users
      `);

      const reservationResult = await db.query(`
        SELECT COUNT(*) as count
        FROM reservations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      const paymentResult = await db.query(`
        SELECT COUNT(*) as count
        FROM reservations
        WHERE 
          payment_status = 'completed'
          AND updated_at >= NOW() - INTERVAL '24 hours'
      `);

      const viewCount = parseInt(viewResult.rows[0].count) || 1; // 0 방지
      const reservationCount = parseInt(reservationResult.rows[0].count) || 0;
      const paymentCount = parseInt(paymentResult.rows[0].count) || 0;

      // 퍼센트 계산 (view를 100%로)
      conversionFunnelRate.labels('view').set(100);
      conversionFunnelRate.labels('reservation').set((reservationCount / viewCount) * 100);
      conversionFunnelRate.labels('payment').set((paymentCount / viewCount) * 100);

      // 예약→결제 전환율도 업데이트
      if (reservationCount > 0) {
        reservationConversionRate.set((paymentCount / reservationCount) * 100);
      } else {
        reservationConversionRate.set(0);
      }

      logger.debug(`📈 Funnel: view=${viewCount}, res=${reservationCount}, pay=${paymentCount}`);
    } catch (error) {
      logger.error('❌ Conversion funnel aggregation failed:', error);
    }
  }
}

// Singleton instance
const metricsAggregator = new MetricsAggregator();

module.exports = metricsAggregator;