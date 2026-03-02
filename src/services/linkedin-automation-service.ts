import { WebScrapingService } from './web-scraping-service';
import { logger } from '../utils/logger';

export interface LinkedInProfile {
  name: string;
  headline: string;
  location: string;
  company: string;
  position: string;
  profileUrl: string;
  connections?: string;
  about?: string;
  experience?: Array<{
    title: string;
    company: string;
    duration: string;
  }>;
  education?: Array<{
    school: string;
    degree: string;
  }>;
}

export interface LinkedInSearchParams {
  keywords?: string;
  location?: string;
  company?: string;
  title?: string;
  industry?: string;
  connectionLevel?: '1st' | '2nd' | '3rd';
  limit?: number;
}

export interface ConnectionRequest {
  profileUrl: string;
  message?: string;
  status: 'pending' | 'sent' | 'accepted' | 'declined';
  sentAt?: Date;
  respondedAt?: Date;
}

export interface LinkedInMessage {
  recipientUrl: string;
  subject?: string;
  message: string;
  sentAt: Date;
  status: 'sent' | 'read' | 'replied';
}

/**
 * LinkedIn Automation Service
 * IMPORTANT: Use responsibly and within LinkedIn's terms of service
 * Conservative rate limits to avoid detection
 */
export class LinkedInAutomationService {
  private webScraper: WebScrapingService;
  private rateLimits = {
    profileViews: 100, // per day
    connectionRequests: 20, // per day
    messages: 50, // per day
    searches: 10, // per hour
  };

  private dailyCounts = {
    profileViews: 0,
    connectionRequests: 0,
    messages: 0,
    lastReset: new Date(),
  };

  constructor() {
    this.webScraper = new WebScrapingService();
  }

