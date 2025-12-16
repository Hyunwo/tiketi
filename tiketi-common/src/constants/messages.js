/**
 * 에러/성공 메시지 상수
 * Backend + Frontend 공유
 */

// 에러 메시지
const ERROR_MESSAGES = {
  // 좌석 관련
  SEAT_NOT_FOUND: '좌석을 찾을 수 없습니다.',
  SEAT_ALREADY_RESERVED: '이미 예약된 좌석입니다.',
  SEAT_LOCKED: '다른 사용자가 선택 중인 좌석입니다. 잠시 후 다시 시도해주세요.',
  MAX_SEATS_EXCEEDED: '최대 선택 가능한 좌석 수를 초과했습니다.',
  NO_SEAT_SELECTED: '좌석을 선택해주세요.',
  
  // 예약 관련
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없습니다.',
  RESERVATION_EXPIRED: '예약이 만료되었습니다.',
  RESERVATION_CANCELLED: '취소된 예약입니다.',
  
  // 결제 관련
  PAYMENT_FAILED: '결제에 실패했습니다.',
  INVALID_PAYMENT_METHOD: '유효하지 않은 결제 수단입니다.',
  PAYMENT_ALREADY_COMPLETED: '이미 결제가 완료된 예약입니다.',
  
  // 인증 관련
  UNAUTHORIZED: '권한이 없습니다.',
  TOKEN_EXPIRED: '토큰이 만료되었습니다. 다시 로그인해주세요.',
  INVALID_TOKEN: '유효하지 않은 토큰입니다.',
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다.',
  
  // 이벤트 관련
  EVENT_NOT_FOUND: '이벤트를 찾을 수 없습니다.',
  EVENT_NOT_ON_SALE: '현재 예매 가능한 이벤트가 아닙니다.',
  EVENT_SOLD_OUT: '매진된 이벤트입니다.',
  
  // 대기열 관련
  QUEUE_FULL: '대기열이 가득 찼습니다.',
  NOT_YOUR_TURN: '아직 입장 순서가 아닙니다.',
  
  // 일반
  INTERNAL_ERROR: '서버 오류가 발생했습니다.',
  VALIDATION_ERROR: '입력값이 올바르지 않습니다.',
  RATE_LIMIT_EXCEEDED: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
};

// 성공 메시지
const SUCCESS_MESSAGES = {
  // 좌석 관련
  SEAT_RESERVED: '좌석이 선택되었습니다.',
  SEAT_RELEASED: '좌석 선택이 해제되었습니다.',
  
  // 예약 관련
  RESERVATION_CREATED: '예약이 생성되었습니다.',
  RESERVATION_CONFIRMED: '예약이 확정되었습니다.',
  RESERVATION_CANCELLED: '예약이 취소되었습니다.',
  
  // 결제 관련
  PAYMENT_COMPLETED: '결제가 완료되었습니다.',
  REFUND_COMPLETED: '환불이 완료되었습니다.',
  
  // 인증 관련
  LOGIN_SUCCESS: '로그인되었습니다.',
  LOGOUT_SUCCESS: '로그아웃되었습니다.',
  REGISTER_SUCCESS: '회원가입이 완료되었습니다.',
};

module.exports = {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
