// Mock pg module before any imports
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

const PoolMock = jest.fn(() => mockPool);

jest.mock('pg', () => ({
  Pool: PoolMock,
}));

// Mock fs module
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  default: {
    readFileSync: mockReadFileSync,
  },
}));

describe('Database Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear module cache to force re-evaluation
    jest.resetModules();
    jest.clearAllMocks();
    PoolMock.mockClear();
    mockReadFileSync.mockClear();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('SSL Configuration', () => {
    it('should disable SSL in development by default', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      delete process.env.DATABASE_SSL;

      // Import after setting env - module initialization happens here
      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: false,
        })
      );
    });

    it('should enable SSL in production by default', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      delete process.env.DATABASE_SSL;

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });

    it('should enable SSL when DATABASE_SSL=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'true';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });

    it('should enable SSL when DATABASE_SSL=1', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = '1';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });

    it('should disable SSL when DATABASE_SSL=false even in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'false';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: false,
        })
      );
    });

    it('should disable SSL when DATABASE_SSL=0', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = '0';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: false,
        })
      );
    });

    it('should support custom CA certificate when DATABASE_SSL_CA is provided', () => {
      const mockCert = '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----';
      mockReadFileSync.mockReturnValue(mockCert);

      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'true';
      process.env.DATABASE_SSL_CA = '/path/to/cert.pem';

      require('../database');
        
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/cert.pem', 'utf8');
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {
            ca: mockCert,
            rejectUnauthorized: true,
          },
        })
      );
    });

    it('should handle CA certificate read errors gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'true';
      process.env.DATABASE_SSL_CA = '/invalid/path/cert.pem';

      require('../database');
        
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Failed to read DATABASE_SSL_CA file'),
        expect.any(Error)
      );
      
      // Should still create pool with basic SSL config
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle case-insensitive DATABASE_SSL values', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'TRUE';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });

    it('should support DATABASE_SSL=require', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.DATABASE_SSL = 'require';

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });
  });

  describe('Connection String', () => {
    it('should use DATABASE_URL from environment', () => {
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/dbname';
      delete process.env.DATABASE_SSL;

      require('../database');
        
      expect(PoolMock).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: 'postgresql://user:pass@host:5432/dbname',
        })
      );
    });
  });
});
