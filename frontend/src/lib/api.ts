import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
