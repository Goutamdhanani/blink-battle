import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

// Enable debug logging via ?debug=1 URL parameter or development mode
const isDevelopment = !import.meta.env.PROD;
const hasDebugParam = (() => {
  try {
    return typeof window !== 'undefined' && 
      new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
})();
const ENABLE_AUTH_LOGS = isDevelopment || hasDebugParam;

// Conditional logging helper
const authLog = (message: string, ...args: unknown[]) => {
  if (ENABLE_AUTH_LOGS) {
    console.log(message, ...args);
  }
};

const logAuthError = (message: string, ...args: unknown[]) => {
  // Always log errors, even in production
  console.error(message, ...args);
};

// Determine API URL with production-safe defaults
const getApiUrl = (): string => {
  // If explicitly set via environment variable, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Production fallback - use the known backend URL
  if (import.meta.env.PROD) {
    return 'https://blink-battle-7dcdf0aa361a.herokuapp.com';
  }
  
  // Development default
  return 'http://localhost:3001';
};

const API_URL = getApiUrl();

// Log API URL on startup for debugging
authLog('[API] Using API URL:', API_URL);

/**
 * Custom error type for authentication failures
 */
interface AuthenticationError extends Error {
  response?: any;
  isAuthError: boolean;
}

/**
 * API configuration error stored in window for debug panel
 */
interface ApiConfigError {
  error: string;
  fallbackUrl: string;
  timestamp: number;
}

/**
 * Extend window interface for custom properties
 */
declare global {
  interface Window {
    __apiConfigError?: ApiConfigError;
    __authDebugData?: any;
  }
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
      authLog('[API] Outgoing request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        hasAuth: !!token,
        hasData: !!config.data,
      });
      
      return config;
    },
    (error) => {
      logAuthError('[API] Request interceptor error:', error);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for better error handling
  client.interceptors.response.use(
    (response) => {
      // Log successful responses
      authLog('[API] Response received:', {
        status: response.status,
        url: response.config.url,
        method: response.config.method?.toUpperCase(),
      });
      return response;
    },
    (error: AxiosError) => {
      logAuthError('[API] Response error:', {
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        hasResponse: !!error.response,
        hasRequest: !!error.request,
      });
      
      if (error.response?.status === 401) {
        logAuthError('[API] Authentication error - token may be invalid or expired');
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Create enhanced error with isAuthError flag
        const enhancedError = new Error('Authentication required. Please sign in again.') as AuthenticationError;
        enhancedError.response = error.response;
        enhancedError.isAuthError = true;
        return Promise.reject(enhancedError);
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

// Export logging helpers for consistent logging across auth flow
export { authLog, logAuthError };
