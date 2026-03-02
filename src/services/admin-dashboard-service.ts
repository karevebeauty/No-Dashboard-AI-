import { Pool } from 'pg';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface AssistantProfile {
  id: string;
  name: string;
  description: string;
  tier: 'free' | 'pro' | 'enterprise';
  
  // Capabilities control
  capabilities: {
    // Core features
    basicAssistant: boolean;
    memoryBank: boolean;
    noteTaking: boolean;
    documentCreation: boolean;
    documentEditing: boolean;
    
    // Advanced features
    webScraping: boolean;
    salesTools: boolean;
    startupIdeas: boolean;
    autonomousActions: boolean;
    
    // Limits based on tier
    messagesPerMonth: number;
    storageLimit: string; // "100MB", "10GB", "unlimited"
    documentLimit: number; // per month
    apiAccess: boolean;
  };
  
  // Integrations control
  integrations: {
    googleCalendar: boolean;
    gmail: boolean;
    googleDrive: boolean;
    slack: boolean;
    notion: boolean;
    linkedin: boolean;
    customApis: string[]; // URLs of custom integrations
  };
  
  // Behavior settings
  behavior: {
    responseStyle: 'concise' | 'balanced' | 'detailed';
    proactiveAlerts: boolean;
    learningEnabled: boolean;
    contextRetention: 'session' | 'daily' | 'weekly' | 'permanent';
    autoSummarization: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAccount {
  id: string;
  phoneNumber: string;
  email: string;
  hashedPasscode: string;
  
  // Profile assignment
  assistantProfileId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  
  // Security
  isActive: boolean;
  isLocked: boolean;
  lastActivity: Date;
  securityLevel: 'standard' | 'high' | 'maximum';
  requiresReauth: boolean;
  
  // Session management
  currentSessionId?: string;
  sessionExpiresAt?: Date;
  failedLoginAttempts: number;
  
  // Usage tracking
  usage: {
    messagesThisMonth: number;
    storageUsed: number;
    documentsCreated: number;
    lastReset: Date;
  };
  
  // User context storage
  context: {
    preferences: Record<string, any>;
    memories: number; // count
    documents: number; // count
    conversations: number; // count
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAction {
  id: string;
  adminId: string;
  action: string;
  targetUserId?: string;
  targetProfileId?: string;
  changes: Record<string, any>;
  timestamp: Date;
}

/**
 * Admin Dashboard Backend - The Brain
 * Complete control center for managing the entire system
 */
export class AdminDashboardService {
  private db: Pool;
  
  constructor(dbPool: Pool) {
    this.db = dbPool;
  }

  // ==========================================
  // ASSISTANT PROFILE MANAGEMENT
  // ==========================================

  /**
   * Create new assistant profile
   */
  async createAssistantProfile(
    adminId: string,
    profile: Omit<AssistantProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AssistantProfile> {
    logger.info('Admin creating assistant profile', { adminId, name: profile.name });

    const newProfile: AssistantProfile = {
      id: `profile-${Date.now()}`,
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.db.query(
      `INSERT INTO assistant_profiles 
       (id, name, description, tier, capabilities, integrations, behavior, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newProfile.id,
        newProfile.name,
        newProfile.description,
        newProfile.tier,
        JSON.stringify(newProfile.capabilities),
        JSON.stringify(newProfile.integrations),
        JSON.stringify(newProfile.behavior),
        newProfile.createdAt,
        newProfile.updatedAt,
      ]
    );

    await this.logAdminAction(adminId, 'CREATE_PROFILE', undefined, newProfile.id, {
      profileName: profile.name,
      tier: profile.tier,
    });

    logger.info('Assistant profile created', { profileId: newProfile.id });

    return newProfile;
  }

  /**
   * Update assistant profile capabilities
   */
  async updateAssistantProfile(
    adminId: string,
    profileId: string,
    updates: Partial<AssistantProfile>
  ): Promise<AssistantProfile> {
    logger.info('Admin updating profile', { adminId, profileId });

    const result = await this.db.query(
      `UPDATE assistant_profiles 
       SET capabilities = COALESCE($1, capabilities),
           integrations = COALESCE($2, integrations),
           behavior = COALESCE($3, behavior),
           updated_at = $4
       WHERE id = $5
       RETURNING *`,
      [
        updates.capabilities ? JSON.stringify(updates.capabilities) : null,
        updates.integrations ? JSON.stringify(updates.integrations) : null,
        updates.behavior ? JSON.stringify(updates.behavior) : null,
        new Date(),
        profileId,
      ]
    );

    await this.logAdminAction(adminId, 'UPDATE_PROFILE', undefined, profileId, updates);

    return this.parseProfile(result.rows[0]);
  }

  /**
   * Enable/disable specific capability for profile
   */
  async toggleCapability(
    adminId: string,
    profileId: string,
    capability: keyof AssistantProfile['capabilities'],
    enabled: boolean
  ): Promise<void> {
    logger.info('Admin toggling capability', { adminId, profileId, capability, enabled });

    await this.db.query(
      `UPDATE assistant_profiles 
       SET capabilities = jsonb_set(capabilities, '{${capability}}', $1::jsonb),
           updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(enabled), new Date(), profileId]
    );

    await this.logAdminAction(adminId, 'TOGGLE_CAPABILITY', undefined, profileId, {
      capability,
      enabled,
    });
  }

  /**
   * Enable/disable integration for profile
   */
  async toggleIntegration(
    adminId: string,
    profileId: string,
    integration: keyof AssistantProfile['integrations'],
    enabled: boolean
  ): Promise<void> {
    logger.info('Admin toggling integration', { adminId, profileId, integration, enabled });

    await this.db.query(
      `UPDATE assistant_profiles 
       SET integrations = jsonb_set(integrations, '{${integration}}', $1::jsonb),
           updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(enabled), new Date(), profileId]
    );

    await this.logAdminAction(adminId, 'TOGGLE_INTEGRATION', undefined, profileId, {
      integration,
      enabled,
    });
  }

  // ==========================================
  // USER ACCOUNT MANAGEMENT
  // ==========================================

  /**
   * Get user account details
   */
  async getUserAccount(userId: string): Promise<UserAccount | null> {
    const result = await this.db.query(
      'SELECT * FROM user_accounts WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.parseUserAccount(result.rows[0]);
  }

  /**
   * Assign assistant profile to user
   */
  async assignProfileToUser(
    adminId: string,
    userId: string,
    profileId: string
  ): Promise<void> {
    logger.info('Admin assigning profile to user', { adminId, userId, profileId });

    await this.db.query(
      `UPDATE user_accounts 
       SET assistant_profile_id = $1,
           updated_at = $2
       WHERE id = $3`,
      [profileId, new Date(), userId]
    );

    await this.logAdminAction(adminId, 'ASSIGN_PROFILE', userId, profileId, {
      userId,
      profileId,
    });
  }

  /**
   * Change user's subscription tier
   */
  async changeUserTier(
    adminId: string,
    userId: string,
    newTier: 'free' | 'pro' | 'enterprise'
  ): Promise<void> {
    logger.info('Admin changing user tier', { adminId, userId, newTier });

    await this.db.query(
      `UPDATE user_accounts 
       SET subscription_tier = $1,
           updated_at = $2
       WHERE id = $3`,
      [newTier, new Date(), userId]
    );

    await this.logAdminAction(adminId, 'CHANGE_TIER', userId, undefined, {
      newTier,
    });
  }

  /**
   * Reset user password
   */
  async resetUserPassword(
    adminId: string,
    userId: string
  ): Promise<string> {
    logger.info('Admin resetting user password', { adminId, userId });

    // Generate new temporary passcode
    const tempPasscode = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char code
    const hashedPasscode = await bcrypt.hash(tempPasscode, 10);

    await this.db.query(
      `UPDATE user_accounts 
       SET hashed_passcode = $1,
           requires_reauth = true,
           updated_at = $2
       WHERE id = $3`,
      [hashedPasscode, new Date(), userId]
    );

    await this.logAdminAction(adminId, 'RESET_PASSWORD', userId, undefined, {
      action: 'password_reset',
    });

    return tempPasscode;
  }

  /**
   * Lock/unlock user account
   */
  async toggleUserLock(
    adminId: string,
    userId: string,
    locked: boolean
  ): Promise<void> {
    logger.info('Admin toggling user lock', { adminId, userId, locked });

    await this.db.query(
      `UPDATE user_accounts 
       SET is_locked = $1,
           updated_at = $2
       WHERE id = $3`,
      [locked, new Date(), userId]
    );

    await this.logAdminAction(adminId, locked ? 'LOCK_USER' : 'UNLOCK_USER', userId, undefined, {
      locked,
    });
  }

  /**
   * Activate/deactivate user account
   */
  async toggleUserActive(
    adminId: string,
    userId: string,
    active: boolean
  ): Promise<void> {
    logger.info('Admin toggling user active', { adminId, userId, active });

    await this.db.query(
      `UPDATE user_accounts 
       SET is_active = $1,
           updated_at = $2
       WHERE id = $3`,
      [active, new Date(), userId]
    );

    await this.logAdminAction(
      adminId,
      active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      userId,
      undefined,
      { active }
    );
  }

  /**
   * Update user context (admin can view/manage stored context)
   */
  async updateUserContext(
    adminId: string,
    userId: string,
    contextUpdates: Partial<UserAccount['context']>
  ): Promise<void> {
    logger.info('Admin updating user context', { adminId, userId });

    await this.db.query(
      `UPDATE user_accounts 
       SET context = context || $1::jsonb,
           updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(contextUpdates), new Date(), userId]
    );

    await this.logAdminAction(adminId, 'UPDATE_CONTEXT', userId, undefined, contextUpdates);
  }

  // ==========================================
  // ANALYTICS & MONITORING
  // ==========================================

  /**
   * Get system-wide statistics
   */
  async getSystemStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalProfiles: number;
    messagesSentToday: number;
    storageUsed: string;
    revenue: {
      mrr: number;
      arr: number;
    };
  }> {
    const [users, activeUsers, profiles, messages, storage] = await Promise.all([
      this.db.query('SELECT COUNT(*) FROM user_accounts'),
      this.db.query(`SELECT COUNT(*) FROM user_accounts 
                     WHERE last_activity > NOW() - INTERVAL '24 hours'`),
      this.db.query('SELECT COUNT(*) FROM assistant_profiles'),
      this.db.query(`SELECT COUNT(*) FROM messages 
                     WHERE created_at > CURRENT_DATE`),
      this.db.query('SELECT SUM(storage_used) FROM user_accounts'),
    ]);

    const revenueResult = await this.db.query(`
      SELECT 
        SUM(CASE 
          WHEN subscription_tier = 'pro' THEN 29
          WHEN subscription_tier = 'enterprise' THEN 99
          ELSE 0
        END) as mrr
      FROM user_accounts
      WHERE is_active = true
    `);

    const mrr = parseFloat(revenueResult.rows[0]?.mrr || '0');

    return {
      totalUsers: parseInt(users.rows[0].count),
      activeUsers: parseInt(activeUsers.rows[0].count),
      totalProfiles: parseInt(profiles.rows[0].count),
      messagesSentToday: parseInt(messages.rows[0].count),
      storageUsed: this.formatBytes(parseInt(storage.rows[0].sum || '0')),
      revenue: {
        mrr,
        arr: mrr * 12,
      },
    };
  }

  /**
   * Get user list with filters
   */
  async getUserList(
    filters?: {
      tier?: string;
      isActive?: boolean;
      profileId?: string;
      search?: string;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<UserAccount[]> {
    let query = 'SELECT * FROM user_accounts WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.tier) {
      query += ` AND subscription_tier = $${paramIndex}`;
      params.push(filters.tier);
      paramIndex++;
    }

    if (filters?.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(filters.isActive);
      paramIndex++;
    }

    if (filters?.profileId) {
      query += ` AND assistant_profile_id = $${paramIndex}`;
      params.push(filters.profileId);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND (phone_number LIKE $${paramIndex} OR email LIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);

    return result.rows.map(this.parseUserAccount);
  }

  /**
   * Get admin action log
   */
  async getAdminActionLog(
    filters?: {
      adminId?: string;
      action?: string;
      targetUserId?: string;
    },
    limit: number = 100
  ): Promise<AdminAction[]> {
    let query = 'SELECT * FROM admin_actions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.adminId) {
      query += ` AND admin_id = $${paramIndex}`;
      params.push(filters.adminId);
      paramIndex++;
    }

    if (filters?.action) {
      query += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }

    if (filters?.targetUserId) {
      query += ` AND target_user_id = $${paramIndex}`;
      params.push(filters.targetUserId);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      targetUserId: row.target_user_id,
      targetProfileId: row.target_profile_id,
      changes: row.changes,
      timestamp: row.timestamp,
    }));
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async logAdminAction(
    adminId: string,
    action: string,
    targetUserId?: string,
    targetProfileId?: string,
    changes?: Record<string, any>
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_actions 
       (id, admin_id, action, target_user_id, target_profile_id, changes, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `action-${Date.now()}`,
        adminId,
        action,
        targetUserId,
        targetProfileId,
        JSON.stringify(changes || {}),
        new Date(),
      ]
    );
  }

  private parseProfile(row: any): AssistantProfile {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tier: row.tier,
      capabilities: row.capabilities,
      integrations: row.integrations,
      behavior: row.behavior,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseUserAccount(row: any): UserAccount {
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      email: row.email,
      hashedPasscode: row.hashed_passcode,
      assistantProfileId: row.assistant_profile_id,
      subscriptionTier: row.subscription_tier,
      isActive: row.is_active,
      isLocked: row.is_locked,
      lastActivity: row.last_activity,
      securityLevel: row.security_level,
      requiresReauth: row.requires_reauth,
      currentSessionId: row.current_session_id,
      sessionExpiresAt: row.session_expires_at,
      failedLoginAttempts: row.failed_login_attempts,
      usage: row.usage,
      context: row.context,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
