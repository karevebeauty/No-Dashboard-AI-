import twilio from 'twilio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NotificationTrigger, Notification } from '../types';

export class NotificationService {
  private twilioClient: twilio.Twilio;
  private triggers: Map<string, NotificationTrigger> = new Map();
  private notificationLog: Notification[] = [];
  private running = false;

  constructor() {
    this.twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }

  async start(): Promise<void> {
    this.running = true;
    this.registerDefaultTriggers();
    logger.info('Notification service started', { triggers: this.triggers.size });
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Notification service stopped');
  }

  registerTrigger(trigger: NotificationTrigger): void {
    this.triggers.set(trigger.id, trigger);
    logger.info('Notification trigger registered', { triggerId: trigger.id, type: trigger.type });
  }

  removeTrigger(triggerId: string): void {
    this.triggers.delete(triggerId);
  }

  async triggerNotification(triggerId: string, data: any): Promise<void> {
    if (!this.running) {
      logger.warn('Notification service not running, skipping trigger');
      return;
    }

    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      logger.warn('Unknown notification trigger', { triggerId });
      return;
    }

    if (!trigger.enabled) {
      logger.info('Notification trigger disabled', { triggerId });
      return;
    }

    // Evaluate condition
    if (!trigger.evaluator(data)) {
      logger.debug('Notification condition not met', { triggerId });
      return;
    }

    // Generate message
    const message = trigger.messageTemplate(data);

    // Send to all recipients
    for (const recipient of trigger.recipients) {
      await this.sendNotification(triggerId, recipient, message);
    }
  }

  async evaluateAllTriggers(data: any): Promise<void> {
    for (const [triggerId] of this.triggers) {
      try {
        await this.triggerNotification(triggerId, data);
      } catch (error: any) {
        logger.error('Error evaluating trigger', { triggerId, error: error.message });
      }
    }
  }

  private async sendNotification(triggerId: string, recipient: string, message: string): Promise<void> {
    // Check quiet hours
    if (this.isQuietHours()) {
      logger.info('Notification suppressed (quiet hours)', { triggerId, recipient });
      return;
    }

    const notification: Notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      triggerId,
      recipient,
      message,
      sentAt: new Date(),
      deliveryStatus: 'pending',
    };

    try {
      await this.twilioClient.messages.create({
        from: config.twilio.phoneNumber,
        to: recipient,
        body: message,
      });

      notification.deliveryStatus = 'sent';
      logger.info('Notification sent', { notificationId: notification.id, recipient });
    } catch (error: any) {
      notification.deliveryStatus = 'failed';
      logger.error('Failed to send notification', { notificationId: notification.id, error: error.message });
    }

    this.notificationLog.push(notification);
  }

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
      return currentTime >= quietStart || currentTime < quietEnd;
    }
  }

  private registerDefaultTriggers(): void {
    // Error rate spike trigger
    this.registerTrigger({
      id: 'error_rate_spike',
      type: 'threshold',
      condition: 'error_rate > 10%',
      evaluator: (data) => data.errorRate > 0.1,
      messageTemplate: (data) => `⚠️ Alert: Error rate spiked to ${(data.errorRate * 100).toFixed(1)}%. Check system health.`,
      recipients: config.authorizedNumbers,
      enabled: true,
    });

    // Daily cost threshold trigger
    this.registerTrigger({
      id: 'daily_cost_limit',
      type: 'threshold',
      condition: 'daily_cost > $50',
      evaluator: (data) => data.dailyCost > 50,
      messageTemplate: (data) => `💰 Daily cost alert: $${data.dailyCost.toFixed(2)} spent today. Review usage.`,
      recipients: config.authorizedNumbers,
      enabled: true,
    });
  }

  getNotificationLog(limit: number = 50): Notification[] {
    return this.notificationLog.slice(-limit);
  }
}
