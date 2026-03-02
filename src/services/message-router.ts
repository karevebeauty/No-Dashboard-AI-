import { Request, Response } from 'express';
import twilio from 'twilio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthService } from './auth-service';
import { RateLimiter } from './rate-limiter';
import { ConversationManager } from './conversation-manager';
import { ClaudeService } from './claude-service';
import { ResponseFormatter } from '../utils/response-formatter';
import { CostTracker } from './cost-tracker';
import {
  Message,
  TwilioError,
  AuthenticationError,
  RateLimitError,
} from '../types';

const { MessagingResponse } = twilio.twiml;

export class MessageRouter {
  private twilioClient: twilio.Twilio;
  private authService: AuthService;
  private rateLimiter: RateLimiter;
  private conversationManager: ConversationManager;
  private claudeService: ClaudeService;
  private responseFormatter: ResponseFormatter;
  private costTracker: CostTracker;

  constructor() {
    this.twilioClient = twilio(
      config.twilio.accountSid,
      config.twilio.authToken
    );
    this.authService = new AuthService();
    this.rateLimiter = new RateLimiter();
    this.conversationManager = new ConversationManager();
    this.claudeService = new ClaudeService();
    this.responseFormatter = new ResponseFormatter();
    this.costTracker = new CostTracker();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Message Router');
    // Any initialization logic here
  }

  /**
   * Validates Twilio webhook signature to prevent spoofing
   */
  private validateTwilioSignature(req: Request): boolean {
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const url = config.twilio.webhookUrl;
    
    return twilio.validateRequest(
      config.twilio.authToken,
      twilioSignature,
      url,
      req.body
    );
  }

  /**
   * Main handler for inbound SMS messages
   */
  async handleInboundMessage(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate Twilio signature
      if (config.environment === 'production') {
        if (!this.validateTwilioSignature(req)) {
          logger.warn('Invalid Twilio signature', { ip: req.ip });
          res.status(403).send('Forbidden');
          return;
        }
      }

      const {
        From: from,
        To: to,
        Body: body,
        MessageSid: messageSid,
      } = req.body;

      logger.info('Inbound SMS received', {
        from,
        to,
        messageSid,
        bodyLength: body.length,
      });

      // Create message object
      const message: Message = {
        id: messageSid,
        from,
        to,
        body,
        timestamp: new Date(),
        direction: 'inbound',
        status: 'received',
      };

      // Authenticate phone number
      const authResult = await this.authService.authenticate(from);
      if (!authResult.authorized) {
        logger.warn('Unauthorized phone number', { from, reason: authResult.reason });
        await this.sendUnauthorizedResponse(from);
        res.sendStatus(200);
        return;
      }

      // Check rate limits
      const rateLimitResult = await this.rateLimiter.checkLimit(from);
      if (rateLimitResult.isLimited) {
        logger.warn('Rate limit exceeded', { from });
        await this.sendRateLimitResponse(from, rateLimitResult);
        res.sendStatus(200);
        return;
      }

      // Process message asynchronously
      // Respond immediately to Twilio, process in background
      res.sendStatus(200);

      this.processMessage(message, authResult.permissions)
        .then(() => {
          const responseTime = Date.now() - startTime;
          logger.info('Message processed successfully', {
            from,
            messageSid,
            responseTime,
          });
        })
        .catch((error) => {
          logger.error('Error processing message', {
            from,
            messageSid,
            error,
          });
          this.sendErrorResponse(from, error);
        });

    } catch (error) {
      logger.error('Error handling inbound message', { error });
      res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Process the message through Claude and send response
   */
  private async processMessage(
    message: Message,
    permissions: string[]
  ): Promise<void> {
    const { from, body } = message;

    try {
      // Get or create conversation context
      const context = await this.conversationManager.getContext(from);

      // Add incoming message to context
      await this.conversationManager.addMessage(from, message);

      // Track costs
      await this.costTracker.startSession(from);

      // Process through Claude
      const response = await this.claudeService.processMessage(
        body,
        context,
        permissions
      );

      // Format response for SMS
      const formattedResponse = await this.responseFormatter.format(
        response,
        from
      );

      // Send response(s)
      for (const chunk of formattedResponse.chunks) {
        await this.sendSMS(from, chunk.content);
        
        // Track SMS cost
        await this.costTracker.trackSMS(from, chunk.content.length);
        
        // Small delay between chunks to maintain order
        if (chunk.hasMore) {
          await this.delay(500);
        }
      }

      // Update conversation context with response
      const outboundMessage: Message = {
        id: Date.now().toString(),
        from: config.twilio.phoneNumber,
        to: from,
        body: formattedResponse.fullText,
        timestamp: new Date(),
        direction: 'outbound',
        status: 'sent',
      };
      await this.conversationManager.addMessage(from, outboundMessage);

      // Track API costs
      if (response.usage) {
        await this.costTracker.trackAPIUsage(
          from,
          response.usage.input_tokens,
          response.usage.output_tokens
        );
      }

    } catch (error) {
      logger.error('Error processing message', { from, error });
      throw error;
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(to: string, body: string): Promise<void> {
    try {
      const message = await this.twilioClient.messages.create({
        from: config.twilio.phoneNumber,
        to,
        body,
      });

      logger.info('SMS sent', {
        to,
        messageSid: message.sid,
        bodyLength: body.length,
      });

    } catch (error) {
      logger.error('Failed to send SMS', { to, error });
      throw new TwilioError('Failed to send SMS', { to, error });
    }
  }

  /**
   * Send unauthorized response
   */
  private async sendUnauthorizedResponse(to: string): Promise<void> {
    const message = '🚫 Unauthorized. This phone number is not authorized to use this service.';
    try {
      await this.sendSMS(to, message);
    } catch (error) {
      logger.error('Failed to send unauthorized response', { to, error });
    }
  }

  /**
   * Send rate limit response
   */
  private async sendRateLimitResponse(to: string, rateLimitInfo: any): Promise<void> {
    const message = `⏸️ Rate limit exceeded. Please wait before sending more messages.`;
    try {
      await this.sendSMS(to, message);
    } catch (error) {
      logger.error('Failed to send rate limit response', { to, error });
    }
  }

  /**
   * Send error response
   */
  private async sendErrorResponse(to: string, error: Error): Promise<void> {
    const message = `❌ An error occurred: ${error.message}. Please try again later.`;
    try {
      await this.sendSMS(to, message);
    } catch (sendError) {
      logger.error('Failed to send error response', { to, error: sendError });
    }
  }

  /**
   * Utility to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Send outbound notification (for proactive alerts)
   */
  async sendNotification(to: string, message: string): Promise<void> {
    try {
      // Check if within quiet hours
      if (this.isQuietHours()) {
        logger.info('Notification suppressed (quiet hours)', { to });
        return;
      }

      await this.sendSMS(to, message);
      
      logger.info('Notification sent', { to, messageLength: message.length });
    } catch (error) {
      logger.error('Failed to send notification', { to, error });
      throw error;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(): boolean {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startHour, startMin] = config.notifications.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = config.notifications.quietHoursEnd.split(':').map(Number);
    
    const quietStart = startHour * 60 + startMin;
    const quietEnd = endHour * 60 + endMin;

    if (quietStart < quietEnd) {
      return currentTime >= quietStart && currentTime < quietEnd;
    } else {
      // Quiet hours span midnight
      return currentTime >= quietStart || currentTime < quietEnd;
    }
  }
}
