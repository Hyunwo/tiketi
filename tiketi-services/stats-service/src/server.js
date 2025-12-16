require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

// 공통 라이브러리
const { logger } = require('@tiketi/common');

// 설정
const db = require('./config/database');
const { client: redisClient } = require('./config/redis');
const swaggerSpec = require('./config/swagger');

// 미들웨어
const errorHandler = require('./middleware/error-handler');
const requestLogger = require('./middleware/request-logger');

// Metrics (선택적)
// const metricsMiddleware = require('./metrics/middleware');

// 라우트
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3004;
const SERVICE_NAME = 'stats-service';

// 기본 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 요청 로깅
app.use(requestLogger);

// Metrics 미들웨어 (선택적)
// app.use(metricsMiddleware);

// Swagger 문서
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 라우트 등록
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);
app.use('/health', healthRoutes);

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      docs: '/api-docs',
      admin: '/api/admin',
      stats: '/api/stats',
    },
  });
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// 에러 핸들러
app.use(errorHandler);

// 서버 시작
const startServer = async () => {
  try {
    // DB 연결 테스트
    await db.query('SELECT NOW()');
    logger.info(`[${SERVICE_NAME}] Database connected`);

    // Redis 연결 테스트 (선택적)
    try {
      await redisClient.ping();
      logger.info(`[${SERVICE_NAME}] Redis connected`);
    } catch (redisError) {
      logger.warn(`[${SERVICE_NAME}] Redis not available, continuing without cache`);
    }

    app.listen(PORT, () => {
      logger.info(`[${SERVICE_NAME}] Server running on port ${PORT}`);
      logger.info(`[${SERVICE_NAME}] Swagger docs: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Failed to start server:`, error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
