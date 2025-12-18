require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const swaggerUi = require('swagger-ui-express');

// 공통 라이브러리
const { logger } = require('@tiketi/common');

// 설정
const db = require('./config/database');
const { client: redisClient } = require('./config/redis');
const { initializeSocketIO } = require('./config/socket');
const swaggerSpec = require('./config/swagger');
const { initSeats } = require('./config/init-seats');

// 미들웨어
const errorHandler = require('./middleware/error-handler');
const requestLogger = require('./middleware/request-logger');

// 라우트
const eventsRoutes = require('./routes/events');
const seatsRoutes = require('./routes/seats');
const queueRoutes = require('./routes/queue');
const ticketsRoutes = require('./routes/tickets');
// const imageRoutes = require('./routes/image');
const newsRoutes = require('./routes/news');
const healthRoutes = require('./routes/health');

// 서비스
// // const { startEventStatusUpdater } = require('./services/event-status-updater');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;
const SERVICE_NAME = 'ticket-service';

// Socket.IO 초기화
const io = initializeSocketIO(server);
app.set('io', io);

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
app.use('/api/events', eventsRoutes);
app.use('/api/seats', seatsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/tickets', ticketsRoutes);
// app.use('/api/image', imageRoutes);
app.use('/api/news', newsRoutes);
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
      events: '/api/events',
      seats: '/api/seats',
      queue: '/api/queue',
      tickets: '/api/tickets',
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

    // Redis 연결 테스트
    await redisClient.ping();
    logger.info(`[${SERVICE_NAME}] Redis connected`);

    // 좌석 초기화 (필요시)
    // await initSeats();

    // 이벤트 상태 업데이터 시작
    
    // startEventStatusUpdater() // TODO: 구현 필요;

    server.listen(PORT, () => {
      logger.info(`[${SERVICE_NAME}] Server running on port ${PORT}`);
      logger.info(`[${SERVICE_NAME}] Swagger docs: http://localhost:${PORT}/api-docs`);
      logger.info(`[${SERVICE_NAME}] WebSocket ready`);
    });
  } catch (error) {
    logger.error(`[${SERVICE_NAME}] Failed to start server:`, error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
