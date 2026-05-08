import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('userToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  updateSettings: (data) => api.put('/auth/settings', data),
};

export const tradeAPI = {
  getTrades: () => api.get('/trades'),
  getStats: () => api.get('/trades/stats'),
  closeTrade: (ticket) => api.post(`/trades/close/${ticket}`),
};

export const saveToken = async (token) => {
  await AsyncStorage.setItem('userToken', token);
};

export const removeToken = async () => {
  await AsyncStorage.removeItem('userToken');
};

export default api;
