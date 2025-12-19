# 티케티 MSA 전환 가이드

> **프로젝트**: 티케티 티켓 예매 시스템  
> **전환 기간**: 2024.12.16 - 2024.12.19  
> **목표**: Monolithic → MSA (4개 서비스)

---

## 📋 목차

1. [전환 개요](#1-전환-개요)
2. [AS-IS 아키텍처](#2-as-is-아키텍처)
3. [TO-BE 아키텍처](#3-to-be-아키텍처)
4. [전환 과정](#4-전환-과정)
5. [서비스 구성](#5-서비스-구성)
6. [공통 라이브러리](#6-공통-라이브러리)
7. [Kubernetes 배포](#7-kubernetes-배포)
8. [API Gateway](#8-api-gateway)
9. [검증 및 테스트](#9-검증-및-테스트)
10. [문제 해결](#10-문제-해결)
11. [운영 가이드](#11-운영-가이드)

---

## 1. 전환 개요

### 1.1 전환 배경

**기존 Monolithic 구조의 문제점:**
- 모든 기능이 하나의 서버에 집중
- 특정 기능 장애 시 전체 서비스 중단
- 확장성 제한 (수평 확장 어려움)
- 팀 간 개발 충돌 가능성
- 배포 시 전체 서비스 재시작 필요

**MSA 전환 목표:**
- ✅ 서비스별 독립 배포
- ✅ 장애 격리 (Fault Isolation)
- ✅ 수평 확장 가능
- ✅ 팀별 독립 개발
- ✅ 기술 스택 다변화 가능

### 1.2 전환 전략

**단계별 전환 (Strangler Pattern)**

```
Phase 1: 도메인 분석 및 서비스 분리 설계
Phase 2: 공통 라이브러리 추출
Phase 3: 서비스별 코드 분리
Phase 4: Kubernetes 배포 환경 구축
Phase 5: API Gateway 통합
Phase 6: 모니터링 및 검증
```

---

## 2. AS-IS 아키텍처

### 2.1 기존 구조

```
tiketi/
├── backend/                    # 단일 Node.js 서버
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── redis.js
│   │   │   └── swagger.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js         # 인증
│   │   │   ├── events.js       # 이벤트
│   │   │   ├── seats.js        # 좌석
│   │   │   ├── reservations.js # 예약
│   │   │   ├── payments.js     # 결제
│   │   │   └── stats.js        # 통계
│   │   └── server.js           # 단일 진입점
│   └── package.json
├── frontend/                   # React 앱
├── database/                   # DB 초기화 스크립트
└── docker-compose.yml
```

### 2.2 기존 아키텍처 다이어그램

```
┌─────────────┐
│   사용자     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│    Frontend (React)     │
│      Port 3000          │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────────────┐
│   Backend (Node.js)              │
│   Port 3001                      │
│                                  │
│  ┌────────────────────────────┐ │
│  │ Auth + Events + Payments   │ │
│  │ + Reservations + Stats     │ │
│  │ (모든 기능 통합)            │ │
│  └────────────────────────────┘ │
└──────────┬───────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌─────────┐  ┌─────────┐
│PostgreSQL│  │  Redis  │
└─────────┘  └─────────┘
```

### 2.3 기존 시스템 정보

| 항목 | 내용 |
|------|------|
| 언어/프레임워크 | Node.js 18 + Express |
| 데이터베이스 | PostgreSQL 15 |
| 캐시 | Redis (Dragonfly) |
| 배포 방식 | Docker Compose |
| 포트 | 단일 포트 (3001) |
| API 문서 | Swagger (통합) |

---

## 3. TO-BE 아키텍처

### 3.1 새로운 구조

```
tiketi/
├── tiketi-common/              # 공통 라이브러리 ⭐
│   ├── src/
│   │   ├── constants/
│   │   │   └── config.js
│   │   └── utils/
│   │       ├── custom-error.js
│   │       └── logger.js
│   └── package.json
│
├── tiketi-services/            # MSA 서비스들 ⭐
│   ├── auth-service/           # 인증 서비스 (Port 3001)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ticket-service/         # 티켓/이벤트 서비스 (Port 3002)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── routes/
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── payment-service/        # 결제/예약 서비스 (Port 3003)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── routes/
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── stats-service/          # 통계/관리 서비스 (Port 3004)
│       ├── src/
│       │   ├── config/
│       │   ├── middleware/
│       │   ├── routes/
│       │   └── server.js
│       ├── Dockerfile
│       └── package.json
│
├── k8s/                        # Kubernetes Manifests ⭐
│   ├── 00-namespace.yaml
│   ├── 01-configmap.yaml
│   ├── 02-secret.yaml
│   ├── 04-postgres.yaml
│   ├── 05-dragonfly.yaml
│   ├── 06-auth-service.yaml
│   ├── 07-ticket-service.yaml
│   ├── 08-payment-service.yaml
│   ├── 09-stats-service.yaml
│   ├── 10-frontend.yaml
│   └── 14-ingress.yaml         # API Gateway
│
├── frontend/                   # React (기존 유지)
├── backend.legacy/             # 기존 백엔드 (백업용)
├── kind-config.yaml            # Kind 클러스터 설정
└── build-images.sh             # Docker 빌드 스크립트
```

### 3.2 새로운 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────┐
│                       사용자                              │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Nginx Ingress       │
              │  (API Gateway)       │
              │  Port 8080           │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    /api/auth/*    /api/events/*   /api/payments/*
         │               │               │
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ auth-service    │ │ ticket-service  │ │payment-service  │
│  Port 3001      │ │  Port 3002      │ │  Port 3003      │
│                 │ │                 │ │                 │
│ - 회원가입       │ │ - 이벤트 조회    │ │ - 예약 생성      │
│ - 로그인         │ │ - 좌석 선택      │ │ - 결제 처리      │
│ - JWT 발급      │ │ - 대기열         │ │                 │
│                 │ │ - WebSocket     │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         │          /api/stats/*                 │
         │                   │                   │
         │         ┌─────────▼─────────┐         │
         │         │  stats-service    │         │
         │         │   Port 3004       │         │
         │         │                   │         │
         │         │ - 대시보드         │         │
         │         │ - 통계 (관리자)    │         │
         │         └─────────┬─────────┘         │
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
          ┌─────────────┐        ┌─────────────┐
          │ PostgreSQL  │        │ Dragonfly   │
          │  Port 5432  │        │ (Redis)     │
          │             │        │  Port 6379  │
          └─────────────┘        └─────────────┘
```

### 3.3 서비스 포트 매핑

| 서비스 | 컨테이너 포트 | K8s Service | Ingress 경로 | 역할 |
|--------|--------------|-------------|--------------|------|
| **auth-service** | 3001 | ClusterIP | `/api/auth/*` | 인증/인가 |
| **ticket-service** | 3002 | ClusterIP | `/api/events/*`, `/api/seats/*` | 이벤트/티켓 |
| **payment-service** | 3003 | ClusterIP | `/api/payments/*`, `/api/reservations/*` | 결제/예약 |
| **stats-service** | 3004 | ClusterIP | `/api/stats/*` | 통계/관리 |
| **Ingress** | - | LoadBalancer | `localhost:8080` | **통합 진입점** |
| frontend | 3000 | NodePort | `localhost:3000` | React UI |
| postgres | 5432 | ClusterIP | - | 데이터베이스 |
| dragonfly | 6379 | ClusterIP | - | Redis 캐시 |

---

## 4. 전환 과정

### 4.1 Phase 1: 도메인 분석 및 설계

#### 4.1.1 도메인 분리 기준

**Bounded Context 분석:**

```
1. 인증/인가 (Authentication/Authorization)
   - 회원가입, 로그인
   - JWT 발급/검증
   - 사용자 관리
   → auth-service

2. 이벤트/티켓 (Event/Ticket Management)
   - 이벤트 CRUD
   - 좌석 조회/선택
   - 대기열 관리
   - WebSocket 실시간 통신
   → ticket-service

3. 예약/결제 (Reservation/Payment)
   - 예약 생성/취소
   - 결제 처리
   - 예약 내역 조회
   → payment-service

4. 통계/관리 (Statistics/Admin)
   - 대시보드
   - 매출 통계
   - 관리자 기능
   → stats-service
```

#### 4.1.2 서비스 간 의존성 분석

```
auth-service (기반 서비스)
  ↓ JWT 검증
  ├─→ ticket-service
  ├─→ payment-service
  └─→ stats-service

ticket-service ←→ payment-service
  (이벤트 정보 ↔ 예약 정보)

payment-service → stats-service
  (결제 데이터 → 통계)
```

**통신 방식:**
- **Sync**: HTTP REST API (Ingress 통해)
- **Async**: Redis Pub/Sub (필요시)
- **Auth**: JWT 토큰 기반

### 4.2 Phase 2: 공통 라이브러리 추출

#### 4.2.1 공통 코드 분석

**중복 코드 식별:**
```javascript
// 모든 서비스에서 공통으로 사용하는 것들
1. JWT_SECRET, DB_POOL_SIZE 등 설정값
2. Winston 로거 설정
3. CustomError 클래스
4. 공통 미들웨어
```

#### 4.2.2 tiketi-common 생성

```bash
# 1. 공통 라이브러리 디렉토리 생성
mkdir -p tiketi-common/src/{constants,utils}

# 2. package.json 생성
cd tiketi-common
cat > package.json << 'EOF'
{
  "name": "@tiketi/common",
  "version": "1.0.0",
  "main": "src/index.js",
  "dependencies": {
    "winston": "^3.11.0"
  }
}
EOF

# 3. 공통 코드 작성
# src/constants/config.js
# src/utils/logger.js
# src/utils/custom-error.js

# 4. index.js에서 export
cat > src/index.js << 'EOF'
module.exports = {
  CONFIG: require('./constants/config'),
  logger: require('./utils/logger'),
  CustomError: require('./utils/custom-error'),
};
EOF

# 5. 의존성 설치
npm install
```

#### 4.2.3 공통 라이브러리 구조

```
tiketi-common/
├── src/
│   ├── index.js                 # 진입점
│   ├── constants/
│   │   └── config.js            # 공통 설정
│   └── utils/
│       ├── custom-error.js      # 커스텀 에러
│       └── logger.js            # Winston 로거
└── package.json
```

**config.js 예시:**
```javascript
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret',
  DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE) || 20,
  CACHE_SETTINGS: {
    EVENT_LIST_TTL: 300,        // 5분
    EVENT_DETAIL_TTL: 60,       // 1분
    SEAT_STATUS_TTL: 10,        // 10초
  },
};
```

### 4.3 Phase 3: 서비스별 코드 분리

#### 4.3.1 서비스 생성 템플릿

```bash
# 서비스 생성 스크립트
SERVICE_NAME="auth-service"
PORT="3001"

mkdir -p tiketi-services/$SERVICE_NAME/src/{config,middleware,routes}

# package.json 생성
cat > tiketi-services/$SERVICE_NAME/package.json << EOF
{
  "name": "tiketi-$SERVICE_NAME",
  "version": "1.0.0",
  "main": "src/server.js",
  "dependencies": {
    "@tiketi/common": "file:../../tiketi-common",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "ioredis": "^5.3.2"
  }
}
EOF

# server.js 생성
cat > tiketi-services/$SERVICE_NAME/src/server.js << 'EOF'
const express = require('express');
const { logger } = require('@tiketi/common');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
EOF
```

#### 4.3.2 auth-service 분리

**이동할 파일:**
```bash
# 기존 backend/src → tiketi-services/auth-service/src

routes/auth.js         → routes/auth.js
middleware/auth.js     → middleware/auth.js
config/init-admin.js   → config/init-admin.js
```

**변경 사항:**
```javascript
// 변경 전
const JWT_SECRET = process.env.JWT_SECRET;
const logger = require('../utils/logger');

// 변경 후
const { CONFIG, logger } = require('@tiketi/common');
const JWT_SECRET = CONFIG.JWT_SECRET;
```

**중요 수정 목록:**

1. **함수명 통일**
```javascript
// init-admin.js
// Before: exports.initAdmin = ...
// After:  exports.initializeAdmin = ...

// server.js
// Before: const { initAdmin } = require('./config/init-admin');
// After:  const { initializeAdmin } = require('./config/init-admin');
```

2. **환경변수 통합**
```javascript
// .env
PORT=3001
DB_HOST=postgres-service
DB_USER=tiketi
DB_PASSWORD=tiketi123
JWT_SECRET=tiketi-super-secret-jwt-key-2024
```

3. **Swagger 설정**
```javascript
// config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auth Service API',
      version: '1.0.0',
    },
    servers: [{ url: 'http://localhost:3001' }],
  },
  apis: ['./src/routes/*.js'],
};
```

#### 4.3.3 ticket-service 분리

**이동할 파일:**
```bash
routes/events.js       → routes/events.js
routes/seats.js        → routes/seats.js
routes/queue.js        → routes/queue.js
config/socket.js       → config/socket.js
config/redis.js        → config/redis.js
```

**주요 수정:**

1. **Socket.IO 함수명**
```javascript
// Before
exports.initSocket = (server) => { ... }

// After
exports.initializeSocketIO = (server) => { ... }
```

2. **비활성화 기능 주석 처리**
```javascript
// server.js
// await startEventStatusUpdater();  // TODO: 구현 필요

// routes/events.js (이미지 업로드)
// const imageRoutes = require('./routes/image');
// app.use('/api/image', imageRoutes);
```

3. **Redis 연결**
```javascript
// config/redis.js
const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});
```

#### 4.3.4 payment-service 분리

**이동할 파일:**
```bash
routes/reservations.js → routes/reservations.js
routes/payments.js     → routes/payments.js
```

**주요 수정:**

1. **Socket.IO 스텁 생성**
```javascript
// config/socket.js (payment-service는 실제 Socket 사용 안 함)
const emitToEvent = (eventId, eventName, data) => {
  // 스텁 - 아무 작업도 하지 않음
  return;
};

module.exports = { emitToEvent };
```

2. **uuid 버전 다운그레이드**
```json
// package.json
{
  "dependencies": {
    "uuid": "9.0.0"  // v10+는 ES Module 문제
  }
}
```

3. **비활성화 기능**
```javascript
// server.js
// await startReservationCleaner();  // TODO: 구현 필요
```

#### 4.3.5 stats-service 분리

**이동할 파일:**
```bash
routes/stats.js        → routes/stats.js
routes/admin.js        → routes/admin.js
middleware/auth.js     → middleware/auth.js (requireAdmin 추가)
```

**주요 수정:**

1. **미들웨어 함수 추가**
```javascript
// middleware/auth.js
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: '관리자 권한이 필요합니다.' 
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin,
  isAdmin: requireAdmin,  // Alias for compatibility
};
```

2. **DB 컬럼명 수정**
```javascript
// routes/stats.js
// Before: SUM(total_price)
// After:  SUM(total_amount)

const revenueResult = await db.query(`
  SELECT COALESCE(SUM(total_amount), 0) as total 
  FROM reservations 
  WHERE status = 'confirmed'
`);
```

### 4.4 Phase 4: Docker 이미지 빌드

#### 4.4.1 Dockerfile 작성

**각 서비스의 Dockerfile (공통 패턴):**

```dockerfile
FROM node:18-alpine

# 네이티브 빌드 도구 설치 (bcrypt 등을 위해)
RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

# 프로젝트 전체 복사
COPY . .

# tiketi-common 설치
WORKDIR /app/tiketi-common
RUN rm -rf node_modules && npm install

# 서비스 설치
WORKDIR /app/tiketi-services/SERVICE_NAME
RUN rm -rf node_modules && npm install

EXPOSE PORT

CMD ["node", "src/server.js"]
```

**주요 포인트:**

1. **네이티브 빌드**
   - `python3 make g++` 설치 필수
   - bcrypt, sharp 등 네이티브 모듈 빌드 필요

2. **전체 복사 방식**
   - 로컬 node_modules 제외
   - 컨테이너 내에서 npm install
   - 플랫폼 불일치 문제 해결

3. **멀티 스테이지 빌드 미사용**
   - 개발 단계에서는 단순 구조 유지
   - 프로덕션 시 최적화 고려

#### 4.4.2 빌드 스크립트

```bash
#!/bin/bash
# build-images.sh

echo "🐳 Building Docker images for MSA services..."

# tiketi-common 준비
cd tiketi-common
npm install --production
cd ..

# 각 서비스 빌드
for service in auth-service ticket-service payment-service stats-service; do
  echo "🔨 Building tiketi-$service..."
  
  case $service in
    auth-service) port=3001 ;;
    ticket-service) port=3002 ;;
    payment-service) port=3003 ;;
    stats-service) port=3004 ;;
  esac
  
  docker build \
    -t tiketi-$service:latest \
    -f tiketi-services/$service/Dockerfile \
    .
  
  if [ $? -eq 0 ]; then
    echo "✅ tiketi-$service built successfully"
  else
    echo "❌ Failed to build tiketi-$service"
    exit 1
  fi
done

echo "✅ All images built successfully!"
docker images | grep tiketi-
```

### 4.5 Phase 5: Kubernetes 배포 환경 구축

#### 4.5.1 Kind 클러스터 설정

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: tiketi-local
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      # Ingress HTTP/HTTPS
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
      # MSA Services (fallback)
      - containerPort: 30001
        hostPort: 30001
        protocol: TCP
      - containerPort: 30002
        hostPort: 30002
        protocol: TCP
      - containerPort: 30003
        hostPort: 30003
        protocol: TCP
      - containerPort: 30004
        hostPort: 30004
        protocol: TCP
      # Frontend
      - containerPort: 30080
        hostPort: 3000
        protocol: TCP
  - role: worker
    labels:
      workload: application
  - role: worker
    labels:
      workload: data
```

#### 4.5.2 Kubernetes Manifests

**기본 리소스:**

```yaml
# 00-namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tiketi
```

```yaml
# 01-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tiketi-config
  namespace: tiketi
data:
  # Database
  DB_HOST: postgres-service
  DB_PORT: "5432"
  DB_NAME: tiketi
  POSTGRES_DB: tiketi
  POSTGRES_USER: tiketi_user
  
  # Redis
  REDIS_HOST: dragonfly-service
  REDIS_PORT: "6379"
  
  # Application
  NODE_ENV: development
```

```yaml
# 02-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: tiketi-secret
  namespace: tiketi
type: Opaque
stringData:
  DB_PASSWORD: tiketi_pass
  POSTGRES_PASSWORD: tiketi_pass
  JWT_SECRET: your-super-secret-jwt-key-change-this-in-production
  ADMIN_EMAIL: admin@tiketi.gg
  ADMIN_PASSWORD: admin123
```

**서비스별 Deployment (예: auth-service):**

```yaml
# 06-auth-service.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: tiketi
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
        tier: backend
    spec:
      initContainers:
        - name: wait-for-postgres
          image: busybox:1.36
          command: 
            - sh
            - -c
            - until nc -z postgres-service 5432; do echo waiting for postgres; sleep 2; done
      containers:
        - name: auth-service
          image: tiketi-auth-service:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3001
              name: http
          env:
            - name: PORT
              value: "3001"
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: tiketi-config
                  key: DB_HOST
            - name: DB_PORT
              valueFrom:
                configMapKeyRef:
                  name: tiketi-config
                  key: DB_PORT
            - name: DB_NAME
              valueFrom:
                configMapKeyRef:
                  name: tiketi-config
                  key: POSTGRES_DB
            - name: DB_USER
              valueFrom:
                configMapKeyRef:
                  name: tiketi-config
                  key: POSTGRES_USER
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: tiketi-secret
                  key: POSTGRES_PASSWORD
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: tiketi-secret
                  key: JWT_SECRET
            - name: ADMIN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: tiketi-secret
                  key: ADMIN_EMAIL
            - name: ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: tiketi-secret
                  key: ADMIN_PASSWORD
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: tiketi
spec:
  type: ClusterIP
  selector:
    app: auth-service
  ports:
    - port: 3001
      targetPort: 3001
      name: http
```

**주요 설계 결정:**

1. **initContainers**
   - PostgreSQL 준비 대기
   - DragonflyDB 준비 대기

2. **환경변수 관리**
   - ConfigMap: 민감하지 않은 설정
   - Secret: 비밀번호, JWT Secret 등

3. **Health Check**
   - livenessProbe: 컨테이너 재시작 판단
   - readinessProbe: 트래픽 전송 준비 판단

4. **Resource Limits**
   - requests: 최소 보장 자원
   - limits: 최대 사용 가능 자원

### 4.6 Phase 6: API Gateway 구축

#### 4.6.1 Nginx Ingress 설치

```bash
# Nginx Ingress Controller 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# 준비 대기
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

#### 4.6.2 Ingress 리소스 정의

```yaml
# 14-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tiketi-ingress
  namespace: tiketi
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      # Auth Service
      - path: /api/auth
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 3001
      
      # Swagger Docs
      - path: /api-docs
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 3001
      
      # Ticket Service - events
      - path: /api/events
        pathType: Prefix
        backend:
          service:
            name: ticket-service
            port:
              number: 3002
      
      # Ticket Service - seats
      - path: /api/seats
        pathType: Prefix
        backend:
          service:
            name: ticket-service
            port:
              number: 3002
      
      # Ticket Service - tickets
      - path: /api/tickets
        pathType: Prefix
        backend:
          service:
            name: ticket-service
            port:
              number: 3002
      
      # Ticket Service - queue
      - path: /api/queue
        pathType: Prefix
        backend:
          service:
            name: ticket-service
            port:
              number: 3002
      
      # Payment Service - payments
      - path: /api/payments
        pathType: Prefix
        backend:
          service:
            name: payment-service
            port:
              number: 3003
      
      # Payment Service - reservations
      - path: /api/reservations
        pathType: Prefix
        backend:
          service:
            name: payment-service
            port:
              number: 3003
      
      # Stats Service
      - path: /api/stats
        pathType: Prefix
        backend:
          service:
            name: stats-service
            port:
              number: 3004
      
      # Health Check
      - path: /health
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 3001
```

**라우팅 규칙:**

| 경로 | 대상 서비스 | 설명 |
|------|------------|------|
| `/api/auth/*` | auth-service:3001 | 인증 관련 |
| `/api/events/*` | ticket-service:3002 | 이벤트 |
| `/api/seats/*` | ticket-service:3002 | 좌석 |
| `/api/queue/*` | ticket-service:3002 | 대기열 |
| `/api/payments/*` | payment-service:3003 | 결제 |
| `/api/reservations/*` | payment-service:3003 | 예약 |
| `/api/stats/*` | stats-service:3004 | 통계 |
| `/api-docs` | auth-service:3001 | Swagger |
| `/health` | auth-service:3001 | Health |

---

## 5. 서비스 구성

### 5.1 auth-service (인증 서비스)

**책임 (Responsibility):**
- 사용자 인증 (회원가입, 로그인)
- JWT 토큰 발급 및 검증
- 관리자 계정 초기화

**API 엔드포인트:**
```
POST   /api/auth/register     # 회원가입
POST   /api/auth/login        # 로그인
GET    /health                # Health Check
GET    /api-docs              # Swagger UI
```

**의존성:**
- PostgreSQL (사용자 정보 저장)
- tiketi-common (JWT 설정, 로거)

**환경변수:**
```env
PORT=3001
DB_HOST=postgres-service
DB_NAME=tiketi
DB_USER=tiketi_user
DB_PASSWORD=tiketi_pass
JWT_SECRET=your-secret-key
ADMIN_EMAIL=admin@tiketi.gg
ADMIN_PASSWORD=admin123
```

**주요 기능:**

1. **회원가입**
```javascript
// POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "사용자"
}

// Response
{
  "message": "회원가입 성공",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "사용자",
    "role": "user"
  }
}
```

2. **로그인**
```javascript
// POST /api/auth/login
{
  "email": "admin@tiketi.gg",
  "password": "admin123"
}

// Response
{
  "message": "로그인 성공",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@tiketi.gg",
    "name": "관리자",
    "role": "admin"
  }
}
```

### 5.2 ticket-service (티켓/이벤트 서비스)

**책임:**
- 이벤트 CRUD
- 좌석 조회 및 선택
- 대기열 관리
- WebSocket 실시간 통신

**API 엔드포인트:**
```
GET    /api/events            # 이벤트 목록
GET    /api/events/:id        # 이벤트 상세
POST   /api/events            # 이벤트 생성 (관리자)
PUT    /api/events/:id        # 이벤트 수정 (관리자)
DELETE /api/events/:id        # 이벤트 삭제 (관리자)

GET    /api/seats             # 좌석 조회
POST   /api/seats/:id/reserve # 좌석 예약

POST   /api/queue/check/:eventId  # 대기열 진입
GET    /api/queue/status/:eventId # 대기열 상태

GET    /health                # Health Check
```

**의존성:**
- PostgreSQL (이벤트, 좌석 정보)
- DragonflyDB (캐싱, 대기열)
- Socket.IO (실시간 통신)

**환경변수:**
```env
PORT=3002
DB_HOST=postgres-service
DB_NAME=tiketi
DB_USER=tiketi_user
DB_PASSWORD=tiketi_pass
REDIS_HOST=dragonfly-service
REDIS_PORT=6379
JWT_SECRET=your-secret-key
```

**주요 기능:**

1. **이벤트 목록 조회**
```javascript
// GET /api/events?status=on_sale&limit=10
{
  "events": [
    {
      "id": "uuid",
      "title": "2024 콘서트 투어 in 서울",
      "venue": "올림픽공원 체조경기장",
      "event_date": "2024-12-31T19:00:00.000Z",
      "status": "on_sale",
      "min_price": 50000,
      "max_price": 150000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

2. **대기열 진입**
```javascript
// POST /api/queue/check/:eventId
// Headers: Authorization: Bearer <token>

{
  "status": "active",
  "message": "즉시 입장 가능합니다.",
  "position": 0,
  "estimatedWaitTime": 0
}
```

### 5.3 payment-service (결제/예약 서비스)

**책임:**
- 예약 생성 및 취소
- 결제 처리
- 예약 내역 관리

**API 엔드포인트:**
```
POST   /api/reservations      # 예약 생성
GET    /api/reservations      # 예약 목록
GET    /api/reservations/:id  # 예약 상세
DELETE /api/reservations/:id  # 예약 취소

POST   /api/payments          # 결제 처리
GET    /api/payments          # 결제 내역

GET    /health                # Health Check
```

**의존성:**
- PostgreSQL (예약, 결제 정보)
- DragonflyDB (예약 만료 관리)

**환경변수:**
```env
PORT=3003
DB_HOST=postgres-service
DB_NAME=tiketi
DB_USER=tiketi_user
DB_PASSWORD=tiketi_pass
REDIS_HOST=dragonfly-service
REDIS_PORT=6379
JWT_SECRET=your-secret-key
```

**주요 기능:**

1. **예약 생성**
```javascript
// POST /api/reservations
// Headers: Authorization: Bearer <token>
{
  "eventId": "uuid",
  "seats": [
    { "seatId": "uuid", "ticketTypeId": "uuid" }
  ]
}

// Response
{
  "success": true,
  "reservation": {
    "id": "uuid",
    "reservationNumber": "R20241219-001",
    "totalAmount": 100000,
    "status": "pending",
    "expiresAt": "2024-12-19T10:15:00Z"
  }
}
```

2. **결제 처리**
```javascript
// POST /api/payments
{
  "reservationId": "uuid",
  "paymentMethod": "card",
  "amount": 100000
}

// Response
{
  "success": true,
  "payment": {
    "id": "uuid",
    "status": "completed",
    "paidAt": "2024-12-19T10:05:00Z"
  }
}
```

### 5.4 stats-service (통계/관리 서비스)

**책임:**
- 관리자 대시보드
- 매출 통계
- 사용자 통계
- 이벤트별 통계

**API 엔드포인트:**
```
GET    /api/stats/dashboard       # 대시보드 (관리자)
GET    /api/stats/events/:id      # 이벤트별 통계 (관리자)
GET    /api/stats/revenue         # 매출 통계 (관리자)
GET    /api/stats/users           # 사용자 통계 (관리자)

GET    /health                    # Health Check
```

**의존성:**
- PostgreSQL (통계 데이터 조회)
- DragonflyDB (캐싱)

**환경변수:**
```env
PORT=3004
DB_HOST=postgres-service
DB_NAME=tiketi
DB_USER=tiketi_user
DB_PASSWORD=tiketi_pass
REDIS_HOST=dragonfly-service
REDIS_PORT=6379
JWT_SECRET=your-secret-key
```

**주요 기능:**

1. **대시보드 통계**
```javascript
// GET /api/stats/dashboard
// Headers: Authorization: Bearer <admin-token>

{
  "success": true,
  "data": {
    "totalEvents": 25,
    "totalReservations": 1234,
    "totalUsers": 5678,
    "todayReservations": 89,
    "totalRevenue": 123456789,
    "updatedAt": "2024-12-19T10:00:00Z"
  }
}
```

---

## 6. 공통 라이브러리

### 6.1 tiketi-common 구조

```
tiketi-common/
├── src/
│   ├── index.js                # Export 진입점
│   ├── constants/
│   │   └── config.js           # 공통 설정값
│   └── utils/
│       ├── custom-error.js     # 커스텀 에러 클래스
│       └── logger.js           # Winston 로거
└── package.json
```

### 6.2 주요 모듈

#### 6.2.1 config.js (공통 설정)

```javascript
// src/constants/config.js
module.exports = {
  // JWT 설정
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  JWT_EXPIRES_IN: '7d',
  
  // Database Pool
  DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE) || 20,
  DB_IDLE_TIMEOUT: 30000,
  DB_CONNECTION_TIMEOUT: 10000,
  
  // Cache TTL (초)
  CACHE_SETTINGS: {
    EVENT_LIST_TTL: 300,        // 5분
    EVENT_DETAIL_TTL: 60,       // 1분
    SEAT_STATUS_TTL: 10,        // 10초
    USER_SESSION_TTL: 3600,     // 1시간
  },
  
  // Queue 설정
  QUEUE_SETTINGS: {
    MAX_CONCURRENT_USERS: 100,
    POSITION_CHECK_INTERVAL: 5000,
  },
  
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
};
```

#### 6.2.2 logger.js (Winston 로거)

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

module.exports = logger;
```

#### 6.2.3 custom-error.js (커스텀 에러)

```javascript
// src/utils/custom-error.js
class CustomError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = CustomError;
```

### 6.3 사용 방법

#### 6.3.1 설치

```json
// 각 서비스의 package.json
{
  "dependencies": {
    "@tiketi/common": "file:../../tiketi-common"
  }
}
```

```bash
cd tiketi-services/auth-service
npm install
```

#### 6.3.2 Import

```javascript
// 서비스 코드에서
const { CONFIG, logger, CustomError } = require('@tiketi/common');

// 사용 예시
const JWT_SECRET = CONFIG.JWT_SECRET;
logger.info('Server started');
throw new CustomError('Invalid input', 400);
```

### 6.4 공통 라이브러리 업데이트 시나리오

**시나리오: JWT Secret 기본값 변경**

```bash
# 1. tiketi-common 수정
cd tiketi-common
vim src/constants/config.js
# JWT_SECRET 기본값 변경

# 2. 버전 업데이트
npm version patch  # 1.0.0 → 1.0.1

# 3. 각 서비스 재설치 (자동)
cd ../tiketi-services/auth-service
npm install  # tiketi-common 자동 업데이트

# 4. Docker 이미지 재빌드
cd ../../
./build-images.sh

# 5. K8s 재배포
kind load docker-image tiketi-auth-service:latest --name tiketi-local
kubectl delete pod -n tiketi -l app=auth-service
```

**자동화 스크립트:**

```bash
#!/bin/bash
# update-common-library.sh

echo "📦 Updating tiketi-common..."

# 1. tiketi-common 버전 업
cd tiketi-common
npm version patch
COMMON_VERSION=$(node -p "require('./package.json').version")
cd ..

# 2. 모든 서비스 업데이트
for service in auth-service ticket-service payment-service stats-service; do
  echo "Updating $service..."
  cd tiketi-services/$service
  npm install @tiketi/common@file:../../tiketi-common
  cd ../..
done

# 3. Docker 이미지 재빌드
./build-images.sh

# 4. K8s 재배포
for service in auth-service ticket-service payment-service stats-service; do
  kubectl delete pod -n tiketi -l app=$service
done

echo "✅ tiketi-common updated to v$COMMON_VERSION"
```

---

## 7. Kubernetes 배포

### 7.1 배포 순서

```bash
cd ~/ktcloud/project-ticketing

# 1. Kind 클러스터 생성
kind create cluster --name tiketi-local --config kind-config.yaml

# 2. Docker 이미지 빌드
./build-images.sh

# 3. 이미지 Kind로 로드
kind load docker-image tiketi-auth-service:latest --name tiketi-local
kind load docker-image tiketi-ticket-service:latest --name tiketi-local
kind load docker-image tiketi-payment-service:latest --name tiketi-local
kind load docker-image tiketi-stats-service:latest --name tiketi-local

# 4. K8s 리소스 배포
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl apply -f k8s/03-pvc.yaml
kubectl apply -f k8s/04-postgres.yaml
kubectl apply -f k8s/05-dragonfly.yaml

# 5. DB 준비 대기
sleep 30

# 6. MSA 서비스 배포
kubectl apply -f k8s/06-auth-service.yaml
kubectl apply -f k8s/07-ticket-service.yaml
kubectl apply -f k8s/08-payment-service.yaml
kubectl apply -f k8s/09-stats-service.yaml

# 7. Nginx Ingress 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s

# 8. Ingress 리소스 배포
kubectl apply -f k8s/14-ingress.yaml

# 9. 상태 확인
kubectl get pods -n tiketi
kubectl get svc -n tiketi
kubectl get ingress -n tiketi
```

### 7.2 포트포워딩

```bash
# Ingress (Backend API)
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80 &

# Frontend (선택)
kubectl port-forward -n tiketi svc/frontend-service 3000:3000 &
```

### 7.3 배포 검증

```bash
# Pod 상태 확인
kubectl get pods -n tiketi

# 예상 출력:
# NAME                               READY   STATUS    RESTARTS   AGE
# auth-service-xxx                   1/1     Running   0          2m
# ticket-service-xxx                 1/1     Running   0          2m
# payment-service-xxx                1/1     Running   0          2m
# stats-service-xxx                  1/1     Running   0          2m
# postgres-xxx                       1/1     Running   0          3m
# dragonfly-xxx                      1/1     Running   0          3m

# Health Check
curl http://localhost:8080/health
curl http://localhost:8080/api/auth/health
curl http://localhost:8080/api/events/health
```

---

## 8. API Gateway

### 8.1 Ingress 라우팅 정책

**경로 기반 라우팅:**

```
┌──────────────────────────────────────┐
│   http://localhost:8080              │
│   (Nginx Ingress)                    │
└─────────────┬────────────────────────┘
              │
     ┌────────┴────────┐
     │  Path Matching  │
     └────────┬────────┘
              │
   ┌──────────┼──────────┐
   │          │          │
/api/auth  /api/events  /api/stats
   │          │          │
   ▼          ▼          ▼
auth-svc  ticket-svc  stats-svc
```

### 8.2 보안 정책

**1. JWT 검증 흐름:**

```
Client → Ingress → Service
  |         |         |
  |         |      JWT 검증
  |         |         |
  |         |    ✅ or ❌
  |         |         |
  |    (passthrough)  |
  |         |         |
  └─────────┴─────────┘
```

**2. 서비스 간 통신:**

```
ticket-service → payment-service
       ↓
   Internal Call
   (ClusterIP)
       ↓
   No JWT needed
   (Trust Zone)
```

**3. CORS 설정:**

```javascript
// 각 서비스에서
app.use(cors({
  origin: '*',  // 개발: 모든 origin 허용
  credentials: true,
}));
```

### 8.3 통신 프로토콜

**HTTP REST:**
- 동기 통신
- 서비스 간 직접 호출
- Ingress를 통한 외부 접근

**Redis Pub/Sub (선택):**
- 비동기 이벤트 전파
- 예: 예약 완료 → 좌석 상태 업데이트

---

## 9. 검증 및 테스트

### 9.1 Health Check

```bash
# 모든 서비스 Health Check
for port in 3001 3002 3003 3004; do
  echo "Checking service on port $port..."
  curl -s http://localhost:8080/health | jq .
done
```

### 9.2 API 테스트

#### 9.2.1 인증 테스트

```bash
# 로그인
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tiketi.gg",
    "password": "admin123"
  }' | jq -r '.token')

echo "Token: ${TOKEN:0:20}..."
```

#### 9.2.2 이벤트 조회

```bash
# 이벤트 목록
curl -s http://localhost:8080/api/events | jq '.events[0]'

# 이벤트 상세
curl -s http://localhost:8080/api/events/EVENT_ID | jq .
```

#### 9.2.3 통계 (관리자)

```bash
# 대시보드
curl -s http://localhost:8080/api/stats/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 9.3 Swagger 문서

```
http://localhost:8080/api-docs
```

각 서비스별 Swagger:
- Auth: 포트포워딩 후 `localhost:3001/api-docs`
- Ticket: 포트포워딩 후 `localhost:3002/api-docs`
- Payment: 포트포워딩 후 `localhost:3003/api-docs`
- Stats: 포트포워딩 후 `localhost:3004/api-docs`

### 9.4 부하 테스트 (선택)

```bash
# Apache Bench
ab -n 1000 -c 10 http://localhost:8080/api/events

# 또는 k6
k6 run load-test.js
```

---

## 10. 문제 해결

### 10.1 주요 문제 및 해결

#### 10.1.1 bcrypt 네이티브 바이너리 문제

**증상:**
```
Error loading shared library bcrypt_lib.node: Exec format error
```

**원인:**
- Mac에서 빌드된 bcrypt → Linux 컨테이너 실행 불가

**해결:**
```dockerfile
# Dockerfile에 네이티브 빌드 도구 추가
RUN apk add --no-cache python3 make g++

# 컨테이너 내에서 npm install
RUN rm -rf node_modules && npm install
```

#### 10.1.2 uuid ES Module 문제

**증상:**
```
Error [ERR_REQUIRE_ESM]: require() of ES Module uuid/index.js not supported
```

**원인:**
- uuid v10+ = ES Module
- CommonJS에서 require() 불가

**해결:**
```bash
# uuid 다운그레이드
npm uninstall uuid
npm install uuid@9.0.0
```

#### 10.1.3 Ingress 경로 문제

**증상:**
```
Cannot POST /login
```

**원인:**
- Ingress rewrite로 `/api/auth/login` → `/login` 변환
- 서비스는 `/api/auth/login` 기대

**해결:**
```yaml
# Ingress에서 rewrite 제거
spec:
  rules:
  - http:
      paths:
      - path: /api/auth    # rewrite 없이
        pathType: Prefix
```

#### 10.1.4 DB 컬럼명 불일치

**증상:**
```
column "total_price" does not exist
```

**원인:**
- 코드에서 `total_price` 사용
- DB에는 `total_amount` 컬럼

**해결:**
```bash
# 코드에서 일괄 변경
sed -i 's/total_price/total_amount/g' src/routes/stats.js
```

### 10.2 트러블슈팅 가이드

#### Pod이 Running이 안 될 때

```bash
# 1. Pod 상태 확인
kubectl get pods -n tiketi

# 2. 상세 정보
kubectl describe pod POD_NAME -n tiketi

# 3. 로그 확인
kubectl logs POD_NAME -n tiketi

# 4. 이전 컨테이너 로그 (CrashLoopBackOff)
kubectl logs POD_NAME -n tiketi --previous
```

#### 서비스 접근 안 될 때

```bash
# 1. Service 확인
kubectl get svc -n tiketi

# 2. Endpoints 확인
kubectl get endpoints -n tiketi

# 3. 포트포워딩 테스트
kubectl port-forward -n tiketi svc/auth-service 3001:3001
curl http://localhost:3001/health
```

#### Ingress 문제

```bash
# 1. Ingress 상태
kubectl get ingress -n tiketi

# 2. Ingress 상세
kubectl describe ingress tiketi-ingress -n tiketi

# 3. Ingress Controller 로그
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

---

## 11. 운영 가이드

### 11.1 일상 운영 명령어

```bash
# Pod 상태 확인
kubectl get pods -n tiketi

# 로그 확인 (실시간)
kubectl logs -f -n tiketi -l app=auth-service

# Pod 재시작
kubectl delete pod -n tiketi -l app=auth-service

# 서비스 스케일링
kubectl scale deployment auth-service -n tiketi --replicas=3
```

### 11.2 업데이트 배포

```bash
# 1. 코드 수정 후 이미지 재빌드
./build-images.sh

# 2. Kind로 이미지 로드
kind load docker-image tiketi-auth-service:latest --name tiketi-local

# 3. Pod 재시작 (새 이미지 사용)
kubectl rollout restart deployment/auth-service -n tiketi

# 4. 배포 상태 확인
kubectl rollout status deployment/auth-service -n tiketi
```

### 11.3 백업 및 복구

```bash
# PostgreSQL 백업
kubectl exec -n tiketi $(kubectl get pod -n tiketi -l app=postgres -o name) -- \
  pg_dump -U tiketi_user tiketi > backup.sql

# 복구
kubectl exec -i -n tiketi $(kubectl get pod -n tiketi -l app=postgres -o name) -- \
  psql -U tiketi_user tiketi < backup.sql
```

### 11.4 모니터링

```bash
# 리소스 사용량
kubectl top pods -n tiketi
kubectl top nodes

# 이벤트 확인
kubectl get events -n tiketi --sort-by='.lastTimestamp'
```

---

## 12. 부록

### 12.1 전체 디렉토리 구조

```
tiketi/
├── tiketi-common/
│   ├── src/
│   │   ├── index.js
│   │   ├── constants/
│   │   │   └── config.js
│   │   └── utils/
│   │       ├── custom-error.js
│   │       └── logger.js
│   └── package.json
│
├── tiketi-services/
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── database.js
│   │   │   │   ├── init-admin.js
│   │   │   │   └── swagger.js
│   │   │   ├── middleware/
│   │   │   │   └── auth.js
│   │   │   ├── routes/
│   │   │   │   ├── auth.js
│   │   │   │   └── health.js
│   │   │   └── server.js
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ticket-service/
│   ├── payment-service/
│   └── stats-service/
│
├── k8s/
│   ├── 00-namespace.yaml
│   ├── 01-configmap.yaml
│   ├── 02-secret.yaml
│   ├── 03-pvc.yaml
│   ├── 04-postgres.yaml
│   ├── 05-dragonfly.yaml
│   ├── 06-auth-service.yaml
│   ├── 07-ticket-service.yaml
│   ├── 08-payment-service.yaml
│   ├── 09-stats-service.yaml
│   ├── 10-frontend.yaml
│   └── 14-ingress.yaml
│
├── frontend/
├── backend.legacy/
├── kind-config.yaml
├── build-images.sh
└── README.md
```

### 12.2 참고 자료

- **Kind**: https://kind.sigs.k8s.io/
- **Nginx Ingress**: https://kubernetes.github.io/ingress-nginx/
- **Express.js**: https://expressjs.com/
- **PostgreSQL**: https://www.postgresql.org/
- **Winston**: https://github.com/winstonjs/winston

---

**작성일**: 2024.12.19  
**버전**: 1.0  
**작성자**: 현우