import { Pool } from 'pg';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { MessageRouter } from './message-router';

export interface SecuritySession {
  sessionId: string;
  userId: string;
  phoneNumber: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  isActive: boolean;
  securityLevel: 'standard' | 'high' | 'maximum';
}

export interface ReauthRequest {
  id: string;
  userId: string;
  phoneNumber: string;
  email: string;
  passcode: string;
  hashedPasscode: string;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  createdAt: Date;
}

export interface SecuritySettings {
  // Session timeout settings
  sessionTimeout: {
    standard: number; // minutes
    high: number;
    maximum: number;
  };
  
  // Inactivity thresholds
  inactivityThreshold: {
    standard: number; // minutes
    high: number;
    maximum: number;
  };
  
  // Re-auth requirements
  reauthRequired: {
    afterInactivity: boolean;
    afterTimeout: boolean;
    afterFailedAttempts: number;
    dailyReauth: boolean; // Require daily re-auth for high security
  };
  
  // Passcode settings
  passcode: {
    length: number;
    expiryMinutes: number;
    maxAttempts: number;
    cooldownMinutes: number; // After max attempts
  };
}

/**
 * Security & Session Management Service
 * Handles automatic re-authentication and session security
 */
export class SecurityService {
  private db: Pool;
  private messageRouter: MessageRouter;
  private activeSessions: Map<string, SecuritySession>;
  private pendingReauths: Map<string, ReauthRequest>;
  
  // Security settings (configurable by admin)
  private settings: SecuritySettings = {
    sessionTimeout: {
      standard: 480, // 8 hours
      high: 120, // 2 hours
      maximum: 30, // 30 minutes
    },
    inactivityThreshold: {
      standard: 60, // 1 hour
      high: 30, // 30 minutes
      maximum: 15, // 15 minutes
    },
    reauthRequired: {
      afterInactivity: true,
      afterTimeout: true,
      afterFailedAttempts: 3,
      dailyReauth: false,
    },
    passcode: {
      length: 6,
      expiryMinutes: 10,
      maxAttempts: 3,
      cooldownMinutes: 15,
    },
  };

  constructor(dbPool: Pool, messageRouter: MessageRouter) {
    this.db = dbPool;
    this.messageRouter = messageRouter;
    this.activeSessions = new Map();
    this.pendingReauths = new Map();
    
    // Start background session monitoring
    this.startSessionMonitoring();
  }

  /**
   * Check if user needs re-authentication
   */
  async checkAuthStatus(
    userId: string,
    phoneNumber: string
  ): Promise<{
    authenticated: boolean;
    reason?: string;
    requiresReauth: boolean;
  }> {
    // Get user account
    const userResult = await this.db.query(
      'SELECT * FROM user_accounts WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        authenticated: false,
        reason: 'User not found',
        requiresReauth: true,
      };
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.is_locked) {
      return {
        authenticated: false,
        reason: 'Account locked by admin',
        requiresReauth: false,
      };
    }

    // Check if account is active
    if (!user.is_active) {
      return {
        authenticated: false,
        reason: 'Account deactivated',
        requiresReauth: false,
      };
    }

    // Check if forced re-auth by admin
    if (user.requires_reauth) {
      return {
        authenticated: false,
        reason: 'Admin-required re-authentication',
        requiresReauth: true,
      };
    }

    // Check for active session
    const session = this.activeSessions.get(userId);
    
    if (!session) {
      return {
        authenticated: false,
        reason: 'No active session',
        requiresReauth: true,
      };
    }

    // Check session expiration
    if (session.expiresAt < new Date()) {
      await this.invalidateSession(userId);
      return {
        authenticated: false,
        reason: 'Session expired',
        requiresReauth: true,
      };
    }

    // Check inactivity
    const inactivityMinutes = (Date.now() - session.lastActivity.getTime()) / (1000 * 60);
    const threshold = this.settings.inactivityThreshold[session.securityLevel];
    
    if (inactivityMinutes > threshold) {
      await this.invalidateSession(userId);
      return {
        authenticated: false,
        reason: `Inactive for ${Math.floor(inactivityMinutes)} minutes`,
        requiresReauth: true,
      };
    }

