import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

// Determine API URL with production-safe defaults
const getApiUrl = (): string => {
  // If explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In production, try to use same origin
  if (import.meta.env.PROD) {
    console.warn('[API] No VITE_API_URL set in production, using window.location.origin');
    return window.location.origin;
  }
  
  // Development default
  return 'http://localhost:3001';
};

const API_URL = getApiUrl();

// Log API URL on startup for debugging
console.log('[API] Using API URL:', API_URL);

/**
 * Custom error type for authentication failures
 */
interface AuthenticationError extends Error {
  response?: any;
  isAuthError: boolean;
}

/**
 * Create axios instance with authentication interceptor
 * This ensures all API calls include the JWT token when available
 */
export const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: true, // Include credentials (cookies, authorization headers)
  });

  // Add request interceptor to include auth token
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add response interceptor for better error handling
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        console.error('[API] Authentication error - token may be invalid or expired');
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Create enhanced error with isAuthError flag
        const authError = new Error('Authentication required. Please sign in again.') as AuthenticationError;
        authError.response = error.response;
        authError.isAuthError = true;
        return Promise.reject(authError);
      }
      return Promise.reject(error);
    }
  );

  return client;
};

// Create default API client instance
export const apiClient = createApiClient();

// Export API URL for direct use where needed
export { API_URL };
