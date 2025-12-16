/**
 * 토스페이먼츠 API 클라이언트
 * 결제 승인, 취소, 조회 등
 */
const axios = require('axios');
const { logger } = require('@tiketi/common');

const TOSS_API_URL = process.env.TOSS_API_URL || 'https://api.tosspayments.com';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_sk_xxx';

// Base64 인코딩된 시크릿 키 (토스 API 인증용)
const getAuthHeader = () => {
  const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${encoded}`;
};

// Axios 인스턴스 생성
const tossClient = axios.create({
  baseURL: TOSS_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': getAuthHeader(),
  },
  timeout: 30000,
});

/**
 * 결제 승인
 * @param {string} paymentKey - 결제 키
 * @param {string} orderId - 주문 ID
 * @param {number} amount - 결제 금액
 * @returns {Promise<Object>} 결제 승인 결과
 */
const confirmPayment = async (paymentKey, orderId, amount) => {
  try {
    logger.info('Confirming payment:', { paymentKey, orderId, amount });

    const response = await tossClient.post('/v1/payments/confirm', {
      paymentKey,
      orderId,
      amount,
    });

    logger.info('Payment confirmed:', response.data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error('Payment confirmation failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
    };
  }
};

/**
 * 결제 취소
 * @param {string} paymentKey - 결제 키
 * @param {string} cancelReason - 취소 사유
 * @param {number} cancelAmount - 취소 금액 (부분 취소 시)
 * @returns {Promise<Object>} 결제 취소 결과
 */
const cancelPayment = async (paymentKey, cancelReason, cancelAmount = null) => {
  try {
    logger.info('Canceling payment:', { paymentKey, cancelReason, cancelAmount });

    const body = { cancelReason };
    if (cancelAmount) {
      body.cancelAmount = cancelAmount;
    }

    const response = await tossClient.post(
      `/v1/payments/${paymentKey}/cancel`,
      body
    );

    logger.info('Payment canceled:', response.data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error('Payment cancellation failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
    };
  }
};

/**
 * 결제 조회
 * @param {string} paymentKey - 결제 키
 * @returns {Promise<Object>} 결제 정보
 */
const getPayment = async (paymentKey) => {
  try {
    const response = await tossClient.get(`/v1/payments/${paymentKey}`);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error('Payment lookup failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
    };
  }
};

/**
 * 주문 ID로 결제 조회
 * @param {string} orderId - 주문 ID
 * @returns {Promise<Object>} 결제 정보
 */
const getPaymentByOrderId = async (orderId) => {
  try {
    const response = await tossClient.get(`/v1/payments/orders/${orderId}`);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    logger.error('Payment lookup by orderId failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
    };
  }
};

/**
 * 모의 결제 (테스트용)
 * 실제 토스 API 대신 성공 응답을 시뮬레이션
 * @param {string} orderId - 주문 ID
 * @param {number} amount - 결제 금액
 * @returns {Promise<Object>} 모의 결제 결과
 */
const mockPayment = async (orderId, amount) => {
  // 랜덤 딜레이 (실제 결제처럼 보이게)
  const delay = Math.random() * 1000 + 500;
  await new Promise(resolve => setTimeout(resolve, delay));

  // 10% 확률로 실패 시뮬레이션 (테스트용)
  if (Math.random() < 0.1) {
    return {
      success: false,
      error: {
        code: 'MOCK_PAYMENT_FAILED',
        message: '모의 결제 실패 (테스트)',
      },
    };
  }

  return {
    success: true,
    data: {
      paymentKey: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId,
      amount,
      status: 'DONE',
      approvedAt: new Date().toISOString(),
      method: '카드',
      card: {
        company: '테스트카드',
        number: '****-****-****-1234',
      },
    },
  };
};

/**
 * 모의 환불 (테스트용)
 * @param {string} paymentKey - 결제 키
 * @param {string} cancelReason - 취소 사유
 * @returns {Promise<Object>} 모의 환불 결과
 */
const mockRefund = async (paymentKey, cancelReason) => {
  const delay = Math.random() * 500 + 300;
  await new Promise(resolve => setTimeout(resolve, delay));

  return {
    success: true,
    data: {
      paymentKey,
      cancelReason,
      canceledAt: new Date().toISOString(),
      status: 'CANCELED',
    },
  };
};

module.exports = {
  confirmPayment,
  cancelPayment,
  getPayment,
  getPaymentByOrderId,
  mockPayment,
  mockRefund,
};