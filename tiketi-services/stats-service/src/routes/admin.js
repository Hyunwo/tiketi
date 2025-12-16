const express = require('express');
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { client: redisClient } = require('../config/redis');
const seatGenerator = require('../services/seat-generator');
const { logger } = require('@tiketi/common');
const { CustomError } = require('@tiketi/common');
const {
  EVENT_STATUS,
  RESERVATION_STATUS,
  PAYMENT_STATUS,
  SEAT_STATUS,
  CACHE_KEYS,
  PAGINATION_DEFAULTS,
} = require('@tiketi/common');
const { invalidateCachePatterns, withTransaction } = require('../utils/transaction-helpers');
const { validate: isUUID } = require('uuid');

const router = express.Router();

const ensureUUID = (value, res, field = 'id') => {
  if (!isUUID(value)) {
    res.status(400).json({ error: `Invalid ${field} format` });
    return false;
  }
  return true;
};

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: 대시보드 통계 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 통계 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                 recentReservations:
 *                   type: array
 */
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    // Total events
    const eventsResult = await db.query('SELECT COUNT(*) as count FROM events');
    const totalEvents = parseInt(eventsResult.rows[0].count);

    // Total reservations
    const reservationsResult = await db.query(
      'SELECT COUNT(*) as count FROM reservations WHERE status != $1',
      [RESERVATION_STATUS.CANCELLED]
    );
    const totalReservations = parseInt(reservationsResult.rows[0].count);

    // Total revenue
    const revenueResult = await db.query(
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM reservations WHERE payment_status = $1',
      [PAYMENT_STATUS.COMPLETED]
    );
    const totalRevenue = parseInt(revenueResult.rows[0].total);

    // Today's reservations
    const todayResult = await db.query(
      `SELECT COUNT(*) as count 
       FROM reservations 
       WHERE DATE(created_at) = CURRENT_DATE AND status != $1`,
      [RESERVATION_STATUS.CANCELLED]
    );
    const todayReservations = parseInt(todayResult.rows[0].count);

    // Recent reservations
    const recentResult = await db.query(
      `SELECT 
        r.id, r.reservation_number, r.total_amount, r.status, r.created_at,
        u.name as user_name, u.email as user_email,
        e.title as event_title
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      JOIN events e ON r.event_id = e.id
      ORDER BY r.created_at DESC
      LIMIT 10`
    );

    res.json({
      stats: {
        totalEvents,
        totalReservations,
        totalRevenue,
        todayReservations,
      },
      recentReservations: recentResult.rows,
    });
  } catch (error) {
    next(new CustomError(500, '통계 정보를 불러오는데 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/seat-layouts:
 *   get:
 *     summary: 좌석 레이아웃 목록 조회 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 좌석 레이아웃 목록
 */
router.get('/seat-layouts', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, total_seats, layout_config FROM seat_layouts ORDER BY name'
    );

    res.json({ layouts: result.rows });
  } catch (error) {
    next(new CustomError(500, '좌석 레이아웃을 불러오는데 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events:
 *   post:
 *     summary: 이벤트 생성 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - venue
 *               - eventDate
 *               - saleStartDate
 *               - saleEndDate
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               venue:
 *                 type: string
 *               address:
 *                 type: string
 *               eventDate:
 *                 type: string
 *                 format: date-time
 *               saleStartDate:
 *                 type: string
 *                 format: date-time
 *               saleEndDate:
 *                 type: string
 *                 format: date-time
 *               posterImageUrl:
 *                 type: string
 *               artistName:
 *                 type: string
 *               seatLayoutId:
 *                 type: string
 *                 format: uuid
 *               ticketTypes:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: 이벤트 생성 성공
 */
router.post('/events', async (req, res, next) => {
  const client = await db.getClient();

  try {
    const {
      title,
      description,
      venue,
      address,
      eventDate,
      saleStartDate,
      saleEndDate,
      posterImageUrl,
      artistName,
      seatLayoutId, // 좌석 레이아웃 ID (좌석 선택 방식)
      ticketTypes, // 티켓 등급 배열 (티켓 등급 방식)
    } = req.body;

    if (seatLayoutId && !isUUID(seatLayoutId)) {
      return res.status(400).json({ error: 'Invalid seatLayoutId format' });
    }

    await client.query('BEGIN');

    // 현재 시간 기준으로 초기 상태 계산
    const now = new Date();
    const saleStart = new Date(saleStartDate);
    const saleEnd = new Date(saleEndDate);

    let initialStatus;
    if (now < saleStart) {
      initialStatus = EVENT_STATUS.UPCOMING;
    } else if (now >= saleStart && now < saleEnd) {
      initialStatus = EVENT_STATUS.ON_SALE;
    } else {
      initialStatus = EVENT_STATUS.ENDED;
    }

    logger.info(
      `🆕 새 이벤트 생성 - 초기 상태: ${initialStatus}
      현재 시간: ${now.toISOString()}
      예매 시작: ${saleStart.toISOString()}
      예매 종료: ${saleEnd.toISOString()}`
    );

    const result = await client.query(
      `INSERT INTO events
       (title, description, venue, address, event_date, sale_start_date, sale_end_date,
        poster_image_url, artist_name, seat_layout_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, description, venue, address, eventDate, saleStartDate, saleEndDate,
        posterImageUrl, artistName, seatLayoutId || null, req.user.userId, initialStatus]
    );

    const event = result.rows[0];

    // 좌석 선택 방식: 좌석 레이아웃으로 개별 좌석 생성
    if (seatLayoutId) {
      // Pass the transaction client to seat generator
      await seatGenerator.generateSeatsForEvent(event.id, seatLayoutId, client);
      logger.info(`✅ Generated seats for event: ${event.title} (Layout: ${seatLayoutId})`);
    }

    // 티켓 등급 방식: 티켓 타입 생성
    if (ticketTypes && Array.isArray(ticketTypes) && ticketTypes.length > 0) {
      for (const ticketType of ticketTypes) {
        await client.query(
          `INSERT INTO ticket_types (event_id, name, price, total_quantity, available_quantity, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            event.id,
            ticketType.name,
            ticketType.price,
            ticketType.totalQuantity,
            ticketType.totalQuantity, // available_quantity initially equals total_quantity
            ticketType.description || null,
          ]
        );
      }
      logger.info(`✅ Created ${ticketTypes.length} ticket types for event: ${event.title}`);
    }

    await client.query('COMMIT');

    // 이벤트 상태 업데이터 타이머 재설정
    const eventStatusUpdater = require('../services/event-status-updater');
    eventStatusUpdater.reschedule();
    logger.info('🔄 이벤트 상태 업데이터 타이머 재설정');

    // Invalidate all event list caches (즉시 반영을 위해 모든 캐시 삭제)
    await invalidateCachePatterns(redisClient, [CACHE_KEYS.EVENTS_PATTERN]);

    res.status(201).json({
      message: '이벤트가 생성되었습니다.',
      event,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(new CustomError(500, '이벤트 생성에 실패했습니다.', error));
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/admin/events/{id}:
 *   put:
 *     summary: 이벤트 수정 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               venue:
 *                 type: string
 *               address:
 *                 type: string
 *               eventDate:
 *                 type: string
 *                 format: date-time
 *               saleStartDate:
 *                 type: string
 *                 format: date-time
 *               saleEndDate:
 *                 type: string
 *                 format: date-time
 *               posterImageUrl:
 *                 type: string
 *               artistName:
 *                 type: string
 *     responses:
 *       200:
 *         description: 이벤트 수정 성공
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.put('/events/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    const {
      title,
      description,
      venue,
      address,
      eventDate,
      saleStartDate,
      saleEndDate,
      posterImageUrl,
      artistName,
    } = req.body;

    logger.info(
      `🔍 이벤트 수정 요청:
      eventDate: ${eventDate}
      saleStartDate: ${saleStartDate}
      saleEndDate: ${saleEndDate}`
    );

    // 날짜를 한국 시간으로 변환해서 출력
    if (saleStartDate) {
      const kst = new Date(new Date(saleStartDate).getTime() + (9 * 60 * 60 * 1000));
      logger.info({
        message: 'saleStartDate (KST)',
        saleStartDate: kst.toISOString().replace('T', ' ').slice(0, 16)
      });
    }
    if (saleEndDate) {
      const kst = new Date(new Date(saleEndDate).getTime() + (9 * 60 * 60 * 1000));
      logger.info({
        message: 'saleEndDate (KST)',
        saleEndDate: kst.toISOString().replace('T', ' ').slice(0, 16)
      });
    }

    // 상태는 event-status-updater가 자동으로 관리하므로 수동 업데이트 제외
    const result = await db.query(
      `UPDATE events 
       SET title = $1, description = $2, venue = $3, address = $4,
           event_date = $5, sale_start_date = $6, sale_end_date = $7,
           poster_image_url = $8, artist_name = $9
       WHERE id = $10
       RETURNING *`,
      [title, description, venue, address, eventDate, saleStartDate, saleEndDate, posterImageUrl, artistName, id]
    );

    logger.info('✅ UPDATE 쿼리 실행 완료\n  영향받은 행 수: ' + result.rowCount);

    if (result.rows.length === 0) {
      next(new CustomError(404, '이벤트를 찾을 수 없습니다.'));
      return;
    }

    logger.info(`✅ 업데이트된 이벤트: ${result.rows[0].title} 
      sale_start_date: ${result.rows[0].sale_start_date} 
      sale_end_date: ${result.rows[0].sale_end_date}`);

    // 수정 후 즉시 상태를 계산하여 업데이트
    const updatedEvent = result.rows[0];
    const now = new Date();
    const saleStart = new Date(updatedEvent.sale_start_date);
    const saleEnd = new Date(updatedEvent.sale_end_date);

    let newStatus = updatedEvent.status;

    // 취소된 이벤트가 아닌 경우에만 상태 자동 계산
    if (updatedEvent.status !== EVENT_STATUS.CANCELLED) {
      if (now < saleStart) {
        newStatus = EVENT_STATUS.UPCOMING;
      } else if (now >= saleStart && now < saleEnd) {
        newStatus = EVENT_STATUS.ON_SALE;
      } else if (now >= saleEnd) {
        newStatus = EVENT_STATUS.ENDED;
      }

      // 상태가 변경되었으면 업데이트
      if (newStatus !== updatedEvent.status) {
        await db.query(
          'UPDATE events SET status = $1 WHERE id = $2',
          [newStatus, id]
        );
        logger.info(`🔄 상태 자동 업데이트: ${updatedEvent.status} → ${newStatus}`);
      }
    }

    // 이벤트 상태 업데이터 타이머 재설정
    const eventStatusUpdater = require('../services/event-status-updater');
    eventStatusUpdater.reschedule();
    logger.info('🔄 이벤트 상태 업데이터 타이머 재설정');

    // Invalidate cache - 모든 관련 캐시 삭제 (즉시 반영)
    await invalidateCachePatterns(redisClient, [
      CACHE_KEYS.EVENT(id),
      CACHE_KEYS.EVENTS_PATTERN
    ]);

    res.json({
      message: '이벤트가 수정되었습니다.',
      event: { ...result.rows[0], status: newStatus },
    });
  } catch (error) {
    next(new CustomError(500, '이벤트 수정에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events/{id}/cancel:
 *   post:
 *     summary: 이벤트 취소 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     responses:
 *       200:
 *         description: 이벤트 취소 성공
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.post('/events/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    const result = await withTransaction(async (client) => {
      // 이벤트 상태를 취소로 변경
      const eventResult = await client.query(
        `UPDATE events
         SET status = $1
         WHERE id = $2 AND status != $1
         RETURNING *`,
        [EVENT_STATUS.CANCELLED, id]
      );

      if (eventResult.rows.length === 0) {
        throw new Error('이벤트를 찾을 수 없거나 이미 취소되었습니다.');
      }

      logger.info(`🚫 이벤트 취소 시작: ${eventResult.rows[0].title}`);

      // 해당 이벤트의 모든 예약(pending, confirmed) 취소 및 환불 처리
      const cancelledReservations = await client.query(
        `UPDATE reservations
         SET status = $1,
             payment_status = CASE
               WHEN payment_status = $2 THEN $3
               ELSE payment_status
             END
         WHERE event_id = $4 AND status IN ($5, $6)
         RETURNING id, reservation_number, status, payment_status, total_amount`,
        [
          RESERVATION_STATUS.CANCELLED,
          PAYMENT_STATUS.COMPLETED,
          PAYMENT_STATUS.REFUNDED,
          id,
          RESERVATION_STATUS.PENDING,
          RESERVATION_STATUS.CONFIRMED
        ]
      );

      logger.info(`💰 취소된 예약: ${cancelledReservations.rowCount}건`);

      if (cancelledReservations.rowCount > 0) {
        let totalRefund = 0;
        cancelledReservations.rows.forEach(r => {
          if (r.payment_status === PAYMENT_STATUS.REFUNDED) {
            totalRefund += r.total_amount;
            logger.info(`  - ${r.reservation_number}: ${r.total_amount}원 환불 처리`);
          }
        });
        logger.info(`💸 총 환불 금액: ${totalRefund}원`);
      }

      // 좌석이 있는 경우 locked 좌석을 available로 변경
      const lockedSeats = await client.query(
        `UPDATE seats
         SET status = $1
         WHERE event_id = $2 AND status = $3`,
        [SEAT_STATUS.AVAILABLE, id, SEAT_STATUS.LOCKED]
      );

      logger.info(`🪑 잠금 해제된 좌석: ${lockedSeats.rowCount}개`);

      return {
        event: eventResult.rows[0],
        cancelledReservationsCount: cancelledReservations.rowCount,
      };
    });

    // Invalidate cache - 모든 관련 캐시 삭제 (즉시 반영)
    await invalidateCachePatterns(redisClient, [
      CACHE_KEYS.EVENT(id),
      CACHE_KEYS.EVENTS_PATTERN
    ]);

    logger.info(`✅ 이벤트 취소 완료: ${result.event.title}`);

    res.json({
      message: '이벤트가 취소되었습니다. 모든 예약이 취소되고 결제 완료된 예약은 환불 처리되었습니다.',
      event: result.event,
      cancelledReservations: result.cancelledReservationsCount,
    });
  } catch (error) {
    const statusCode = error.message === '이벤트를 찾을 수 없거나 이미 취소되었습니다.' ? 404 : 500;
    next(new CustomError(statusCode, '이벤트 취소에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events/{id}:
 *   delete:
 *     summary: 이벤트 삭제 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     responses:
 *       200:
 *         description: 이벤트 삭제 성공
 *       400:
 *         description: 예매가 존재하는 이벤트는 삭제 불가
 */
router.delete('/events/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 취소되지 않은 모든 예약을 취소/환불 처리
      const cancelResult = await client.query(
        `UPDATE reservations
         SET status = $1,
             payment_status = CASE
               WHEN payment_status = $2 THEN $3
               ELSE payment_status
             END
         WHERE event_id = $4 AND status != $1
         RETURNING id`,
        [
          RESERVATION_STATUS.CANCELLED,
          PAYMENT_STATUS.COMPLETED,
          PAYMENT_STATUS.REFUNDED,
          id
        ]
      );

      // 이벤트 삭제 (ON DELETE SET NULL 로 참조는 null 처리)
      const deleteResult = await client.query(
        'DELETE FROM events WHERE id = $1 RETURNING id, title',
        [id]
      );

      if (deleteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });
      }

      await client.query('COMMIT');

      // 캐시 무효화
      await invalidateCachePatterns(redisClient, [
        CACHE_KEYS.EVENT(id),
        CACHE_KEYS.EVENTS_PATTERN
      ]);

      res.json({
        message: '이벤트가 삭제되었습니다.',
        cancelledReservations: cancelResult.rowCount,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(new CustomError(500, '이벤트 삭제에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events/{id}/generate-seats:
 *   post:
 *     summary: 이벤트 좌석 생성 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     responses:
 *       200:
 *         description: 좌석 생성 성공
 *       400:
 *         description: 이미 좌석이 존재하거나 레이아웃 미설정
 *       404:
 *         description: 이벤트를 찾을 수 없음
 */
router.post('/events/:id/generate-seats', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    // Get event with seat layout
    const eventResult = await db.query(
      'SELECT id, title, seat_layout_id FROM events WHERE id = $1',
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });
    }

    const event = eventResult.rows[0];

    if (!event.seat_layout_id) {
      return res.status(400).json({ error: '좌석 레이아웃이 설정되지 않았습니다.' });
    }

    // Check if seats already exist
    const existsResult = await db.query(
      'SELECT COUNT(*) as count FROM seats WHERE event_id = $1',
      [id]
    );

    const existingSeats = parseInt(existsResult.rows[0].count);

    if (existingSeats > 0) {
      return res.status(400).json({
        error: '이미 좌석이 생성되어 있습니다.',
        existingSeats
      });
    }

    // Generate seats
    const seatsCreated = await seatGenerator.generateSeatsForEvent(id, event.seat_layout_id);

    res.json({
      message: '좌석이 생성되었습니다.',
      seatsCreated,
      eventTitle: event.title,
    });

  } catch (error) {
    next(new CustomError(500, '좌석 생성에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events/{id}/seats:
 *   delete:
 *     summary: 이벤트 좌석 삭제 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     responses:
 *       200:
 *         description: 좌석 삭제 성공
 *       400:
 *         description: 예약된 좌석이 있어 삭제 불가
 */
router.delete('/events/:id/seats', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    // Check if there are any reservations with seats
    const reservationsResult = await db.query(
      `SELECT COUNT(*) as count 
       FROM reservations r
       JOIN reservation_items ri ON r.id = ri.reservation_id
       WHERE r.event_id = $1 
       AND ri.seat_id IS NOT NULL 
       AND r.status != 'cancelled'`,
      [id]
    );

    if (parseInt(reservationsResult.rows[0].count) > 0) {
      return res.status(400).json({
        error: '예약된 좌석이 있어 삭제할 수 없습니다.'
      });
    }

    const seatsDeleted = await seatGenerator.deleteSeatsForEvent(id);

    res.json({
      message: '좌석이 삭제되었습니다.',
      seatsDeleted,
    });

  } catch (error) {
    next(new CustomError(500, '좌석 삭제에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/events/{eventId}/tickets:
 *   post:
 *     summary: 티켓 타입 생성 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 이벤트 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - totalQuantity
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: integer
 *               totalQuantity:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: 티켓 타입 생성 성공
 */
router.post('/events/:eventId/tickets', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    if (!ensureUUID(eventId, res, 'eventId')) return;

    const { name, price, totalQuantity, description } = req.body;

    const result = await db.query(
      `INSERT INTO ticket_types 
       (event_id, name, price, total_quantity, available_quantity, description)
       VALUES ($1, $2, $3, $4, $4, $5)
       RETURNING *`,
      [eventId, name, price, totalQuantity, description]
    );

    // Invalidate cache
    await redisClient.del(CACHE_KEYS.EVENT(eventId));

    res.status(201).json({
      message: '티켓이 등록되었습니다.',
      ticketType: result.rows[0],
    });
  } catch (error) {
    next(new CustomError(500, '티켓 등록에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/tickets/{id}:
 *   put:
 *     summary: 티켓 타입 수정 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 티켓 타입 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: integer
 *               totalQuantity:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 티켓 타입 수정 성공
 *       400:
 *         description: 판매된 티켓보다 적은 수량으로 변경 불가
 *       404:
 *         description: 티켓을 찾을 수 없음
 */
router.put('/tickets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    const { name, price, totalQuantity, description } = req.body;

    // Get current ticket type
    const currentResult = await db.query(
      'SELECT total_quantity, available_quantity, event_id FROM ticket_types WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });
    }

    const current = currentResult.rows[0];
    const sold = current.total_quantity - current.available_quantity;
    const newAvailable = totalQuantity - sold;

    if (newAvailable < 0) {
      return res.status(400).json({ error: '판매된 티켓 수보다 적은 수량으로 변경할 수 없습니다.' });
    }

    const result = await db.query(
      `UPDATE ticket_types 
       SET name = $1, price = $2, total_quantity = $3, available_quantity = $4, description = $5
       WHERE id = $6
       RETURNING *`,
      [name, price, totalQuantity, newAvailable, description, id]
    );

    // Invalidate cache
    await redisClient.del(CACHE_KEYS.EVENT(current.event_id));

    res.json({
      message: '티켓이 수정되었습니다.',
      ticketType: result.rows[0],
    });
  } catch (error) {
    next(new CustomError(500, '티켓 수정에 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/reservations:
 *   get:
 *     summary: 모든 예매 내역 조회 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, cancelled]
 *     responses:
 *       200:
 *         description: 예매 내역 목록
 */
router.get('/reservations', async (req, res, next) => {
  try {
    const {
      page = PAGINATION_DEFAULTS.PAGE,
      limit = PAGINATION_DEFAULTS.RESERVATIONS_LIMIT,
      status
    } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        r.id, r.reservation_number, r.total_amount, r.status, r.payment_status,
        r.created_at,
        u.name as user_name, u.email as user_email,
        e.title as event_title, e.venue, e.event_date
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN events e ON r.event_id = e.id
    `;

    const params = [];
    if (status) {
      query += ' WHERE r.status = $1';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) FROM reservations';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE status = $1';
      countParams.push(status);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      reservations: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    next(new CustomError(500, '예매 내역을 불러오는데 실패했습니다.', error));
  }
});

/**
 * @swagger
 * /api/admin/reservations/{id}/status:
 *   patch:
 *     summary: 예매 상태 변경 (관리자)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 예매 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, cancelled]
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, completed, failed, refunded]
 *     responses:
 *       200:
 *         description: 예매 상태 변경 성공
 *       400:
 *         description: 변경할 상태 미지정
 *       404:
 *         description: 예매를 찾을 수 없음
 */
router.patch('/reservations/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ensureUUID(id, res)) return;

    const { status, paymentStatus } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (paymentStatus) {
      updates.push(`payment_status = $${paramCount}`);
      params.push(paymentStatus);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '변경할 상태를 지정해주세요.' });
    }

    params.push(id);

    const result = await db.query(
      `UPDATE reservations SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '예매를 찾을 수 없습니다.' });
    }

    res.json({
      message: '예매 상태가 변경되었습니다.',
      reservation: result.rows[0],
    });
  } catch (error) {
    next(new CustomError(500, '예매 상태 변경에 실패했습니다.', error));
  }
});

module.exports = router;

