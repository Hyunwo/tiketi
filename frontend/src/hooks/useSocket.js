import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// WebSocket 비활성화
const SOCKET_URL = null;

// 기본 소켓 훅
export const useSocket = (eventId) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!SOCKET_URL || !eventId) return;
    
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket'],
      query: { eventId },
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [eventId]);

  return socketRef.current;
};

// Queue 업데이트 훅
export const useQueueUpdates = (eventId) => {
  const [queueStatus, setQueueStatus] = useState({
    position: 0,
    total: 0,
    status: 'active',
  });

  useEffect(() => {
    if (!eventId) return;
    // WebSocket 비활성화 상태에서는 기본값 사용
  }, [eventId]);

  return queueStatus;
};

// Ticket 업데이트 훅
export const useTicketUpdates = (eventId) => {
  const [ticketStatus, setTicketStatus] = useState({
    available: 0,
    reserved: 0,
    sold: 0,
  });

  useEffect(() => {
    if (!eventId) return;
    // WebSocket 비활성화
  }, [eventId]);

  return ticketStatus;
};

// Seat 업데이트 훅
export const useSeatUpdates = (eventId) => {
  const [seats, setSeats] = useState([]);

  useEffect(() => {
    if (!eventId) return;
    // WebSocket 비활성화
  }, [eventId]);

  return seats;
};

// Realtime 업데이트 훅
export const useRealtimeUpdates = (eventId) => {
  const [updates, setUpdates] = useState(null);

  useEffect(() => {
    if (!eventId) return;
    // WebSocket 비활성화
  }, [eventId]);

  return updates;
};

export default useSocket;
