# @tiketi/common

> 티케티(Tiketi) MSA 공통 라이브러리

모든 MSA 서비스(Auth, Ticket, Payment, Stats)에서 공유하는 상수와 유틸리티를 제공합니다.

## 📦 설치

```bash
# npm
npm install @tiketi/common

# yarn
yarn add @tiketi/common

# GitHub Packages 사용 시 .npmrc 설정 필요
echo "@tiketi:registry=https://npm.pkg.github.com" >> .npmrc
```

## 🚀 사용법

### 기본 사용

```javascript
const { EVENT_STATUS, CustomError, logger } = require('@tiketi/common');

// 상수 사용
if (event.status === EVENT_STATUS.SOLD_OUT) {
  throw new CustomError(400, '매진된 이벤트입니다.');
}

// 로깅
logger.info('이벤트 조회 성공', { eventId: 123 });
```

### 카테고리별 import

```javascript
const { constants, utils } = require('@tiketi/common');

// 상수
console.log(constants.EVENT_STATUS.ON_SALE);  // 'on_sale'

// 유틸리티
const error = new utils.CustomError(404, '찾을 수 없습니다.');
```

## 📚 API 문서

### Constants (상수)

#### EVENT_STATUS
```javascript
const { EVENT_STATUS } = require('@tiketi/common');

EVENT_STATUS.UPCOMING    // 'upcoming'  - 오픈 예정
EVENT_STATUS.ON_SALE     // 'on_sale'   - 예매 중
EVENT_STATUS.ENDED       // 'ended'     - 예매 종료
EVENT_STATUS.CANCELLED   // 'cancelled' - 취소됨
EVENT_STATUS.SOLD_OUT    // 'sold_out'  - 매진
```

#### SEAT_STATUS
```javascript
const { SEAT_STATUS } = require('@tiketi/common');

SEAT_STATUS.AVAILABLE  // 'available' - 선택 가능
SEAT_STATUS.RESERVED   // 'reserved'  - 예약 완료
SEAT_STATUS.LOCKED     // 'locked'    - 선택 중
SEAT_STATUS.SELECTED   // 'selected'  - 현재 사용자가 선택 (FE only)
```

#### RESERVATION_STATUS
```javascript
const { RESERVATION_STATUS } = require('@tiketi/common');

RESERVATION_STATUS.PENDING    // 'pending'   - 대기 중
RESERVATION_STATUS.CONFIRMED  // 'confirmed' - 확정
RESERVATION_STATUS.CANCELLED  // 'cancelled' - 취소됨
RESERVATION_STATUS.EXPIRED    // 'expired'   - 만료됨
```

#### PAYMENT_STATUS / PAYMENT_METHODS
```javascript
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('@tiketi/common');

PAYMENT_STATUS.PENDING     // 'pending'
PAYMENT_STATUS.COMPLETED   // 'completed'
PAYMENT_STATUS.FAILED      // 'failed'
PAYMENT_STATUS.REFUNDED    // 'refunded'

PAYMENT_METHODS.KAKAO_PAY  // 'kakao_pay'
PAYMENT_METHODS.NAVER_PAY  // 'naver_pay'
PAYMENT_METHODS.TOSS_PAY   // 'toss_pay'
```

#### ERROR_MESSAGES / SUCCESS_MESSAGES
```javascript
const { ERROR_MESSAGES, SUCCESS_MESSAGES } = require('@tiketi/common');

ERROR_MESSAGES.SEAT_LOCKED        // '다른 사용자가 선택 중인 좌석입니다.'
SUCCESS_MESSAGES.PAYMENT_COMPLETED // '결제가 완료되었습니다.'
```

### Utils (유틸리티)

#### CustomError
```javascript
const { CustomError } = require('@tiketi/common');

// 기본 사용
throw new CustomError(400, '잘못된 요청입니다.');

// 원인 포함
throw new CustomError(500, '서버 오류', originalError);

// Static 메서드
throw CustomError.badRequest('잘못된 입력');
throw CustomError.unauthorized('로그인이 필요합니다');
throw CustomError.notFound('이벤트를 찾을 수 없습니다');
throw CustomError.forbidden('권한이 없습니다');
throw CustomError.conflict('이미 존재합니다');
throw CustomError.internal('서버 오류');
```

#### Logger
```javascript
const { logger, logFormat } = require('@tiketi/common');

// 기본 로깅
logger.info('메시지');
logger.error('에러 발생', { error: err });
logger.warn('경고');
logger.debug('디버그 정보');

// Express 요청 로깅
app.use((req, res, next) => {
  res.on('finish', () => {
    logger.info(logFormat(req, res, { action: 'request' }));
  });
  next();
});
```

## 🔄 버전 업데이트

### 공통 라이브러리 업데이트 방법

1. 코드 수정
2. 버전 업데이트
   ```bash
   npm version patch  # 1.0.0 → 1.0.1 (버그 수정)
   npm version minor  # 1.0.0 → 1.1.0 (기능 추가)
   npm version major  # 1.0.0 → 2.0.0 (Breaking changes)
   ```
3. 배포
   ```bash
   npm publish
   ```

### 서비스에서 업데이트 적용

```bash
# 특정 버전
npm install @tiketi/common@1.0.1

# 최신 버전
npm update @tiketi/common
```

## 📁 디렉토리 구조

```
tiketi-common/
├── src/
│   ├── constants/
│   │   ├── index.js
│   │   ├── event-status.js
│   │   ├── seat-status.js
│   │   ├── reservation.js
│   │   ├── payment.js
│   │   ├── messages.js
│   │   └── settings.js
│   │
│   ├── utils/
│   │   ├── index.js
│   │   ├── custom-error.js
│   │   └── logger.js
│   │
│   └── index.js
│
├── package.json
└── README.md
```

## 🤝 기여

1. 이 레포지토리 fork
2. feature 브랜치 생성
3. 커밋 및 푸시
4. Pull Request 생성

## 📝 라이선스

MIT License
