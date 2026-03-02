import { config } from '../config';
import { logger } from '../utils/logger';
import { HealthCheckResult } from '../types';

export class HealthCheckService {
  private startTime: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastResult: HealthCheckResult | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  start(): void {
    const checkInterval = config.monitoring.healthCheckInterval;
    this.interval = setInterval(async () => {
      try {
        this.lastResult = await this.check();
        if (this.lastResult.status !== 'healthy') {
          logger.warn('System health degraded', { status: this.lastResult.status, components: this.lastResult.components });
        }
      } catch (error: any) {
        logger.error('Health check failed', { error: error.message });
      }
    }, checkInterval);

    logger.info('Health check service started', { interval: checkInterval });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Health check service stopped');
    }
  }

  async check(): Promise<HealthCheckResult> {
    const components = {
      twilio: await this.checkTwilio(),
      claude: await this.checkClaude(),
      mcp: true, // MCP is in-process
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const allHealthy = Object.values(components).every(Boolean);
    const someHealthy = Object.values(components).some(Boolean);

    const status: HealthCheckResult['status'] = allHealthy
      ? 'healthy'
      : someHealthy
      ? 'degraded'
      : 'down';

    const result: HealthCheckResult = {
      status,
      components,
      latency: {
        sms: 0,
        api: 0,
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date(),
    };

    this.lastResult = result;
    return result;
  }

  getLastResult(): HealthCheckResult | null {
    return this.lastResult;
  }

  private async checkTwilio(): Promise<boolean> {
    try {
      return !!(config.twilio.accountSid && config.twilio.authToken);
    } catch {
      return false;
    }
  }

  private async checkClaude(): Promise<boolean> {
    try {
      return !!config.claude.apiKey;
    } catch {
      return false;
    }
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      return !!config.database.url;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return !!config.redis.url;
    } catch {
      return false;
    }
  }
}
