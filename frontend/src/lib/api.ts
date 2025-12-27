import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

// Determine API URL with production-safe defaults
const getApiUrl = (): string => {
  // If explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In production, try to use same origin (works if frontend and backend are on same domain)
  // WARNING: This only works if your backend is accessible from the same domain as the frontend
  // For separate domains, you MUST set VITE_API_URL explicitly
  if (import.meta.env.PROD) {
    console.warn('[API] No VITE_API_URL set in production, using window.location.origin');
    console.warn('[API] If your backend is on a different domain, this will NOT work!');
    console.warn('[API] Set VITE_API_URL environment variable to your backend URL.');
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
      
      // Log outgoing requests (non-sensitive info only)
      console.log('[API] Outgoing request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        hasAuth: !!token,
        hasData: !!config.data,
      });
      
      return config;
    },
    (error) => {
      console.error('[API] Request interceptor error:', error);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for better error handling
  client.interceptors.response.use(
    (response) => {
      // Log successful responses
      console.log('[API] Response received:', {
        status: response.status,
        url: response.config.url,
        method: response.config.method?.toUpperCase(),
      });
      return response;
    },
    (error: AxiosError) => {
      console.error('[API] Response error:', {
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        hasResponse: !!error.response,
        hasRequest: !!error.request,
      });
      
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
