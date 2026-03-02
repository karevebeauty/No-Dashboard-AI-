import { logger } from '../utils/logger';
import { ContactData } from './sales-research-service';
import { LinkedInAutomationService, LinkedInMessage } from './linkedin-automation-service';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export interface OutreachCampaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  targets: ContactData[];
  sequence: OutreachStep[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  stats: CampaignStats;
}

export interface OutreachStep {
  stepNumber: number;
  channel: 'linkedin' | 'email' | 'phone';
  messageTemplate: string;
  delayDays: number; // Days after previous step
  condition?: 'no_response' | 'opened' | 'clicked' | 'always';
}

export interface CampaignStats {
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  connected: number;
  converted: number;
}

export interface OutreachMessage {
  id: string;
  campaignId: string;
  contactId: string;
  contact: ContactData;
  stepNumber: number;
  channel: 'linkedin' | 'email' | 'phone';
  message: string;
  status: 'scheduled' | 'sent' | 'delivered' | 'opened' | 'replied';
  scheduledFor: Date;
  sentAt?: Date;
  openedAt?: Date;
  repliedAt?: Date;
}

/**
 * Outreach Campaign Manager
 * Manages multi-step outreach sequences with personalization
 */
export class OutreachCampaignManager {
  private linkedInService: LinkedInAutomationService;
  private claude: Anthropic;
  private campaigns: Map<string, OutreachCampaign>;
  private messages: Map<string, OutreachMessage>;

  constructor() {
    this.linkedInService = new LinkedInAutomationService();
    this.claude = new Anthropic({ apiKey: config.claude.apiKey });
    this.campaigns = new Map();
    this.messages = new Map();
  }

  /**
   * Create a new outreach campaign
   */
  async createCampaign(params: {
    name: string;
    targets: ContactData[];
    sequence: OutreachStep[];
  }): Promise<OutreachCampaign> {
    logger.info('Creating outreach campaign', { 
      name: params.name,
      targets: params.targets.length,
      steps: params.sequence.length,
    });

    const campaign: OutreachCampaign = {
      id: `campaign-${Date.now()}`,
      name: params.name,
      status: 'draft',
      targets: params.targets,
      sequence: params.sequence,
      createdAt: new Date(),
      stats: {
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        connected: 0,
        converted: 0,
      },
    };

    this.campaigns.set(campaign.id, campaign);

    logger.info('Campaign created', { 
      campaignId: campaign.id,
      name: campaign.name,
    });

    return campaign;
  }

  /**
   * Start a campaign
   */
  async startCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    logger.info('Starting campaign', { 
      campaignId,
      targets: campaign.targets.length,
    });

    campaign.status = 'active';
    campaign.startedAt = new Date();

    // Schedule first step for all targets
    for (const contact of campaign.targets) {
      await this.scheduleStep(campaign, contact, 1);
    }

