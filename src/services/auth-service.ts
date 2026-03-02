import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthResult } from '../types';

export class AuthService {
  private authorizedNumbers: Set<string>;

  constructor() {
    this.authorizedNumbers = new Set(config.authorizedNumbers);
  }

  async authenticate(phoneNumber: string): Promise<AuthResult> {
    const normalized = this.normalizePhoneNumber(phoneNumber);

    // Check if phone number is authorized
    if (!this.isAuthorized(normalized)) {
      logger.warn('Unauthorized access attempt', { phoneNumber: this.hashPhone(phoneNumber) });
      return {
        authorized: false,
        phoneNumber: normalized,
        permissions: [],
        reason: 'Phone number not authorized',
      };
    }

    // Get permissions for this user
    const permissions = this.getPermissions(normalized);

    logger.info('User authenticated', {
      phoneNumber: this.hashPhone(phoneNumber),
      permissions: permissions.length,
    });

    return {
      authorized: true,
      phoneNumber: normalized,
      permissions,
    };
  }

  private isAuthorized(phoneNumber: string): boolean {
    // Check against authorized numbers list
    for (const authorized of this.authorizedNumbers) {
      if (this.normalizePhoneNumber(authorized) === phoneNumber) {
        return true;
      }
    }
    return false;
  }

  private getPermissions(phoneNumber: string): string[] {
    // First authorized number gets full access (admin)
    const authorizedList = Array.from(this.authorizedNumbers);
    const normalizedFirst = authorizedList[0] ? this.normalizePhoneNumber(authorizedList[0]) : '';

    if (phoneNumber === normalizedFirst) {
      return ['*']; // Full access
    }

    // Other authorized numbers get standard permissions
    return ['erp', 'gmail', 'gcal', 'gdrive', 'notion', 'slack', 'careflow'];
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except leading +
    const cleaned = phone.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // Assume US number if no country code
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      }
      return `+${cleaned}`;
    }
    return cleaned;
  }

  private hashPhone(phone: string): string {
    // Simple masking for logs (show last 4 digits)
    const cleaned = phone.replace(/\D/g, '');
    return `***${cleaned.slice(-4)}`;
  }

  addAuthorizedNumber(phoneNumber: string): void {
    this.authorizedNumbers.add(this.normalizePhoneNumber(phoneNumber));
  }

  removeAuthorizedNumber(phoneNumber: string): void {
    this.authorizedNumbers.delete(this.normalizePhoneNumber(phoneNumber));
  }
}
