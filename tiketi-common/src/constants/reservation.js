/**
 * 예약 관련 상수
 * Backend + Frontend 공유
 */

// 예약 상태
const RESERVATION_STATUS = {
  PENDING: 'pending',        // 대기 중 (결제 전)
  CONFIRMED: 'confirmed',    // 확정 (결제 완료)
  CANCELLED: 'cancelled',    // 취소됨
  EXPIRED: 'expired',        // 만료됨
};

// 예약 설정
const RESERVATION_SETTINGS = {
  MAX_SEATS_PER_RESERVATION: 1,      // 1인 1좌석
  TEMPORARY_RESERVATION_MINUTES: 5,  // 임시 예약 유지 시간 (5분)
  CLEANUP_INTERVAL_SECONDS: 30,      // 만료 예약 정리 주기
};

module.exports = {
  RESERVATION_STATUS,
  RESERVATION_SETTINGS,
};