    logger.info('Campaign started', { 
      campaignId,
      messagesScheduled: campaign.targets.length,
    });
  }

  /**
   * Schedule an outreach step for a contact
   */
  private async scheduleStep(
    campaign: OutreachCampaign,
    contact: ContactData,
    stepNumber: number
  ): Promise<void> {
    const step = campaign.sequence[stepNumber - 1];
    if (!step) {
      logger.warn('Step not found', { stepNumber, campaignId: campaign.id });
      return;
    }

    // Calculate schedule time
    const scheduledFor = new Date();
    if (stepNumber > 1) {
      scheduledFor.setDate(scheduledFor.getDate() + step.delayDays);
    }

    // Generate personalized message
    const personalizedMessage = await this.personalizeMessage(
      step.messageTemplate,
      contact,
      campaign
    );

    const message: OutreachMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      campaignId: campaign.id,
      contactId: contact.linkedinUrl || contact.email || contact.name,
      contact,
      stepNumber,
      channel: step.channel,
      message: personalizedMessage,
      status: 'scheduled',
      scheduledFor,
    };

    this.messages.set(message.id, message);

    logger.info('Outreach step scheduled', {
      messageId: message.id,
      contact: contact.name,
      channel: step.channel,
      scheduledFor,
    });
  }

  /**
   * Personalize message template using Claude
   */
  private async personalizeMessage(
    template: string,
    contact: ContactData,
    campaign: OutreachCampaign
  ): Promise<string> {
    try {
      const prompt = `Personalize this outreach message for the prospect:

**Prospect Information:**
- Name: ${contact.name}
- Title: ${contact.title}
- Company: ${contact.company}
- Location: ${contact.location || 'Unknown'}

**Message Template:**
${template}

**Instructions:**
- Replace {{name}}, {{company}}, {{title}} with actual values
- Add 1-2 personalized sentences based on their role/company
- Keep the tone professional but friendly
- Keep it concise (under 150 words for LinkedIn, under 100 words for first touch)
- Include a clear call-to-action
- Do not use generic flattery

Return only the personalized message, no explanations.`;

      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      const personalizedMessage = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      return personalizedMessage.trim();

    } catch (error: any) {
      logger.error('Message personalization failed', { error: error.message });
      
      // Fallback to simple template replacement
      return template
        .replace(/{{name}}/g, contact.name.split(' ')[0])
        .replace(/{{company}}/g, contact.company)
        .replace(/{{title}}/g, contact.title);
    }
  }

  /**
   * Send scheduled messages
   */
  async sendScheduledMessages(): Promise<void> {
    const now = new Date();
    const messagesToSend: OutreachMessage[] = [];

    // Find messages ready to send
    for (const message of this.messages.values()) {
      if (message.status === 'scheduled' && message.scheduledFor <= now) {
        messagesToSend.push(message);
      }
    }

    logger.info('Processing scheduled messages', { 
      count: messagesToSend.length,
    });

    for (const message of messagesToSend) {
      try {
        await this.sendMessage(message);
      } catch (error: any) {
        logger.error('Failed to send message', {
          messageId: message.id,
          error: error.message,
        });
      }
    }
  }

  /**
   * Send an individual message
   */
  private async sendMessage(message: OutreachMessage): Promise<void> {
    logger.info('Sending outreach message', {
      messageId: message.id,
      channel: message.channel,
      contact: message.contact.name,
    });

    try {
      if (message.channel === 'linkedin') {
        if (message.contact.linkedinUrl) {
          await this.linkedInService.sendMessage(
            message.contact.linkedinUrl,
            message.message
          );
        } else {
          throw new Error('No LinkedIn URL for contact');
        }
      } else if (message.channel === 'email') {
        // Would integrate with email service here
        logger.info('Email sending not yet implemented');
      }

      message.status = 'sent';
      message.sentAt = new Date();

      // Update campaign stats
      const campaign = this.campaigns.get(message.campaignId);
      if (campaign) {
        campaign.stats.sent++;
      }

      logger.info('Message sent successfully', {
        messageId: message.id,
      });

      // Schedule next step if applicable
      const nextCampaign = this.campaigns.get(message.campaignId);
      if (nextCampaign && message.stepNumber < nextCampaign.sequence.length) {
        await this.scheduleStep(
          nextCampaign,
          message.contact,
          message.stepNumber + 1
        );
      }

    } catch (error: any) {
      logger.error('Failed to send message', {
        messageId: message.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get campaign statistics
   */
  getCampaignStats(campaignId: string): CampaignStats | null {
    const campaign = this.campaigns.get(campaignId);
    return campaign ? campaign.stats : null;
  }

  /**
   * Pause a campaign
   */
  pauseCampaign(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (campaign) {
      campaign.status = 'paused';
      logger.info('Campaign paused', { campaignId });
    }
  }

  /**
   * Resume a campaign
   */
  resumeCampaign(campaignId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (campaign && campaign.status === 'paused') {
      campaign.status = 'active';
      logger.info('Campaign resumed', { campaignId });
    }
  }

  /**
   * Create a standard 3-step LinkedIn sequence
   */
  createStandardLinkedInSequence(): OutreachStep[] {
    return [
      {
        stepNumber: 1,
        channel: 'linkedin',
        messageTemplate: `Hi {{name}},

I noticed you're leading {{title}} at {{company}}. We help similar companies streamline their operations with AI-powered automation.

Would you be open to a brief 15-minute chat to explore how this could benefit {{company}}?

Best,
Ahmad`,
        delayDays: 0,
        condition: 'always',
      },
      {
        stepNumber: 2,
        channel: 'linkedin',
        messageTemplate: `Hi {{name}},

Following up on my previous message. I came across {{company}}'s recent [specific achievement/news] and thought our solution could complement your growth trajectory.

Would next week work for a quick call?

Best,
Ahmad`,
        delayDays: 3,
        condition: 'no_response',
      },
      {
        stepNumber: 3,
        channel: 'linkedin',
        messageTemplate: `{{name}},

Last ping! I've helped {{title}}s at similar companies achieve [specific benefit]. 

If you're interested, here's my calendar link: [link]

No worries if the timing isn't right!

Ahmad`,
        delayDays: 4,
        condition: 'no_response',
      },
    ];
  }

  /**
   * Get all campaigns
   */
  getAllCampaigns(): OutreachCampaign[] {
    return Array.from(this.campaigns.values());
  }

  /**
   * Get campaign by ID
   */
  getCampaign(campaignId: string): OutreachCampaign | null {
    return this.campaigns.get(campaignId) || null;
  }
}