  /**
   * Search for LinkedIn profiles
   * Note: Requires LinkedIn session cookies
   */
  async searchProfiles(params: LinkedInSearchParams): Promise<LinkedInProfile[]> {
    logger.info('Searching LinkedIn profiles', { params });

    this.checkRateLimit('searches');

    const searchUrl = this.buildSearchUrl(params);
    
    try {
      const result = await this.webScraper.scrape({
        url: searchUrl,
        method: 'dynamic',
        waitFor: '.search-results-container',
      });

      // Parse search results
      const profiles = this.parseSearchResults(result.content);

      logger.info('LinkedIn search completed', { 
        found: profiles.length,
        params,
      });

      return profiles.slice(0, params.limit || 10);

    } catch (error: any) {
      logger.error('LinkedIn search failed', { error: error.message, params });
      throw new Error(`LinkedIn search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed profile information
   */
  async getProfile(profileUrl: string): Promise<LinkedInProfile> {
    logger.info('Fetching LinkedIn profile', { profileUrl });

    this.checkRateLimit('profileViews');
    this.incrementCount('profileViews');

    try {
      const result = await this.webScraper.scrape({
        url: profileUrl,
        method: 'dynamic',
        extractRules: [
          { name: 'name', selector: '.top-card-layout__title', multiple: false },
          { name: 'headline', selector: '.top-card-layout__headline', multiple: false },
          { name: 'location', selector: '.top-card__subline-item', multiple: false },
          { name: 'about', selector: '.about-section', multiple: false },
          { name: 'connections', selector: '.top-card__connections', multiple: false },
        ],
      });

      const profile: LinkedInProfile = {
        name: result.extractedData?.name || 'Unknown',
        headline: result.extractedData?.headline || '',
        location: result.extractedData?.location || '',
        company: this.extractCompany(result.extractedData?.headline),
        position: this.extractPosition(result.extractedData?.headline),
        profileUrl,
        connections: result.extractedData?.connections,
        about: result.extractedData?.about,
      };

      logger.info('LinkedIn profile fetched', { name: profile.name });

      return profile;

    } catch (error: any) {
      logger.error('Failed to fetch LinkedIn profile', { 
        error: error.message, 
        profileUrl,
      });
      throw new Error(`Failed to fetch profile: ${error.message}`);
    }
  }

  /**
   * Send connection request
   * IMPORTANT: Use sparingly to avoid LinkedIn restrictions
   */
  async sendConnectionRequest(
    profileUrl: string,
    message?: string
  ): Promise<ConnectionRequest> {
    logger.info('Sending LinkedIn connection request', { profileUrl });

    this.checkRateLimit('connectionRequests');
    this.incrementCount('connectionRequests');

    // In production, this would use LinkedIn's actual API or automation
    // For now, we return a mock response with instructions
    const request: ConnectionRequest = {
      profileUrl,
      message,
      status: 'pending',
    };

    logger.warn('Connection request created (manual action required)', { 
      profileUrl,
    });

    return request;
  }

  /**
   * Send LinkedIn message
   * IMPORTANT: Only to existing connections
   */
  async sendMessage(
    recipientUrl: string,
    message: string,
    subject?: string
  ): Promise<LinkedInMessage> {
    logger.info('Sending LinkedIn message', { recipientUrl });

    this.checkRateLimit('messages');
    this.incrementCount('messages');

    // In production, this would use LinkedIn messaging
    const linkedInMessage: LinkedInMessage = {
      recipientUrl,
      subject,
      message,
      sentAt: new Date(),
      status: 'sent',
    };

    logger.warn('Message queued (manual action required)', { 
      recipientUrl,
    });

    return linkedInMessage;
  }

  /**
   * Find prospects by criteria
   */
  async findProspects(criteria: {
    targetTitle: string;
    targetCompany?: string;
    location?: string;
    industry?: string;
    companySize?: string;
    limit?: number;
  }): Promise<LinkedInProfile[]> {
    logger.info('Finding LinkedIn prospects', { criteria });

    const searchParams: LinkedInSearchParams = {
      title: criteria.targetTitle,
      company: criteria.targetCompany,
      location: criteria.location,
      industry: criteria.industry,
      limit: criteria.limit || 25,
    };

    return await this.searchProfiles(searchParams);
  }

  /**
   * Research company on LinkedIn
   */
  async researchCompany(companyName: string): Promise<{
    name: string;
    description: string;
    industry: string;
    size: string;
    location: string;
    website: string;
    employees: LinkedInProfile[];
  }> {
    logger.info('Researching company on LinkedIn', { companyName });

    const companyUrl = `https://www.linkedin.com/company/${this.slugify(companyName)}`;

    try {
      const result = await this.webScraper.scrape({
        url: companyUrl,
        method: 'dynamic',
        extractRules: [
          { name: 'description', selector: '.org-page-details__definition-text', multiple: false },
          { name: 'industry', selector: '.org-top-card-summary-info-list__info-item', multiple: false },
          { name: 'size', selector: '.org-about-company-module__company-size-definition-text', multiple: false },
          { name: 'website', selector: '.link-without-visited-state', attribute: 'href', multiple: false },
        ],
      });

      // Find key employees
      const employees = await this.searchProfiles({
        company: companyName,
        limit: 10,
      });

      return {
        name: companyName,
        description: result.extractedData?.description || '',
        industry: result.extractedData?.industry || '',
        size: result.extractedData?.size || '',
        location: '',
        website: result.extractedData?.website || '',
        employees,
      };

    } catch (error: any) {
      logger.error('Company research failed', { 
        error: error.message, 
        companyName,
      });
      throw new Error(`Company research failed: ${error.message}`);
    }
  }

  /**
   * Build LinkedIn search URL
   */
  private buildSearchUrl(params: LinkedInSearchParams): string {
    const baseUrl = 'https://www.linkedin.com/search/results/people/';
    const queryParams = new URLSearchParams();

    if (params.keywords) {
      queryParams.append('keywords', params.keywords);
    }
    if (params.title) {
      queryParams.append('title', params.title);
    }
    if (params.company) {
      queryParams.append('company', params.company);
    }
    if (params.location) {
      queryParams.append('location', params.location);
    }

    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Parse search results from LinkedIn HTML
   */
  private parseSearchResults(html: string): LinkedInProfile[] {
    // This is a simplified parser
    // In production, use proper HTML parsing with Cheerio
    const profiles: LinkedInProfile[] = [];

    // Extract profile data from search results
    // This would need to be updated based on LinkedIn's actual HTML structure

    return profiles;
  }

  /**
   * Extract company from headline
   */
  private extractCompany(headline?: string): string {
    if (!headline) return '';
    
    const match = headline.match(/at (.+?)(?:\||$)/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract position from headline
   */
  private extractPosition(headline?: string): string {
    if (!headline) return '';
    
    const match = headline.match(/^(.+?)\s+(?:at|@)/i);
    return match ? match[1].trim() : headline;
  }

  /**
   * Convert company name to URL slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(action: keyof typeof this.rateLimits): void {
    // Reset daily counts if needed
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.dailyCounts.lastReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 24) {
      this.dailyCounts = {
        profileViews: 0,
        connectionRequests: 0,
        messages: 0,
        lastReset: now,
      };
    }

    // Check limits
    const limit = this.rateLimits[action];
    const current = this.dailyCounts[action as keyof typeof this.dailyCounts] as number;

    if (current >= limit) {
      throw new Error(`LinkedIn rate limit exceeded for ${action}. Limit: ${limit}/day`);
    }
  }

  /**
   * Increment action count
   */
  private incrementCount(action: keyof typeof this.dailyCounts): void {
    if (typeof this.dailyCounts[action] === 'number') {
      (this.dailyCounts[action] as number)++;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    profileViews: { used: number; limit: number };
    connectionRequests: { used: number; limit: number };
    messages: { used: number; limit: number };
    resetsAt: Date;
  } {
    const resetsAt = new Date(this.dailyCounts.lastReset);
    resetsAt.setHours(resetsAt.getHours() + 24);

    return {
      profileViews: {
        used: this.dailyCounts.profileViews,
        limit: this.rateLimits.profileViews,
      },
      connectionRequests: {
        used: this.dailyCounts.connectionRequests,
        limit: this.rateLimits.connectionRequests,
      },
      messages: {
        used: this.dailyCounts.messages,
        limit: this.rateLimits.messages,
      },
      resetsAt,
    };
  }
}
