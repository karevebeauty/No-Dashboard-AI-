import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import bodyParser from 'body-parser';
import { config } from './config';
import { logger } from './utils/logger';
import { MessageRouter } from './services/message-router';
import { RedisClient } from './services/redis-client';
import { Database } from './services/database';
import { HealthCheckService } from './services/health-check';
import { NotificationService } from './services/notification-service';
import { PersonalAssistantService } from './services/personal-assistant-service';
import { createAdminRoutes } from './routes/admin-routes';
import { errorHandler } from './utils/error-handler';

class SMSAgentServer {
  private app: express.Application;
  private messageRouter: MessageRouter | null = null;
  private redisClient: RedisClient | null = null;
  private database: Database | null = null;
  private healthCheckService: HealthCheckService;
  private notificationService: NotificationService | null = null;
  private personalAssistant: PersonalAssistantService | null = null;

  constructor() {
    this.app = express();
    this.healthCheckService = new HealthCheckService();
  }

  private setupMiddleware(): void {
    // Security middleware (CSP allows Tailwind + Alpine.js CDN for admin dashboard)
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    }));
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.use(express.static(path.join(__dirname, '..', 'public')));

    this.app.use((req, res, next) => {
      if (!req.path.startsWith('/api/') && req.path !== '/health') return next();
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/api/status', (req, res) => {
      const twilioConfigured = !!(config.twilio.accountSid && config.twilio.authToken);
      const claudeConfigured = !!config.claude.apiKey;
      const mem = process.memoryUsage();

      res.json({
        name: 'SMS Agent Server',
        status: 'running',
        version: '1.0.0',
        environment: config.environment,
        uptime: Math.floor(process.uptime()),
        port: config.server.port,
        host: config.server.host,
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        memory: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        authorizedNumbers: config.authorizedNumbers.length,
        services: {
          twilio: twilioConfigured ? 'configured' : 'not configured',
          claude: claudeConfigured ? 'configured' : 'not configured',
          redis: this.redisClient ? 'connected' : 'not connected',
          database: this.database ? 'connected' : 'not connected',
        },
        integrations: {
          google: !!config.integrations.google,
          notion: !!config.integrations.notion,
          slack: !!config.integrations.slack,
          erp: !!config.integrations.erp,
        },
      });
    });

    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthCheckService.check();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        logger.error('Health check failed', { error });
        res.status(503).json({
          status: 'down',
          error: 'Health check failed',
        });
      }
    });

    if (config.monitoring.enableMetrics) {
      this.app.get('/metrics', async (req, res) => {
        res.json({ message: 'Metrics endpoint' });
      });
    }

    this.app.post('/sms/webhook', async (req, res) => {
      if (!this.messageRouter) {
        res.status(503).json({ error: 'SMS services not configured. Set TWILIO and ANTHROPIC environment variables.' });
        return;
      }
      try {
        await this.messageRouter.handleInboundMessage(req, res);
      } catch (error) {
        logger.error('Error handling inbound SMS', { error });
        res.status(500).send('Error processing message');
      }
    });

    this.app.post('/sms/status', async (req, res) => {
      try {
        const { MessageSid, MessageStatus, To, ErrorCode } = req.body;
        logger.info('SMS status update', {
          messageSid: MessageSid,
          status: MessageStatus,
          to: To,
          errorCode: ErrorCode,
        });
        res.sendStatus(200);
      } catch (error) {
        logger.error('Error handling SMS status', { error });
        res.sendStatus(500);
      }
    });

    if (config.environment !== 'production') {
      this.app.post('/notifications/trigger', async (req, res) => {
        if (!this.notificationService) {
          res.status(503).json({ error: 'Notification service not available' });
          return;
        }
        try {
          const { triggerId, data } = req.body;
          await this.notificationService.triggerNotification(triggerId, data);
          res.json({ success: true, message: 'Notification triggered' });
        } catch (error) {
          logger.error('Error triggering notification', { error });
          res.status(500).json({ success: false, error: String(error) });
        }
      });
    }

    this.app.use('/api/admin', (req, res, next) => {
      if (!this.database) {
        res.status(503).json({ error: 'Database not available' });
        return;
      }
      createAdminRoutes(this.database.getPool())(req, res, next);
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    try {
      this.redisClient = new RedisClient(config.redis);
      await this.redisClient.connect();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis not available - continuing without Redis', { error });
      this.redisClient = null;
    }

    if (config.database.url) {
      try {
        this.database = new Database(config.database);
        await this.database.connect();
        logger.info('Database connected');
      } catch (error) {
        logger.warn('Database not available - continuing without database', { error });
        this.database = null;
      }
    } else {
      logger.warn('Skipping Database - DATABASE_URL not configured');
    }

    const twilioConfigured = !!(config.twilio.accountSid && config.twilio.authToken);
    const claudeConfigured = !!config.claude.apiKey;

    if (twilioConfigured && claudeConfigured && this.redisClient) {
      try {
        this.messageRouter = new MessageRouter(this.redisClient);
        await this.messageRouter.initialize();
        logger.info('Message Router initialized');
      } catch (error) {
        logger.warn('Message Router failed to initialize', { error });
        this.messageRouter = null;
      }
    } else {
      logger.warn('Skipping Message Router - missing Twilio/Claude/Redis configuration');
    }

    this.healthCheckService.start();
    logger.info('Health Check Service started');

    if (config.notifications.enabled && twilioConfigured) {
      try {
        this.notificationService = new NotificationService();
        await this.notificationService.start();
        logger.info('Notification Service started');
      } catch (error) {
        logger.warn('Notification Service failed to start', { error });
        this.notificationService = null;
      }
    } else {
      logger.warn('Skipping Notification Service - Twilio not configured or notifications disabled');
    }

    if (this.messageRouter) {
      try {
        this.personalAssistant = new PersonalAssistantService(this.messageRouter);
        await this.personalAssistant.initialize();
        logger.info('Personal Assistant Service started');
      } catch (error) {
        logger.warn('Personal Assistant Service failed to start', { error });
        this.personalAssistant = null;
      }
    } else {
      logger.warn('Skipping Personal Assistant Service - Message Router not available');
    }

    logger.info('Service initialization complete');
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down SMS Agent Server...');

    try {
      // Stop accepting new requests
      this.app.disable('trust proxy');

      // Stop services
      if (this.notificationService) {
        await this.notificationService.stop();
        logger.info('Notification Service stopped');
      }

      if (this.healthCheckService) {
        this.healthCheckService.stop();
        logger.info('Health Check Service stopped');
      }

      // Personal assistant cron jobs will stop with the process

      // Close connections
      if (this.redisClient) {
        await this.redisClient.disconnect();
        logger.info('Redis disconnected');
      }

      if (this.database) {
        await this.database.disconnect();
        logger.info('Database disconnected');
      }

      logger.info('SMS Agent Server shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      // Setup Express app
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();

      // Initialize services
      await this.initializeServices();

      // Start server
      const { port, host } = config.server;
      this.app.listen(port, host, () => {
        logger.info(`SMS Agent Server running`, {
          environment: config.environment,
          host,
          port,
          pid: process.pid,
        });
      });

      // Graceful shutdown handlers
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', { error });
        this.shutdown();
      });
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection', { reason, promise });
        this.shutdown();
      });

    } catch (error: any) {
      logger.error('Failed to start SMS Agent Server', {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      });
      console.error('STARTUP ERROR:', error);
      process.exit(1);
    }
  }
}

const server = new SMSAgentServer();
server.start();
