require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

// 공통 라이브러리
const { logger } = require('@tiketi/common');

// 설정
const db = require('./config/database');
const swaggerSpec = require('./config/swagger');

// 미들웨어
const errorHandler = require('./middleware/error-handler');
const requestLogger = require('./middleware/request-logger');

// 라우트
const paymentsRoutes = require('./routes/payments');
const reservationsRoutes = require('./routes/reservations');
const healthRoutes = require('./routes/health');

// 서비스
// const { startReservationCleaner } = require('./services/reservation-cleaner');

const app = express();
const PORT = process.env.PORT || 3003;
const SERVICE_NAME = 'payment-service';

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

// Swagger 문서
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 라우트 등록
app.use('/api/payments', paymentsRoutes);
app.use('/api/reservations', reservationsRoutes);
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
      payments: '/api/payments',
      reservations: '/api/reservations',
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

    // 예약 만료 처리 스케줄러 시작
    // startReservationCleaner();

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
