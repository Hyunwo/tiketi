/**
 * 결제 관련 상수
 * Backend + Frontend 공유
 */

// 결제 상태
const PAYMENT_STATUS = {
  PENDING: 'pending',        // 결제 대기
  COMPLETED: 'completed',    // 결제 완료
  FAILED: 'failed',          // 결제 실패
  REFUNDED: 'refunded',      // 환불됨
};

// 결제 수단
const PAYMENT_METHODS = {
  NAVER_PAY: 'naver_pay',
  KAKAO_PAY: 'kakao_pay',
  BANK_TRANSFER: 'bank_transfer',
  TOSS_PAY: 'toss_pay',
  CARD: 'card',
};

// Frontend용 결제 수단 디스플레이
const PAYMENT_METHOD_DISPLAY = {
  [PAYMENT_METHODS.NAVER_PAY]: '네이버페이',
  [PAYMENT_METHODS.KAKAO_PAY]: '카카오페이',
  [PAYMENT_METHODS.BANK_TRANSFER]: '계좌이체',
  [PAYMENT_METHODS.TOSS_PAY]: '토스페이',
  [PAYMENT_METHODS.CARD]: '카드결제',
};

// 결제 설정 (Backend용)
const PAYMENT_SETTINGS = {
  MOCK_MIN_DELAY_MS: 500,    // 모의 결제 최소 지연
  MOCK_MAX_DELAY_MS: 1500,   // 모의 결제 최대 지연
};

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_DISPLAY,
  PAYMENT_SETTINGS,
};
