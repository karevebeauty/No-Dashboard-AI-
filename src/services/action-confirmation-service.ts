import { logger } from '../utils/logger';
import { RedisClient } from './redis-client';
import { v4 as uuidv4 } from 'uuid';

export interface PendingAction {
  id: string;
  phoneNumber: string;
  action: string;
  toolName: string;
  params: any;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  confirmed: boolean;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  result?: any;
  error?: string;
  executedAt: Date;
}

/**
 * Action Confirmation Service
 * Manages confirmation flow for destructive/important actions
 */
export class ActionConfirmationService {
  private redis: RedisClient;
  private pendingActions: Map<string, PendingAction>;
  private readonly CONFIRMATION_TIMEOUT = 300; // 5 minutes

  // Actions that require confirmation
  private readonly REQUIRES_CONFIRMATION = [
    'erp_create_po',
    'erp_update_po',
    'erp_delete_po',
    'warehouse_create_shipment',
    'warehouse_cancel_shipment',
    'gmail_send_message',
    'gmail_delete_message',
    'gcal_create_event',
    'gcal_delete_event',
    'slack_send_message',
    'notion_create_page',
    'notion_update_database',
    'careflow_update_ticket',
    'careflow_close_ticket',
  ];

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.pendingActions = new Map();
  }

  /**
   * Check if an action requires confirmation
   */
  requiresConfirmation(toolName: string): boolean {
    return this.REQUIRES_CONFIRMATION.includes(toolName);
  }

  /**
   * Create a pending action that requires confirmation
   */
  async createPendingAction(
    phoneNumber: string,
    toolName: string,
    params: any,
    description: string
  ): Promise<PendingAction> {
    const action: PendingAction = {
      id: uuidv4().substring(0, 8).toUpperCase(), // Short confirmation code
      phoneNumber,
      action: toolName,
      toolName,
      params,
      description,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.CONFIRMATION_TIMEOUT * 1000),
      confirmed: false,
    };

    // Store in Redis with TTL
    await this.redis.setex(
      `pending_action:${action.id}`,
      this.CONFIRMATION_TIMEOUT,
      JSON.stringify(action)
    );

    // Store in memory for quick access
    this.pendingActions.set(action.id, action);

    logger.info('Pending action created', {
      actionId: action.id,
      phoneNumber,
      toolName,
    });

    return action;
  }

  /**
   * Get pending action by ID
   */
  async getPendingAction(actionId: string): Promise<PendingAction | null> {
    // Check memory first
    if (this.pendingActions.has(actionId)) {
      return this.pendingActions.get(actionId)!;
    }

    // Check Redis
    const data = await this.redis.get(`pending_action:${actionId}`);
    if (data) {
      const action = JSON.parse(data) as PendingAction;
      this.pendingActions.set(actionId, action);
      return action;
    }

    return null;
  }

  /**
   * Confirm an action by ID
   */
  async confirmAction(
    actionId: string,
    phoneNumber: string
  ): Promise<PendingAction | null> {
    const action = await this.getPendingAction(actionId);

    if (!action) {
      logger.warn('Action not found for confirmation', { actionId, phoneNumber });
      return null;
    }

    if (action.phoneNumber !== phoneNumber) {
      logger.warn('Phone number mismatch for action confirmation', {
        actionId,
        expected: action.phoneNumber,
        actual: phoneNumber,
      });
      return null;
    }

    if (new Date() > action.expiresAt) {
      logger.warn('Action expired', { actionId, phoneNumber });
      await this.cancelAction(actionId);
      return null;
    }

    action.confirmed = true;

    // Update in Redis
    await this.redis.setex(
      `pending_action:${actionId}`,
      60, // Give 1 minute to execute
      JSON.stringify(action)
    );

    logger.info('Action confirmed', { actionId, phoneNumber, toolName: action.toolName });

    return action;
  }

  /**
   * Cancel a pending action
   */
  async cancelAction(actionId: string): Promise<boolean> {
    const action = await this.getPendingAction(actionId);
    
    if (!action) {
      return false;
    }

    // Remove from Redis
    await this.redis.del(`pending_action:${actionId}`);

    // Remove from memory
    this.pendingActions.delete(actionId);

    logger.info('Action cancelled', { actionId });

    return true;
  }

  /**
   * Get all pending actions for a phone number
   */
  async getPendingActionsForUser(phoneNumber: string): Promise<PendingAction[]> {
    const actions: PendingAction[] = [];

    for (const [id, action] of this.pendingActions.entries()) {
      if (action.phoneNumber === phoneNumber && !action.confirmed) {
        // Check if expired
        if (new Date() > action.expiresAt) {
          await this.cancelAction(id);
        } else {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  /**
   * Clean up expired actions
   */
  async cleanupExpiredActions(): Promise<void> {
    const now = new Date();
    const expiredIds: string[] = [];

    for (const [id, action] of this.pendingActions.entries()) {
      if (now > action.expiresAt) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      await this.cancelAction(id);
    }

    if (expiredIds.length > 0) {
      logger.info('Cleaned up expired actions', { count: expiredIds.length });
    }
  }

  /**
   * Format confirmation message for SMS
   */
  formatConfirmationMessage(action: PendingAction): string {
    const expiresIn = Math.floor((action.expiresAt.getTime() - Date.now()) / 1000 / 60);

    return `⚠️ Confirm Action

${action.description}

Reply with:
✅ "CONFIRM ${action.id}" to proceed
❌ "CANCEL ${action.id}" to abort

Expires in ${expiresIn} minutes`;
  }

  /**
   * Parse confirmation from user message
   */
  parseConfirmation(message: string): {
    action: 'confirm' | 'cancel' | null;
    actionId: string | null;
  } {
    const msg = message.trim().toUpperCase();

    // Match "CONFIRM ABC123" or "YES ABC123"
    const confirmMatch = msg.match(/^(?:CONFIRM|YES)\s+([A-Z0-9]{8})$/);
    if (confirmMatch) {
      return {
        action: 'confirm',
        actionId: confirmMatch[1],
      };
    }

    // Match "CANCEL ABC123" or "NO ABC123"
    const cancelMatch = msg.match(/^(?:CANCEL|NO)\s+([A-Z0-9]{8})$/);
    if (cancelMatch) {
      return {
        action: 'cancel',
        actionId: cancelMatch[1],
      };
    }

    return { action: null, actionId: null };
  }

  /**
   * Log executed action for audit trail
   */
  async logActionExecution(
    action: PendingAction,
    result: ActionResult
  ): Promise<void> {
    const logEntry = {
      actionId: action.id,
      phoneNumber: action.phoneNumber,
      toolName: action.toolName,
      params: action.params,
      description: action.description,
      success: result.success,
      result: result.result,
      error: result.error,
      executedAt: result.executedAt,
      createdAt: action.createdAt,
    };

    // Store in Redis for 30 days
    await this.redis.setex(
      `action_log:${action.id}`,
      30 * 24 * 60 * 60,
      JSON.stringify(logEntry)
    );

    logger.info('Action executed', {
      actionId: action.id,
      phoneNumber: action.phoneNumber,
      toolName: action.toolName,
      success: result.success,
    });
  }

  /**
   * Get action history for a user
   */
  async getActionHistory(
    phoneNumber: string,
    limit: number = 10
  ): Promise<any[]> {
    // TODO: Implement proper database query for action history
    // For now, return empty array
    return [];
  }
}
