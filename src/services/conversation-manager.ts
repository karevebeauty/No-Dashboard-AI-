import { logger } from '../utils/logger';
import { ConversationContext, Message } from '../types';

export class ConversationManager {
  private conversations: Map<string, ConversationContext> = new Map();
  private readonly maxMessages = 50;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  async getContext(phoneNumber: string): Promise<ConversationContext> {
    let context = this.conversations.get(phoneNumber);

    if (context && this.isSessionExpired(context)) {
      logger.info('Session expired, creating new context', { phoneNumber: this.mask(phoneNumber) });
      context = undefined;
    }

    if (!context) {
      context = {
        phoneNumber,
        sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        messages: [],
        lastActivity: new Date(),
        metadata: {},
      };
      this.conversations.set(phoneNumber, context);
      logger.info('New conversation context created', {
        phoneNumber: this.mask(phoneNumber),
        sessionId: context.sessionId,
      });
    }

    context.lastActivity = new Date();
    return context;
  }

  async addMessage(phoneNumber: string, message: Message): Promise<void> {
    let context = this.conversations.get(phoneNumber);
    if (!context) {
      context = await this.getContext(phoneNumber);
    }

    context.messages.push(message);
    context.lastActivity = new Date();

    // Trim old messages to prevent unbounded growth
    if (context.messages.length > this.maxMessages) {
      context.messages = context.messages.slice(-this.maxMessages);
    }
  }

  async clearContext(phoneNumber: string): Promise<void> {
    this.conversations.delete(phoneNumber);
    logger.info('Conversation context cleared', { phoneNumber: this.mask(phoneNumber) });
  }

  async updateMetadata(phoneNumber: string, metadata: Record<string, any>): Promise<void> {
    const context = await this.getContext(phoneNumber);
    Object.assign(context.metadata, metadata);
  }

  getActiveConversations(): number {
    this.pruneExpiredSessions();
    return this.conversations.size;
  }

  private isSessionExpired(context: ConversationContext): boolean {
    return Date.now() - context.lastActivity.getTime() > this.sessionTimeout;
  }

  private pruneExpiredSessions(): void {
    for (const [phone, context] of this.conversations) {
      if (this.isSessionExpired(context)) {
        this.conversations.delete(phone);
      }
    }
  }

  private mask(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    return `***${cleaned.slice(-4)}`;
  }
}
