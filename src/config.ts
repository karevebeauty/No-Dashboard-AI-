import dotenv from 'dotenv';
import { SystemConfig } from './types';

// Load environment variables
dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

function getEnvArray(key: string, delimiter: string = ','): string[] {
  const value = process.env[key];
  if (!value) {
    return [];
  }
  return value.split(delimiter).map((item) => item.trim()).filter(Boolean);
}

export const config: SystemConfig = {
  environment: (getEnv('NODE_ENV', 'development') as any),
  
  server: {
    port: getEnvNumber('PORT', 5000),
    host: getEnv('HOST', '0.0.0.0'),
  },
  
  twilio: {
    accountSid: getEnv('TWILIO_ACCOUNT_SID', ''),
    authToken: getEnv('TWILIO_AUTH_TOKEN', ''),
    phoneNumber: getEnv('TWILIO_PHONE_NUMBER', ''),
    webhookUrl: getEnv('TWILIO_WEBHOOK_URL', ''),
  },
  
  authorizedNumbers: getEnvArray('AUTHORIZED_PHONE_NUMBERS'),
  
  claude: {
    apiKey: getEnv('ANTHROPIC_API_KEY', ''),
    model: getEnv('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
  },
  
  redis: {
    url: getEnv('REDIS_URL', 'redis://localhost:6379'),
    password: process.env.REDIS_PASSWORD,
    db: getEnvNumber('REDIS_DB', 0),
  },
  
  database: {
    url: getEnv('DATABASE_URL', ''),
    poolMin: getEnvNumber('DATABASE_POOL_MIN', 2),
    poolMax: getEnvNumber('DATABASE_POOL_MAX', 10),
  },
  
  rateLimits: {
    perMinute: getEnvNumber('RATE_LIMIT_PER_MINUTE', 10),
    perHour: getEnvNumber('RATE_LIMIT_PER_HOUR', 100),
    perDay: getEnvNumber('RATE_LIMIT_PER_DAY', 500),
    concurrentRequests: getEnvNumber('CONCURRENT_REQUESTS_LIMIT', 3),
  },
  
  security: {
    encryptionKey: getEnv('ENCRYPTION_KEY', 'default-dev-key-00000000000000'),
    pinProtectionEnabled: getEnvBoolean('PIN_PROTECTION_ENABLED', false),
    pinCode: process.env.PIN_CODE,
  },
  
  notifications: {
    enabled: getEnvBoolean('ENABLE_NOTIFICATIONS', true),
    quietHoursStart: getEnv('NOTIFICATION_QUIET_HOURS_START', '22:00'),
    quietHoursEnd: getEnv('NOTIFICATION_QUIET_HOURS_END', '08:00'),
  },
  
  monitoring: {
    enableMetrics: getEnvBoolean('ENABLE_METRICS', true),
    metricsPort: getEnvNumber('METRICS_PORT', 9090),
    healthCheckInterval: getEnvNumber('HEALTH_CHECK_INTERVAL', 60000),
  },

  integrations: {
    google: process.env.GOOGLE_CLIENT_ID ? {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    } : undefined,
    notion: process.env.NOTION_API_KEY ? {
      apiKey: process.env.NOTION_API_KEY,
    } : undefined,
    slack: process.env.SLACK_BOT_TOKEN ? {
      botToken: process.env.SLACK_BOT_TOKEN,
    } : undefined,
    erp: process.env.ERP_API_URL ? {
      apiUrl: process.env.ERP_API_URL,
      apiKey: process.env.ERP_API_KEY || '',
    } : undefined,
  },
};

if (config.authorizedNumbers.length === 0) {
  console.warn('Warning: No authorized phone numbers configured. Set AUTHORIZED_PHONE_NUMBERS to enable SMS features.');
}

if (config.security.encryptionKey.length !== 32) {
  console.warn('Warning: ENCRYPTION_KEY should be exactly 32 characters long. Using default dev key.');
}

// Log configuration (without sensitive data)
console.log('Configuration loaded:', {
  environment: config.environment,
  server: config.server,
  authorizedNumbers: config.authorizedNumbers.length,
  redisConfigured: !!config.redis.url,
  databaseConfigured: !!config.database.url,
  twilioConfigured: !!config.twilio.accountSid,
  claudeConfigured: !!config.claude.apiKey,
  notificationsEnabled: config.notifications.enabled,
  integrations: {
    google: !!config.integrations.google,
    notion: !!config.integrations.notion,
    slack: !!config.integrations.slack,
    erp: !!config.integrations.erp,
  },
});

export default config;
