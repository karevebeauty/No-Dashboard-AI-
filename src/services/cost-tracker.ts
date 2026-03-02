import { logger } from '../utils/logger';
import { CostTracking } from '../types';

// Pricing constants
const SMS_COST_PER_SEGMENT = 0.0079; // Twilio outbound SMS
const CLAUDE_INPUT_COST_PER_1K = 0.003; // Claude Sonnet input
const CLAUDE_OUTPUT_COST_PER_1K = 0.015; // Claude Sonnet output

export class CostTracker {
  private sessions: Map<string, CostTracking> = new Map();
  private dailyTotals: Map<string, number> = new Map();

  async startSession(phoneNumber: string): Promise<string> {
    const sessionId = `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const tracking: CostTracking = {
      sessionId,
      phoneNumber,
      smsCount: 0,
      smsCost: 0,
      apiTokensInput: 0,
      apiTokensOutput: 0,
      apiCost: 0,
      totalCost: 0,
      timestamp: new Date(),
    };

    this.sessions.set(phoneNumber, tracking);
    return sessionId;
  }

  async trackSMS(phoneNumber: string, messageLength: number): Promise<void> {
    const session = this.sessions.get(phoneNumber);
    if (!session) return;

    // SMS segments: 160 chars for GSM-7, 70 for UCS-2
    const segments = Math.ceil(messageLength / 160);
    const cost = segments * SMS_COST_PER_SEGMENT;

    session.smsCount += segments;
    session.smsCost += cost;
    session.totalCost = session.smsCost + session.apiCost;

    this.addToDailyTotal(cost);

    logger.debug('SMS cost tracked', {
      phoneNumber: this.mask(phoneNumber),
      segments,
      cost: cost.toFixed(4),
      totalCost: session.totalCost.toFixed(4),
    });
  }

  async trackAPIUsage(
    phoneNumber: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const session = this.sessions.get(phoneNumber);
    if (!session) return;

    const inputCost = (inputTokens / 1000) * CLAUDE_INPUT_COST_PER_1K;
    const outputCost = (outputTokens / 1000) * CLAUDE_OUTPUT_COST_PER_1K;
    const cost = inputCost + outputCost;

    session.apiTokensInput += inputTokens;
    session.apiTokensOutput += outputTokens;
    session.apiCost += cost;
    session.totalCost = session.smsCost + session.apiCost;

    this.addToDailyTotal(cost);

    logger.debug('API cost tracked', {
      phoneNumber: this.mask(phoneNumber),
      inputTokens,
      outputTokens,
      cost: cost.toFixed(4),
      totalCost: session.totalCost.toFixed(4),
    });
  }

  getSessionCost(phoneNumber: string): CostTracking | null {
    return this.sessions.get(phoneNumber) || null;
  }

  getDailyCost(): number {
    const today = new Date().toISOString().split('T')[0];
    return this.dailyTotals.get(today) || 0;
  }

  getAllSessionCosts(): CostTracking[] {
    return Array.from(this.sessions.values());
  }

  private addToDailyTotal(cost: number): void {
    const today = new Date().toISOString().split('T')[0];
    const current = this.dailyTotals.get(today) || 0;
    this.dailyTotals.set(today, current + cost);
  }

  private mask(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    return `***${cleaned.slice(-4)}`;
  }
}
