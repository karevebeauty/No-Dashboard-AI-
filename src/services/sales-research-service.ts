import axios from 'axios';
import { WebScrapingService } from './web-scraping-service';
import { LinkedInAutomationService } from './linkedin-automation-service';
import { logger } from '../utils/logger';

export interface CompanyData {
  name: string;
  domain: string;
  industry: string;
  size: string;
  revenue?: string;
  description: string;
  location: string;
  founded?: string;
  technologies?: string[];
  socialProfiles?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  keyPeople?: Array<{
    name: string;
    title: string;
    linkedinUrl?: string;
  }>;
}

export interface ContactData {
  name: string;
  email?: string;
  phone?: string;
  title: string;
  company: string;
  linkedinUrl?: string;
  location?: string;
  verified: boolean;
  score?: number; // 0-100 lead score
}

export interface LeadScore {
  score: number;
  factors: {
    titleMatch: number;
    companySize: number;
    industry: number;
    engagement: number;
    timing: number;
  };
  recommendation: 'hot' | 'warm' | 'cold';
}

/**
 * Sales Research and Enrichment Service
 * Finds prospects, enriches data, scores leads
 */
export class SalesResearchService {
  private webScraper: WebScrapingService;
  private linkedInService: LinkedInAutomationService;

  constructor() {
    this.webScraper = new WebScrapingService();
    this.linkedInService = new LinkedInAutomationService();
  }

  /**
   * Research a company comprehensively
   */
  async researchCompany(companyName: string): Promise<CompanyData> {
    logger.info('Researching company', { companyName });

    try {
      // 1. Search for company website
      const searchResults = await this.webScraper.searchGoogle(
        `${companyName} official website`,
        5
      );

      const domain = this.extractDomain(searchResults[0]?.url);

      // 2. Scrape company website
      let websiteData: any = {};
      if (domain) {
        try {
          websiteData = await this.scrapeCompanyWebsite(`https://${domain}`);
        } catch (error) {
          logger.warn('Failed to scrape company website', { domain });
        }
      }

      // 3. Get LinkedIn data
      let linkedInData: any = {};
      try {
        linkedInData = await this.linkedInService.researchCompany(companyName);
      } catch (error) {
        logger.warn('Failed to get LinkedIn company data', { companyName });
      }

      // 4. Combine data
      const companyData: CompanyData = {
        name: companyName,
        domain: domain || '',
        industry: linkedInData.industry || websiteData.industry || '',
        size: linkedInData.size || '',
        revenue: websiteData.revenue,
        description: linkedInData.description || websiteData.description || '',
        location: linkedInData.location || websiteData.location || '',
        founded: websiteData.founded,
        technologies: websiteData.technologies || [],
        socialProfiles: {
          linkedin: linkedInData.url,
          twitter: websiteData.twitter,
          facebook: websiteData.facebook,
        },
        keyPeople: linkedInData.employees?.slice(0, 5).map((emp: any) => ({
          name: emp.name,
          title: emp.position,
          linkedinUrl: emp.profileUrl,
        })) || [],
      };

      logger.info('Company research completed', { 
        companyName,
        hasWebsite: !!domain,
        hasLinkedIn: !!linkedInData.url,
      });

      return companyData;

    } catch (error: any) {
      logger.error('Company research failed', { 
        error: error.message, 
        companyName,
      });
      throw new Error(`Company research failed: ${error.message}`);
    }
  }

  /**
   * Find decision makers at a company
   */
  async findDecisionMakers(
    companyName: string,
    targetTitles: string[]
  ): Promise<ContactData[]> {
    logger.info('Finding decision makers', { companyName, targetTitles });

    const contacts: ContactData[] = [];

    for (const title of targetTitles) {
      try {
        const profiles = await this.linkedInService.findProspects({
          targetCompany: companyName,
          targetTitle: title,
          limit: 5,
        });

        for (const profile of profiles) {
          contacts.push({
            name: profile.name,
            title: profile.position,
            company: profile.company,
            linkedinUrl: profile.profileUrl,
            location: profile.location,
            verified: true,
            score: this.scoreContact(profile, title),
          });
        }
      } catch (error) {
        logger.warn('Failed to find contacts for title', { title });
      }
    }

    // Sort by score
    contacts.sort((a, b) => (b.score || 0) - (a.score || 0));

    logger.info('Decision makers found', { 
      companyName,
      count: contacts.length,
    });

    return contacts;
  }

  /**
   * Enrich contact data
   */
  async enrichContact(
    name: string,
    company?: string
  ): Promise<ContactData> {
    logger.info('Enriching contact', { name, company });

    try {
      // Search for contact on LinkedIn
      const searchQuery = company 
        ? `${name} ${company} linkedin`
        : `${name} linkedin`;

      const searchResults = await this.webScraper.searchGoogle(searchQuery, 3);

      // Find LinkedIn profile
      const linkedInUrl = searchResults.find(r => 
        r.url.includes('linkedin.com/in/')
      )?.url;

      if (linkedInUrl) {
        const profile = await this.linkedInService.getProfile(linkedInUrl);

        return {
          name: profile.name,
          title: profile.position,
          company: profile.company,
          linkedinUrl: profile.profileUrl,
          location: profile.location,
          verified: true,
          score: 70, // Base score for enriched contact
        };
      }

      // Fallback to basic data
      return {
        name,
        title: '',
        company: company || '',
        verified: false,
      };

    } catch (error: any) {
      logger.error('Contact enrichment failed', { 
        error: error.message, 
        name,
      });
      throw new Error(`Contact enrichment failed: ${error.message}`);
    }
  }

