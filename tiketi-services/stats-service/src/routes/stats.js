/**
 * Stats 라우트
 * 통계 및 대시보드 API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logger, CustomError } = require('@tiketi/common');

/**
 * @swagger
 * /api/stats/dashboard:
 *   get:
 *     summary: 대시보드 통계
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 대시보드 통계 데이터
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    // 전체 이벤트 수
    const eventsResult = await db.query('SELECT COUNT(*) as count FROM events');
    
    // 전체 예약 수
    const reservationsResult = await db.query('SELECT COUNT(*) as count FROM reservations');
    
    // 전체 사용자 수
    const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
    
    // 오늘 예약 수
    const todayReservationsResult = await db.query(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    // 총 매출 (완료된 결제)
    const revenueResult = await db.query(`
      SELECT COALESCE(SUM(total_price), 0) as total 
      FROM reservations 
      WHERE status = 'confirmed'
    `);

    res.json({
      success: true,
      data: {
        totalEvents: parseInt(eventsResult.rows[0].count),
        totalReservations: parseInt(reservationsResult.rows[0].count),
        totalUsers: parseInt(usersResult.rows[0].count),
        todayReservations: parseInt(todayReservationsResult.rows[0].count),
        totalRevenue: parseInt(revenueResult.rows[0].total),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/stats/events/{eventId}:
 *   get:
 *     summary: 특정 이벤트 통계
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: integer
 */
router.get('/events/:eventId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // 이벤트 정보
    const eventResult = await db.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      throw new CustomError(404, '이벤트를 찾을 수 없습니다.');
    }

    // 좌석 통계
    const seatsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'reserved') as reserved,
        COUNT(*) FILTER (WHERE status = 'locked') as locked
      FROM seats 
      WHERE event_id = $1
    `, [eventId]);

    // 예약 통계
    const reservationsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0) as revenue
      FROM reservations 
      WHERE event_id = $1
    `, [eventId]);

    res.json({
      success: true,
      data: {
        event: eventResult.rows[0],
        seats: seatsResult.rows[0],
        reservations: reservationsResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('Event stats error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/stats/revenue:
 *   get:
 *     summary: 매출 통계
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         default: daily
 */
router.get('/revenue', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { period = 'daily' } = req.query;
    
    let dateFormat;
    let interval;
    
    switch (period) {
      case 'weekly':
        dateFormat = 'YYYY-IW';  // ISO week
        interval = '12 weeks';
        break;
      case 'monthly':
        dateFormat = 'YYYY-MM';
        interval = '12 months';
        break;
      default:  // daily
        dateFormat = 'YYYY-MM-DD';
        interval = '30 days';
    }

    const result = await db.query(`
      SELECT 
        TO_CHAR(created_at, $1) as period,
        COUNT(*) as count,
        COALESCE(SUM(total_price), 0) as revenue
      FROM reservations 
      WHERE status = 'confirmed'
        AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY TO_CHAR(created_at, $1)
      ORDER BY period DESC
    `, [dateFormat]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Revenue stats error:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/stats/users:
 *   get:
 *     summary: 사용자 통계
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    // 전체 사용자
    const totalResult = await db.query('SELECT COUNT(*) as count FROM users');
    
    // 오늘 가입
    const todayResult = await db.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    // 이번 주 가입
    const weekResult = await db.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
    `);
    
    // 역할별 분포
    const roleResult = await db.query(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `);

    res.json({
      success: true,
      data: {
        total: parseInt(totalResult.rows[0].count),
        today: parseInt(todayResult.rows[0].count),
        thisWeek: parseInt(weekResult.rows[0].count),
        byRole: roleResult.rows,
      },
    });
  } catch (error) {
    logger.error('User stats error:', error);
    next(error);
  }
});

module.exports = router;