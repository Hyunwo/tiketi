import axios from 'axios';

const API_URL = 'http://localhost:8080';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

export const eventsAPI = {
  getAll: (params) => api.get('/events', { params }),
  getById: (id) => api.get(`/events/${id}`),
  create: (eventData) => api.post('/events', eventData),
  update: (id, eventData) => api.put(`/events/${id}`, eventData),
  delete: (id) => api.delete(`/events/${id}`),
};

export const reservationsAPI = {
  getAll: () => api.get('/reservations'),
  getById: (id) => api.get(`/reservations/${id}`),
  getMy: () => api.get('/reservations/my'),
  getUserReservations: () => api.get('/reservations/my'),
  create: (reservationData) => api.post('/reservations', reservationData),
  cancel: (id) => api.delete(`/reservations/${id}`),
};

export const adminAPI = {
  getDashboard: () => api.get('/stats/dashboard'),
  getDashboardStats: () => api.get('/stats/dashboard'),
  getStats: () => api.get('/stats/dashboard'),
  
  getEvents: (params) => api.get('/events', { params }),
  createEvent: (eventData) => api.post('/events', eventData),
  updateEvent: (id, eventData) => api.put(`/events/${id}`, eventData),
  deleteEvent: (id) => api.delete(`/events/${id}`),
  
  getReservations: (params) => api.get('/reservations', { params }),
  updateReservation: (id, data) => api.put(`/reservations/${id}`, data),
  deleteReservation: (id) => api.delete(`/reservations/${id}`),
  
  getUsers: () => api.get('/stats/users'),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  
  getEventStats: (eventId) => api.get(`/stats/events/${eventId}`),
  getRevenue: () => api.get('/stats/revenue'),
};

export const imageAPI = {
  upload: (formData) => Promise.resolve({ 
    data: { success: false, message: 'S3 비활성화' } 
  }),
  delete: (imageUrl) => Promise.resolve({ 
    data: { success: false, message: 'S3 비활성화' } 
  }),
};

export const newsAPI = {
  getAll: (params) => Promise.resolve({ 
    data: { news: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }
  }),
  getById: (id) => Promise.resolve({ data: null }),
};

export default api;

// API 응답 인터셉터 수정 - data 자동 추출
api.interceptors.response.use(
  (response) => {
    // stats API는 { success: true, data: {...} } 형태
    // 자동으로 data만 반환
    if (response.data && response.data.success && response.data.data) {
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
