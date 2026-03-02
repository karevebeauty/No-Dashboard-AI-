import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

export class Database {
  private pool: Pool;
  private config: { url: string; poolMin: number; poolMax: number };

  constructor(dbConfig: { url: string; poolMin: number; poolMax: number }) {
    this.config = dbConfig;
    const poolConfig: PoolConfig = {
      connectionString: dbConfig.url,
      min: dbConfig.poolMin,
      max: dbConfig.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Database connected', {
        poolMin: this.config.poolMin,
        poolMax: this.config.poolMax,
      });
    } catch (error: any) {
      logger.error('Failed to connect to database', { error: error.message });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      logger.info('Database disconnected');
    } catch (error: any) {
      logger.error('Error disconnecting from database', { error: error.message });
      throw error;
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Database query executed', { text: text.slice(0, 80), duration, rows: result.rowCount });
      return result.rows;
    } catch (error: any) {
      logger.error('Database query failed', { text: text.slice(0, 80), error: error.message });
      throw error;
    }
  }

  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] || null;
  }

  async execute(text: string, params?: any[]): Promise<number> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Database execute', { text: text.slice(0, 80), duration, affected: result.rowCount });
      return result.rowCount || 0;
    } catch (error: any) {
      logger.error('Database execute failed', { text: text.slice(0, 80), error: error.message });
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  getPool(): Pool {
    return this.pool;
  }
}
