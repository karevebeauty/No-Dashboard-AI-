import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

export class RedisClient {
  private client: Redis | null = null;
  private config: any;

  constructor(redisConfig: any) {
    this.config = redisConfig;
  }

  async connect(): Promise<void> {
    try {
      // Replit provides Redis via environment variable
      const redisUrl = process.env.REPLIT_DB_URL || this.config.url;
      
      this.client = new Redis(redisUrl, {
        password: this.config.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('error', (error) => {
        logger.error('Redis error', { error });
      });

      this.client.on('connect', () => {
        logger.info('Redis connected');
      });

      await this.client.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis disconnected');
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.setex(key, seconds, value);
  }

  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not connected');
    const result = await this.client.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) throw new Error('Redis not connected');
    return await this.client.keys(pattern);
  }
}