  /**
   * Score a lead based on multiple factors
   */
  scoreContact(profile: any, targetTitle: string): number {
    let score = 0;

    // Title match (0-30 points)
    if (profile.position?.toLowerCase().includes(targetTitle.toLowerCase())) {
      score += 30;
    } else if (this.isSimilarTitle(profile.position, targetTitle)) {
      score += 20;
    }

    // Seniority (0-25 points)
    if (this.isSeniorTitle(profile.position)) {
      score += 25;
    } else if (this.isManagerTitle(profile.position)) {
      score += 15;
    }

    // Company size indicator (0-20 points)
    const connections = parseInt(profile.connections?.replace(/[^0-9]/g, '') || '0');
    if (connections > 500) score += 20;
    else if (connections > 200) score += 10;

    // Profile completeness (0-15 points)
    if (profile.about) score += 5;
    if (profile.experience?.length > 0) score += 5;
    if (profile.education?.length > 0) score += 5;

    // Activity/engagement (0-10 points)
    // This would check recent posts, but we'll use a baseline
    score += 5;

    return Math.min(100, score);
  }

  /**
   * Find prospects matching ICP (Ideal Customer Profile)
   */
  async findProspectsByICP(icp: {
    industries: string[];
    companySize: string[];
    titles: string[];
    locations?: string[];
    limit?: number;
  }): Promise<ContactData[]> {
    logger.info('Finding prospects by ICP', { icp });

    const allProspects: ContactData[] = [];

    for (const industry of icp.industries) {
      for (const title of icp.titles) {
        try {
          const profiles = await this.linkedInService.findProspects({
            targetTitle: title,
            industry,
            limit: Math.ceil((icp.limit || 50) / (icp.industries.length * icp.titles.length)),
          });

          for (const profile of profiles) {
            const leadScore = this.calculateLeadScore({
              title: profile.position,
              company: profile.company,
              industry,
              targetTitle: title,
            });

            allProspects.push({
              name: profile.name,
              title: profile.position,
              company: profile.company,
              linkedinUrl: profile.profileUrl,
              location: profile.location,
              verified: true,
              score: leadScore.score,
            });
          }
        } catch (error) {
          logger.warn('Failed to find prospects', { industry, title });
        }
      }
    }

    // Sort by score and limit results
    allProspects.sort((a, b) => (b.score || 0) - (a.score || 0));
    const topProspects = allProspects.slice(0, icp.limit || 50);

    logger.info('Prospects found by ICP', { 
      total: topProspects.length,
      averageScore: topProspects.reduce((sum, p) => sum + (p.score || 0), 0) / topProspects.length,
    });

    return topProspects;
  }

  /**
   * Calculate comprehensive lead score
   */
  private calculateLeadScore(data: {
    title: string;
    company: string;
    industry: string;
    targetTitle: string;
  }): LeadScore {
    const factors = {
      titleMatch: this.scoreTitleMatch(data.title, data.targetTitle),
      companySize: 15, // Would be based on actual company data
      industry: this.scoreIndustry(data.industry),
      engagement: 10, // Would be based on LinkedIn activity
      timing: 10, // Would be based on recent job changes, company growth, etc.
    };

    const score = Object.values(factors).reduce((sum, val) => sum + val, 0);

    let recommendation: 'hot' | 'warm' | 'cold';
    if (score >= 70) recommendation = 'hot';
    else if (score >= 50) recommendation = 'warm';
    else recommendation = 'cold';

    return { score, factors, recommendation };
  }

  /**
   * Scrape company website for data
   */
  private async scrapeCompanyWebsite(url: string): Promise<any> {
    const result = await this.webScraper.scrape({
      url,
      method: 'static',
      extractRules: [
        { name: 'description', selector: 'meta[name="description"]', attribute: 'content' },
        { name: 'founded', selector: '[class*="founded"], [class*="since"]' },
        { name: 'location', selector: '[class*="location"], [class*="address"]' },
      ],
    });

    return {
      description: result.extractedData?.description,
      founded: result.extractedData?.founded,
      location: result.extractedData?.location,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url?: string): string | null {
    if (!url) return null;
    
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  /**
   * Check if title is similar to target
   */
  private isSimilarTitle(title: string, target: string): boolean {
    const titleLower = title.toLowerCase();
    const targetLower = target.toLowerCase();

    const titleWords = titleLower.split(/\s+/);
    const targetWords = targetLower.split(/\s+/);

    const matches = titleWords.filter(word => targetWords.includes(word));
    return matches.length / targetWords.length >= 0.5;
  }

  /**
   * Check if title indicates senior level
   */
  private isSeniorTitle(title: string): boolean {
    const seniorKeywords = ['ceo', 'cto', 'cfo', 'chief', 'president', 'vp', 'vice president', 'director', 'head of'];
    return seniorKeywords.some(keyword => title.toLowerCase().includes(keyword));
  }

  /**
   * Check if title indicates manager level
   */
  private isManagerTitle(title: string): boolean {
    const managerKeywords = ['manager', 'lead', 'senior', 'principal'];
    return managerKeywords.some(keyword => title.toLowerCase().includes(keyword));
  }

  /**
   * Score title match
   */
  private scoreTitleMatch(title: string, target: string): number {
    if (title.toLowerCase() === target.toLowerCase()) return 30;
    if (title.toLowerCase().includes(target.toLowerCase())) return 25;
    if (this.isSimilarTitle(title, target)) return 15;
    return 0;
  }

  /**
   * Score industry relevance
   */
  private scoreIndustry(industry: string): number {
    // This would be customized based on your target industries
    const highValueIndustries = ['technology', 'software', 'saas', 'fintech', 'healthcare'];
    
    if (highValueIndustries.some(ind => industry.toLowerCase().includes(ind))) {
      return 20;
    }
    return 10;
  }
}
