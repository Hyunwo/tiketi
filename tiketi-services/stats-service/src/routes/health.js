/**
 * Health Check 라우트
 * 모든 서비스에서 동일하게 사용
 */
const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: 헬스 체크
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서비스 정상
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: 준비 상태 체크 (K8s readiness probe)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서비스 준비 완료
 */
router.get('/ready', (req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: 생존 상태 체크 (K8s liveness probe)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서비스 생존
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