    // Check daily re-auth requirement (for high/maximum security)
    if (
      this.settings.reauthRequired.dailyReauth &&
      session.securityLevel !== 'standard'
    ) {
      const hoursSinceCreation = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceCreation > 24) {
        await this.invalidateSession(userId);
        return {
          authenticated: false,
          reason: 'Daily re-authentication required',
          requiresReauth: true,
        };
      }
    }

    // Update last activity
    await this.updateSessionActivity(userId);

    return {
      authenticated: true,
      requiresReauth: false,
    };
  }

  /**
   * Initiate re-authentication process
   */
  async initiateReauth(
    userId: string,
    phoneNumber: string,
    email: string,
    reason: string
  ): Promise<void> {
    logger.info('Initiating re-authentication', { userId, reason });

    // Check if already has pending reauth
    const existing = this.pendingReauths.get(userId);
    if (existing && !existing.verified && existing.expiresAt > new Date()) {
      // Resend existing passcode
      await this.sendReauthPasscode(phoneNumber, email, existing.passcode, reason);
      return;
    }

    // Generate new passcode
    const passcode = this.generatePasscode();
    const hashedPasscode = await bcrypt.hash(passcode, 10);

    const reauthRequest: ReauthRequest = {
      id: `reauth-${Date.now()}`,
      userId,
      phoneNumber,
      email,
      passcode,
      hashedPasscode,
      expiresAt: new Date(Date.now() + this.settings.passcode.expiryMinutes * 60000),
      attempts: 0,
      verified: false,
      createdAt: new Date(),
    };

    // Store in database
    await this.db.query(
      `INSERT INTO reauth_requests 
       (id, user_id, phone_number, email, hashed_passcode, expires_at, attempts, verified, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        reauthRequest.id,
        reauthRequest.userId,
        reauthRequest.phoneNumber,
        reauthRequest.email,
        reauthRequest.hashedPasscode,
        reauthRequest.expiresAt,
        0,
        false,
        reauthRequest.createdAt,
      ]
    );

    // Cache in memory
    this.pendingReauths.set(userId, reauthRequest);

    // Send passcode via email and SMS
    await this.sendReauthPasscode(phoneNumber, email, passcode, reason);

    logger.info('Re-auth initiated', { userId, expiresIn: this.settings.passcode.expiryMinutes });
  }

  /**
   * Send re-authentication passcode
   */
  private async sendReauthPasscode(
    phoneNumber: string,
    email: string,
    passcode: string,
    reason: string
  ): Promise<void> {
    // Send to email
    await this.sendPasscodeEmail(email, passcode, reason);

    // Send SMS notification
    const smsMessage = `🔒 Security Check Required

${reason}

Check your email for passcode.

Reply with: ${passcode}

Code expires in ${this.settings.passcode.expiryMinutes} minutes.`;

    await this.messageRouter.sendNotification(phoneNumber, smsMessage);
  }

  /**
   * Verify re-authentication passcode
   */
  async verifyReauthPasscode(
    userId: string,
    phoneNumber: string,
    submittedPasscode: string
  ): Promise<{
    verified: boolean;
    error?: string;
    attemptsRemaining?: number;
  }> {
    logger.info('Verifying reauth passcode', { userId });

    const reauthRequest = this.pendingReauths.get(userId);

    if (!reauthRequest) {
      return {
        verified: false,
        error: 'No pending authentication request',
      };
    }

    // Check expiration
    if (reauthRequest.expiresAt < new Date()) {
      this.pendingReauths.delete(userId);
      return {
        verified: false,
        error: 'Passcode expired. Request new code.',
      };
    }

    // Check max attempts
    if (reauthRequest.attempts >= this.settings.passcode.maxAttempts) {
      await this.handleMaxAttempts(userId, phoneNumber);
      return {
        verified: false,
        error: `Too many attempts. Account locked for ${this.settings.passcode.cooldownMinutes} minutes.`,
      };
    }

    // Increment attempts
    reauthRequest.attempts++;
    await this.db.query(
      'UPDATE reauth_requests SET attempts = attempts + 1 WHERE id = $1',
      [reauthRequest.id]
    );

    // Verify passcode
    const isValid = await bcrypt.compare(submittedPasscode, reauthRequest.hashedPasscode);

    if (!isValid) {
      const remaining = this.settings.passcode.maxAttempts - reauthRequest.attempts;
      
      return {
        verified: false,
        error: `Invalid passcode. ${remaining} attempts remaining.`,
        attemptsRemaining: remaining,
      };
    }

    // Passcode verified!
    reauthRequest.verified = true;
    
    await this.db.query(
      'UPDATE reauth_requests SET verified = true WHERE id = $1',
      [reauthRequest.id]
    );

    // Clear requires_reauth flag if set by admin
    await this.db.query(
      'UPDATE user_accounts SET requires_reauth = false WHERE id = $1',
      [userId]
    );

    // Create new session
    await this.createSession(userId, phoneNumber);

    // Clean up
    this.pendingReauths.delete(userId);

    logger.info('Re-auth successful', { userId });

    return {
      verified: true,
    };
  }

  /**
   * Create new authenticated session
   */
  async createSession(userId: string, phoneNumber: string): Promise<SecuritySession> {
    // Get user's security level
    const userResult = await this.db.query(
      'SELECT security_level FROM user_accounts WHERE id = $1',
      [userId]
    );

    const securityLevel = userResult.rows[0]?.security_level || 'standard';

    const sessionTimeout = this.settings.sessionTimeout[securityLevel];
    
    const session: SecuritySession = {
      sessionId: crypto.randomBytes(32).toString('hex'),
      userId,
      phoneNumber,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + sessionTimeout * 60000),
      lastActivity: new Date(),
      isActive: true,
      securityLevel,
    };

    // Store in database
    await this.db.query(
      `UPDATE user_accounts 
       SET current_session_id = $1,
           session_expires_at = $2,
           last_activity = $3
       WHERE id = $4`,
      [session.sessionId, session.expiresAt, session.lastActivity, userId]
    );

    // Cache in memory
    this.activeSessions.set(userId, session);

    logger.info('Session created', {
      userId,
      securityLevel,
      expiresIn: sessionTimeout,
    });

    return session;
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(userId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    
    if (session) {
      session.lastActivity = new Date();
      
      await this.db.query(
        'UPDATE user_accounts SET last_activity = $1 WHERE id = $2',
        [session.lastActivity, userId]
      );
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(userId: string): Promise<void> {
    logger.info('Invalidating session', { userId });

    this.activeSessions.delete(userId);

    await this.db.query(
      `UPDATE user_accounts 
       SET current_session_id = NULL,
           session_expires_at = NULL
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Handle max authentication attempts
   */
  private async handleMaxAttempts(userId: string, phoneNumber: string): Promise<void> {
    logger.warn('Max reauth attempts reached', { userId });

    // Increment failed attempts counter
    await this.db.query(
      `UPDATE user_accounts 
       SET failed_login_attempts = failed_login_attempts + 1
       WHERE id = $1`,
      [userId]
    );

    // Check if should lock account
    const result = await this.db.query(
      'SELECT failed_login_attempts FROM user_accounts WHERE id = $1',
      [userId]
    );

    const failedAttempts = result.rows[0]?.failed_login_attempts || 0;

    if (failedAttempts >= this.settings.reauthRequired.afterFailedAttempts) {
      // Lock account
      await this.db.query(
        'UPDATE user_accounts SET is_locked = true WHERE id = $1',
        [userId]
      );

      // Notify user
      await this.messageRouter.sendNotification(
        phoneNumber,
        `🚨 Security Alert

Your account has been locked due to multiple failed authentication attempts.

Contact support to unlock your account.`
      );

      logger.warn('Account locked due to failed attempts', { userId, failedAttempts });
    } else {
      // Temporary cooldown
      await this.messageRouter.sendNotification(
        phoneNumber,
        `⚠️ Authentication Failed

Too many incorrect attempts.

Please wait ${this.settings.passcode.cooldownMinutes} minutes before trying again.`
      );
    }

    // Delete pending reauth
    this.pendingReauths.delete(userId);
  }

  /**
   * Start background session monitoring
   */
  private startSessionMonitoring(): void {
    // Check sessions every minute
    setInterval(async () => {
      await this.monitorSessions();
    }, 60000);

    logger.info('Session monitoring started');
  }

  /**
   * Monitor all active sessions
   */
  private async monitorSessions(): Promise<void> {
    const now = new Date();

    for (const [userId, session] of this.activeSessions.entries()) {
      // Check if expired
      if (session.expiresAt < now) {
        await this.invalidateSession(userId);
        continue;
      }

      // Check inactivity
      const inactivityMinutes = (now.getTime() - session.lastActivity.getTime()) / (1000 * 60);
      const threshold = this.settings.inactivityThreshold[session.securityLevel];

      if (inactivityMinutes > threshold) {
        await this.invalidateSession(userId);
      }
    }
  }

  /**
   * Generate random passcode
   */
  private generatePasscode(): string {
    const length = this.settings.passcode.length;
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let passcode = '';
    
    for (let i = 0; i < length; i++) {
      passcode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return passcode;
  }

  /**
   * Send passcode via email
   */
  private async sendPasscodeEmail(
    email: string,
    passcode: string,
    reason: string
  ): Promise<void> {
    // In production, integrate with email service (SendGrid, etc.)
    logger.info('Sending passcode email', { email, reason });

    // Email template
    const emailContent = `
      <h2>Security Verification Required</h2>
      <p>${reason}</p>
      <p>Your one-time passcode is:</p>
      <h1 style="font-size: 32px; letter-spacing: 8px;">${passcode}</h1>
      <p>Reply to your SMS assistant with this code to continue.</p>
      <p>This code expires in ${this.settings.passcode.expiryMinutes} minutes.</p>
      <p>If you didn't request this, please contact support immediately.</p>
    `;

    // TODO: Implement actual email sending
    logger.debug('Email would be sent', { email, passcode });
  }

  /**
   * Admin: Update security settings
   */
  async updateSecuritySettings(
    adminId: string,
    newSettings: Partial<SecuritySettings>
  ): Promise<void> {
    logger.info('Admin updating security settings', { adminId });

    this.settings = {
      ...this.settings,
      ...newSettings,
    };

    // Save to database
    await this.db.query(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ('security_settings', $1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = $3`,
      [JSON.stringify(this.settings), adminId, new Date()]
    );

    logger.info('Security settings updated', { adminId });
  }

  /**
   * Get current security settings
   */
  getSecuritySettings(): SecuritySettings {
    return { ...this.settings };
  }
}
