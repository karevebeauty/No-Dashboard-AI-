import { Pool } from 'pg';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface AssistantProfile {
  id: string;
  name: string;
  description: string;
  tier: 'free' | 'pro' | 'enterprise';
  systemPrompt: string;
  llmModel: string;
  messageLimit: number;
  isActive: boolean;

  capabilities: {
    basicAssistant: boolean;
    memoryBank: boolean;
    noteTaking: boolean;
    documentCreation: boolean;
    documentEditing: boolean;
    webScraping: boolean;
    salesTools: boolean;
    startupIdeas: boolean;
    autonomousActions: boolean;
    messagesPerMonth: number;
    storageLimit: string;
    documentLimit: number;
    apiAccess: boolean;
  };

  integrations: {
    googleCalendar: boolean;
    gmail: boolean;
    googleDrive: boolean;
    slack: boolean;
    notion: boolean;
    linkedin: boolean;
    customApis: string[];
  };

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
  name: string;
  email: string;
  hashedPasscode: string;
  assistantProfileId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  isActive: boolean;
  isLocked: boolean;
  lastActivity: Date;
  securityLevel: 'standard' | 'high' | 'maximum';
  requiresReauth: boolean;
  currentSessionId?: string;
  sessionExpiresAt?: Date;
  failedLoginAttempts: number;
  usage: {
    messagesThisMonth: number;
    storageUsed: number;
    documentsCreated: number;
    lastReset: Date;
  };
  context: {
    preferences: Record<string, any>;
    memories: number;
    documents: number;
    conversations: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceMonthly: number;
  messageLimit: number;
  features: Record<string, boolean>;
  agentIds: string[];
  isActive: boolean;
  sortOrder: number;
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
 * Admin Dashboard Backend
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

  async getProfileList(): Promise<AssistantProfile[]> {
    const result = await this.db.query(
      'SELECT * FROM assistant_profiles WHERE is_active = true ORDER BY created_at DESC'
    );
    return result.rows.map((row: any) => this.parseProfile(row));
  }

  async getProfile(profileId: string): Promise<AssistantProfile | null> {
    const result = await this.db.query(
      'SELECT * FROM assistant_profiles WHERE id = $1',
      [profileId]
    );
    if (result.rows.length === 0) return null;
    return this.parseProfile(result.rows[0]);
  }

  async createAssistantProfile(
    adminId: string,
    profile: Partial<AssistantProfile>
  ): Promise<AssistantProfile> {
    logger.info('Admin creating assistant profile', { adminId, name: profile.name });

    const result = await this.db.query(
      `INSERT INTO assistant_profiles
       (name, description, tier, system_prompt, llm_model, message_limit,
        capabilities, integrations, behavior, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
       RETURNING *`,
      [
        profile.name || 'New Agent',
        profile.description || '',
        profile.tier || 'free',
        profile.systemPrompt || '',
        profile.llmModel || 'claude-sonnet-4-20250514',
        profile.messageLimit || 100,
        JSON.stringify(profile.capabilities || {}),
        JSON.stringify(profile.integrations || {}),
        JSON.stringify(profile.behavior || { responseStyle: 'balanced', proactiveAlerts: false, learningEnabled: true, contextRetention: 'daily', autoSummarization: false }),
      ]
    );

    const newProfile = this.parseProfile(result.rows[0]);

    await this.logAdminAction(adminId, 'CREATE_PROFILE', undefined, newProfile.id, {
      profileName: profile.name,
      tier: profile.tier,
    });

    logger.info('Assistant profile created', { profileId: newProfile.id });
    return newProfile;
  }

  async updateAssistantProfile(
    adminId: string,
    profileId: string,
    updates: Partial<AssistantProfile>
  ): Promise<AssistantProfile> {
    logger.info('Admin updating profile', { adminId, profileId });

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(updates.description); }
    if (updates.tier !== undefined) { setClauses.push(`tier = $${idx++}`); params.push(updates.tier); }
    if (updates.systemPrompt !== undefined) { setClauses.push(`system_prompt = $${idx++}`); params.push(updates.systemPrompt); }
    if (updates.llmModel !== undefined) { setClauses.push(`llm_model = $${idx++}`); params.push(updates.llmModel); }
    if (updates.messageLimit !== undefined) { setClauses.push(`message_limit = $${idx++}`); params.push(updates.messageLimit); }
    if (updates.capabilities !== undefined) { setClauses.push(`capabilities = $${idx++}`); params.push(JSON.stringify(updates.capabilities)); }
    if (updates.integrations !== undefined) { setClauses.push(`integrations = $${idx++}`); params.push(JSON.stringify(updates.integrations)); }
    if (updates.behavior !== undefined) { setClauses.push(`behavior = $${idx++}`); params.push(JSON.stringify(updates.behavior)); }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());
    params.push(profileId);

    const result = await this.db.query(
      `UPDATE assistant_profiles SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await this.logAdminAction(adminId, 'UPDATE_PROFILE', undefined, profileId, updates);
    return this.parseProfile(result.rows[0]);
  }

  async deleteProfile(adminId: string, profileId: string): Promise<void> {
    logger.info('Admin deleting profile', { adminId, profileId });
    await this.db.query(
      'UPDATE assistant_profiles SET is_active = false, updated_at = NOW() WHERE id = $1',
      [profileId]
    );
    await this.logAdminAction(adminId, 'DELETE_PROFILE', undefined, profileId, {});
  }

  async toggleCapability(
    adminId: string,
    profileId: string,
    capability: string,
    enabled: boolean
  ): Promise<void> {
    await this.db.query(
      `UPDATE assistant_profiles
       SET capabilities = jsonb_set(COALESCE(capabilities, '{}'), $1::text[], $2::jsonb),
           updated_at = NOW()
       WHERE id = $3`,
      [`{${capability}}`, JSON.stringify(enabled), profileId]
    );
    await this.logAdminAction(adminId, 'TOGGLE_CAPABILITY', undefined, profileId, { capability, enabled });
  }

  async toggleIntegration(
    adminId: string,
    profileId: string,
    integration: string,
    enabled: boolean
  ): Promise<void> {
    await this.db.query(
      `UPDATE assistant_profiles
       SET integrations = jsonb_set(COALESCE(integrations, '{}'), $1::text[], $2::jsonb),
           updated_at = NOW()
       WHERE id = $3`,
      [`{${integration}}`, JSON.stringify(enabled), profileId]
    );
    await this.logAdminAction(adminId, 'TOGGLE_INTEGRATION', undefined, profileId, { integration, enabled });
  }

  // ==========================================
  // USER ACCOUNT MANAGEMENT
  // ==========================================

  async getUserAccount(userId: string): Promise<UserAccount | null> {
    const result = await this.db.query(
      'SELECT * FROM user_accounts WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    return this.parseUserAccount(result.rows[0]);
  }

  async assignProfileToUser(
    adminId: string,
    userId: string,
    profileId: string
  ): Promise<void> {
    logger.info('Admin assigning profile to user', { adminId, userId, profileId });
    await this.db.query(
      'UPDATE user_accounts SET assistant_profile_id = $1, updated_at = NOW() WHERE id = $2',
      [profileId, userId]
    );
    await this.logAdminAction(adminId, 'ASSIGN_PROFILE', userId, profileId, { userId, profileId });
  }

  async changeUserTier(
    adminId: string,
    userId: string,
    newTier: string
  ): Promise<void> {
    logger.info('Admin changing user tier', { adminId, userId, newTier });
    await this.db.query(
      'UPDATE user_accounts SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
      [newTier, userId]
    );
    await this.logAdminAction(adminId, 'CHANGE_TIER', userId, undefined, { newTier });
  }

  async resetUserPassword(adminId: string, userId: string): Promise<string> {
    const tempPasscode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const hashedPasscode = await bcrypt.hash(tempPasscode, 10);
    await this.db.query(
      'UPDATE user_accounts SET hashed_passcode = $1, requires_reauth = true, updated_at = NOW() WHERE id = $2',
      [hashedPasscode, userId]
    );
    await this.logAdminAction(adminId, 'RESET_PASSWORD', userId, undefined, { action: 'password_reset' });
    return tempPasscode;
  }

  async toggleUserLock(adminId: string, userId: string, locked: boolean): Promise<void> {
    await this.db.query(
      'UPDATE user_accounts SET is_locked = $1, updated_at = NOW() WHERE id = $2',
      [locked, userId]
    );
    await this.logAdminAction(adminId, locked ? 'LOCK_USER' : 'UNLOCK_USER', userId, undefined, { locked });
  }

  async toggleUserActive(adminId: string, userId: string, active: boolean): Promise<void> {
    await this.db.query(
      'UPDATE user_accounts SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [active, userId]
    );
    await this.logAdminAction(adminId, active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', userId, undefined, { active });
  }

  async updateUserContext(
    adminId: string,
    userId: string,
    contextUpdates: Partial<UserAccount['context']>
  ): Promise<void> {
    await this.db.query(
      'UPDATE user_accounts SET context = context || $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(contextUpdates), userId]
    );
    await this.logAdminAction(adminId, 'UPDATE_CONTEXT', userId, undefined, contextUpdates);
  }

  // ==========================================
  // SUBSCRIPTION TIER MANAGEMENT
  // ==========================================

  async getTierList(): Promise<SubscriptionTier[]> {
    const result = await this.db.query(
      'SELECT * FROM subscription_tiers WHERE is_active = true ORDER BY sort_order ASC'
    );
    return result.rows.map((row: any) => this.parseTier(row));
  }

  async getTier(tierId: string): Promise<SubscriptionTier | null> {
    const result = await this.db.query(
      'SELECT * FROM subscription_tiers WHERE id = $1',
      [tierId]
    );
    if (result.rows.length === 0) return null;
    return this.parseTier(result.rows[0]);
  }

  async createTier(
    adminId: string,
    tier: Partial<SubscriptionTier>
  ): Promise<SubscriptionTier> {
    logger.info('Admin creating subscription tier', { adminId, name: tier.name });

    const result = await this.db.query(
      `INSERT INTO subscription_tiers
       (name, slug, description, price_monthly, message_limit, features, agent_ids, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW(), NOW())
       RETURNING *`,
      [
        tier.name || 'New Tier',
        tier.slug || tier.name?.toLowerCase().replace(/\s+/g, '-') || `tier-${Date.now()}`,
        tier.description || '',
        tier.priceMonthly || 0,
        tier.messageLimit || 100,
        JSON.stringify(tier.features || {}),
        tier.agentIds || [],
        tier.sortOrder || 0,
      ]
    );

    const newTier = this.parseTier(result.rows[0]);
    await this.logAdminAction(adminId, 'CREATE_TIER', undefined, newTier.id, { tierName: tier.name });
    return newTier;
  }

  async updateTier(
    adminId: string,
    tierId: string,
    updates: Partial<SubscriptionTier>
  ): Promise<SubscriptionTier> {
    logger.info('Admin updating tier', { adminId, tierId });

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(updates.name); }
    if (updates.slug !== undefined) { setClauses.push(`slug = $${idx++}`); params.push(updates.slug); }
    if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(updates.description); }
    if (updates.priceMonthly !== undefined) { setClauses.push(`price_monthly = $${idx++}`); params.push(updates.priceMonthly); }
    if (updates.messageLimit !== undefined) { setClauses.push(`message_limit = $${idx++}`); params.push(updates.messageLimit); }
    if (updates.features !== undefined) { setClauses.push(`features = $${idx++}`); params.push(JSON.stringify(updates.features)); }
    if (updates.agentIds !== undefined) { setClauses.push(`agent_ids = $${idx++}`); params.push(updates.agentIds); }
    if (updates.sortOrder !== undefined) { setClauses.push(`sort_order = $${idx++}`); params.push(updates.sortOrder); }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());
    params.push(tierId);

    const result = await this.db.query(
      `UPDATE subscription_tiers SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await this.logAdminAction(adminId, 'UPDATE_TIER', undefined, tierId, updates);
    return this.parseTier(result.rows[0]);
  }

  async deleteTier(adminId: string, tierId: string): Promise<void> {
    logger.info('Admin deleting tier', { adminId, tierId });
    await this.db.query(
      'UPDATE subscription_tiers SET is_active = false, updated_at = NOW() WHERE id = $1',
      [tierId]
    );
    await this.logAdminAction(adminId, 'DELETE_TIER', undefined, tierId, {});
  }

  // ==========================================
  // ANALYTICS & MONITORING
  // ==========================================

  async getSystemStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalProfiles: number;
    messagesSentToday: number;
    storageUsed: string;
    revenue: { mrr: number; arr: number };
  }> {
    const queries = await Promise.allSettled([
      this.db.query('SELECT COUNT(*) FROM user_accounts'),
      this.db.query(`SELECT COUNT(*) FROM user_accounts WHERE last_activity > NOW() - INTERVAL '24 hours'`),
      this.db.query('SELECT COUNT(*) FROM assistant_profiles WHERE is_active = true'),
      this.db.query(`SELECT COALESCE(SUM(st.price_monthly), 0) as mrr FROM user_accounts ua LEFT JOIN subscription_tiers st ON st.slug = ua.subscription_tier WHERE ua.is_active = true`),
    ]);

    const getCount = (r: PromiseSettledResult<any>, field = 'count') =>
      r.status === 'fulfilled' ? parseInt(r.value.rows[0]?.[field] || '0') : 0;

    const mrr = queries[3].status === 'fulfilled'
      ? parseFloat(queries[3].value.rows[0]?.mrr || '0')
      : 0;

    return {
      totalUsers: getCount(queries[0]),
      activeUsers: getCount(queries[1]),
      totalProfiles: getCount(queries[2]),
      messagesSentToday: 0,
      storageUsed: '0 Bytes',
      revenue: { mrr, arr: mrr * 12 },
    };
  }

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
      query += ` AND (phone_number ILIKE $${paramIndex} OR COALESCE(email,'') ILIKE $${paramIndex} OR COALESCE(name,'') ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.parseUserAccount(row));
  }

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

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => ({
      id: row.id?.toString(),
      adminId: row.admin_id,
      action: row.action,
      targetUserId: row.target_user_id,
      targetProfileId: row.target_profile_id,
      changes: row.changes || row.details || {},
      timestamp: row.created_at,
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
    try {
      await this.db.query(
        `INSERT INTO admin_actions
         (admin_id, action, target_type, target_id, details, target_user_id, target_profile_id, changes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          adminId,
          action,
          targetUserId ? 'user' : targetProfileId ? 'profile' : 'system',
          targetUserId || targetProfileId || null,
          JSON.stringify(changes || {}),
          targetUserId || null,
          targetProfileId || null,
          JSON.stringify(changes || {}),
        ]
      );
    } catch (error) {
      logger.error('Failed to log admin action', { action, error });
    }
  }

  private parseProfile(row: any): AssistantProfile {
    return {
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      tier: row.tier || 'free',
      systemPrompt: row.system_prompt || '',
      llmModel: row.llm_model || 'claude-sonnet-4-20250514',
      messageLimit: row.message_limit || 100,
      isActive: row.is_active !== false,
      capabilities: row.capabilities || {},
      integrations: row.integrations || {},
      behavior: row.behavior || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseUserAccount(row: any): UserAccount {
    return {
      id: row.id,
      phoneNumber: row.phone_number || '',
      name: row.name || '',
      email: row.email || '',
      hashedPasscode: row.hashed_passcode || '',
      assistantProfileId: row.assistant_profile_id || '',
      subscriptionTier: row.subscription_tier || 'free',
      isActive: row.is_active !== false,
      isLocked: row.is_locked || false,
      lastActivity: row.last_activity,
      securityLevel: row.security_level || 'standard',
      requiresReauth: row.requires_reauth || false,
      currentSessionId: row.current_session_id,
      sessionExpiresAt: row.session_expires_at,
      failedLoginAttempts: row.failed_login_attempts || 0,
      usage: row.usage || { messagesThisMonth: 0, storageUsed: 0, documentsCreated: 0 },
      context: row.context || { preferences: {}, memories: 0, documents: 0, conversations: 0 },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseTier(row: any): SubscriptionTier {
    return {
      id: row.id,
      name: row.name || '',
      slug: row.slug || '',
      description: row.description || '',
      priceMonthly: parseFloat(row.price_monthly) || 0,
      messageLimit: row.message_limit || 100,
      features: row.features || {},
      agentIds: row.agent_ids || [],
      isActive: row.is_active !== false,
      sortOrder: row.sort_order || 0,
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
