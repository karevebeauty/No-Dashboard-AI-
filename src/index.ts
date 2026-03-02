import express from 'express';
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
import { errorHandler } from './utils/error-handler';

class SMSAgentServer {
  private app: express.Application;
  private messageRouter: MessageRouter;
  private redisClient: RedisClient;
  private database: Database;
  private healthCheckService: HealthCheckService;
  private notificationService: NotificationService;

  constructor() {
    this.app = express();
    this.redisClient = new RedisClient(config.redis);
    this.database = new Database(config.database);
    this.messageRouter = new MessageRouter();
    this.healthCheckService = new HealthCheckService();
    this.notificationService = new NotificationService();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Compression
    this.app.use(compression());
    
    // Body parsing
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
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

    // Metrics endpoint (if enabled)
    if (config.monitoring.enableMetrics) {
      this.app.get('/metrics', async (req, res) => {
        // TODO: Implement Prometheus metrics
        res.json({ message: 'Metrics endpoint' });
      });
    }

    // SMS webhook endpoint (Twilio)
    this.app.post('/sms/webhook', async (req, res) => {
      try {
        await this.messageRouter.handleInboundMessage(req, res);
      } catch (error) {
        logger.error('Error handling inbound SMS', { error });
        res.status(500).send('Error processing message');
      }
    });

    // SMS status callback (optional, for delivery tracking)
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

    // Manual notification trigger (for testing)
    if (config.environment !== 'production') {
      this.app.post('/notifications/trigger', async (req, res) => {
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
      // Connect to Redis
      await this.redisClient.connect();
      logger.info('Redis connected');

      // Connect to Database
      await this.database.connect();
      logger.info('Database connected');

      // Initialize Message Router
      await this.messageRouter.initialize();
      logger.info('Message Router initialized');

      // Start Health Check Service
      this.healthCheckService.start();
      logger.info('Health Check Service started');

      // Start Notification Service
      if (config.notifications.enabled) {
        await this.notificationService.start();
        logger.info('Notification Service started');
      }

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services', { error });
      throw error;
    }
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

    } catch (error) {
      logger.error('Failed to start SMS Agent Server', { error });
      process.exit(1);
    }
  }
}

// Start the server
const server = new SMSAgentServer();
server.start();
