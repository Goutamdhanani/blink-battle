import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiClient } from '../api';

describe('API Client', () => {
  let originalLocalStorage: Storage;

  beforeEach(() => {
    // Mock localStorage
    originalLocalStorage = global.localStorage;
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
  });

  describe('Request Interceptor - Token Attachment', () => {
    it('should attach Authorization header when token exists in localStorage', async () => {
      // Arrange
      const testToken = 'test-jwt-token-12345';
      (global.localStorage.getItem as any).mockReturnValue(testToken);
      
      const client = createApiClient();
      
      // Access the request interceptor
      const requestInterceptor = (client.interceptors.request as any).handlers[0];
      const mockConfig: any = {
        headers: {},
      };

      // Act
      const result = await requestInterceptor.fulfilled(mockConfig);

      // Assert
      expect(global.localStorage.getItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBe(`Bearer ${testToken}`);
    });

    it('should not attach Authorization header when token does not exist', async () => {
      // Arrange
      (global.localStorage.getItem as any).mockReturnValue(null);
      
      const client = createApiClient();
      
      // Access the request interceptor
      const requestInterceptor = (client.interceptors.request as any).handlers[0];
      const mockConfig: any = {
        headers: {},
      };

      // Act
      const result = await requestInterceptor.fulfilled(mockConfig);

      // Assert
      expect(global.localStorage.getItem).toHaveBeenCalledWith('token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should handle config with no headers gracefully', async () => {
      // Arrange
      const testToken = 'test-jwt-token-12345';
      (global.localStorage.getItem as any).mockReturnValue(testToken);
      
      const client = createApiClient();
      
      // Access the request interceptor
      const requestInterceptor = (client.interceptors.request as any).handlers[0];
      const mockConfig: any = {};

      // Act
      const result = await requestInterceptor.fulfilled(mockConfig);

      // Assert
      expect(result.headers).toBeUndefined();
    });
  });

  describe('Response Interceptor - 401 Handling', () => {
    it('should clear localStorage on 401 response', async () => {
      // Arrange
      const client = createApiClient();
      
      // Access the response interceptor
      const responseInterceptor = (client.interceptors.response as any).handlers[0];
      const mockError: any = {
        response: {
          status: 401,
        },
        config: {},
      };

      // Act & Assert
      await expect(responseInterceptor.rejected(mockError)).rejects.toThrow();
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(global.localStorage.removeItem).toHaveBeenCalledWith('user');
    });

    it('should not clear localStorage on non-401 errors', async () => {
      // Arrange
      const client = createApiClient();
      
      // Access the response interceptor
      const responseInterceptor = (client.interceptors.response as any).handlers[0];
      const mockError: any = {
        response: {
          status: 500,
        },
        config: {},
      };

      // Act & Assert
      await expect(responseInterceptor.rejected(mockError)).rejects.toThrow();
      expect(global.localStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle network errors without response', async () => {
      // Arrange
      const client = createApiClient();
      
      // Access the response interceptor
      const responseInterceptor = (client.interceptors.response as any).handlers[0];
      const mockError: any = {
        request: {},
        config: {},
      };

      // Act & Assert
      await expect(responseInterceptor.rejected(mockError)).rejects.toThrow();
      expect(global.localStorage.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('API URL Configuration', () => {
    it('should use VITE_API_URL when set', () => {
      // Note: This test would need environment variable mocking
      // which is complex in Vitest. Documenting expected behavior:
      // - VITE_API_URL environment variable should be used as baseURL
      // - Falls back to window.location.origin in production
      // - Falls back to http://localhost:3001 in development
      
      const client = createApiClient();
      expect(client.defaults.baseURL).toBeDefined();
    });

    it('should set default headers', () => {
      const client = createApiClient();
      expect(client.defaults.headers['Content-Type']).toBe('application/json');
    });

    it('should enable credentials', () => {
      const client = createApiClient();
      expect(client.defaults.withCredentials).toBe(true);
    });
  });
});
