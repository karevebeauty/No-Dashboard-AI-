import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

export interface ScrapingOptions {
  url: string;
  method?: 'static' | 'dynamic';
  waitFor?: string; // CSS selector to wait for
  timeout?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  extractRules?: ExtractRule[];
}

export interface ExtractRule {
  name: string;
  selector: string;
  attribute?: string;
  multiple?: boolean;
  transform?: (value: string) => any;
}

export interface ScrapingResult {
  url: string;
  title?: string;
  content: string;
  extractedData?: Record<string, any>;
  metadata: {
    scrapedAt: Date;
    method: 'static' | 'dynamic';
    statusCode?: number;
    contentLength: number;
  };
}

/**
 * Web Scraping Service
 * Handles both static HTML and dynamic JavaScript-rendered content
 */
export class WebScrapingService {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];

  /**
   * Scrape a URL with automatic method detection
   */
  async scrape(options: ScrapingOptions): Promise<ScrapingResult> {
    try {
      logger.info('Starting web scrape', { url: options.url, method: options.method });

      // Check robots.txt (basic implementation)
      await this.checkRobotsTxt(options.url);

      // Use static scraping for most cases (faster, less resource-intensive)
      if (options.method !== 'dynamic') {
        try {
          return await this.scrapeStatic(options);
        } catch (error) {
          logger.warn('Static scraping failed, falling back to dynamic', { url: options.url });
          // Fall back to dynamic scraping if static fails
          options.method = 'dynamic';
        }
      }

      // Dynamic scraping for JavaScript-heavy sites
      return await this.scrapeDynamic(options);

    } catch (error: any) {
      logger.error('Web scraping failed', { url: options.url, error: error.message });
      throw new Error(`Failed to scrape ${options.url}: ${error.message}`);
    }
  }

  /**
   * Static HTML scraping (faster, works for most sites)
   */
  private async scrapeStatic(options: ScrapingOptions): Promise<ScrapingResult> {
    const userAgent = options.userAgent || this.getRandomUserAgent();
    const timeout = options.timeout || 30000;

    const response = await axios.get(options.url, {
      headers: {
        'User-Agent': userAgent,
        ...options.headers,
      },
      timeout,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Extract title
    const title = $('title').text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('h1').first().text().trim();

    // Extract main content (prioritize article/main tags)
    let content = '';
    if ($('article').length > 0) {
      content = $('article').text().trim();
    } else if ($('main').length > 0) {
      content = $('main').text().trim();
    } else {
      content = $('body').text().trim();
    }

    // Clean up content
    content = this.cleanContent(content);

    // Extract structured data if rules provided
    const extractedData = options.extractRules 
      ? this.extractStructuredData($, options.extractRules)
      : undefined;

    return {
      url: options.url,
      title,
      content,
      extractedData,
      metadata: {
        scrapedAt: new Date(),
        method: 'static',
        statusCode: response.status,
        contentLength: content.length,
      },
    };
  }

  /**
   * Dynamic scraping using Playwright (for JavaScript-rendered content)
   */
  private async scrapeDynamic(options: ScrapingOptions): Promise<ScrapingResult> {
    // Import Playwright dynamically
    const playwright = await import('playwright');
    
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const context = await browser.newContext({
        userAgent: options.userAgent || this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();

      // Set custom headers if provided
      if (options.headers) {
        await page.setExtraHTTPHeaders(options.headers);
      }

      // Navigate to URL
      await page.goto(options.url, {
        waitUntil: 'networkidle',
        timeout: options.timeout || 30000,
      });

      // Wait for specific selector if provided
      if (options.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 10000 });
      }

      // Extract title
      const title = await page.title();

      // Extract content
      let content = await page.evaluate(() => {
        const article = document.querySelector('article');
        const main = document.querySelector('main');
        const body = document.body;
        
        const element = article || main || body;
        return element ? element.innerText : '';
      });

      content = this.cleanContent(content);

      // Extract structured data if rules provided
      let extractedData: Record<string, any> | undefined;
      if (options.extractRules) {
        extractedData = await this.extractStructuredDataDynamic(page, options.extractRules);
      }

      await browser.close();

      return {
        url: options.url,
        title,
        content,
        extractedData,
        metadata: {
          scrapedAt: new Date(),
          method: 'dynamic',
          contentLength: content.length,
        },
      };

    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Extract structured data using CSS selectors (static)
   */
  private extractStructuredData(
    $: cheerio.CheerioAPI,
    rules: ExtractRule[]
  ): Record<string, any> {
    const data: Record<string, any> = {};

    for (const rule of rules) {
      try {
        if (rule.multiple) {
          const values: any[] = [];
          $(rule.selector).each((_, element) => {
            let value = rule.attribute
              ? $(element).attr(rule.attribute)
              : $(element).text().trim();
            
            if (value && rule.transform) {
              value = rule.transform(value);
            }
            
            if (value) {
              values.push(value);
            }
          });
          data[rule.name] = values;
        } else {
          let value = rule.attribute
            ? $(rule.selector).attr(rule.attribute)
            : $(rule.selector).text().trim();
          
          if (value && rule.transform) {
            value = rule.transform(value);
          }
          
          data[rule.name] = value;
        }
      } catch (error) {
        logger.warn('Failed to extract data for rule', { rule: rule.name, error });
        data[rule.name] = null;
      }
    }

    return data;
  }

  /**
   * Extract structured data using Playwright
   */
  private async extractStructuredDataDynamic(
    page: any,
    rules: ExtractRule[]
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    for (const rule of rules) {
      try {
        if (rule.multiple) {
          const values = await page.$$eval(
            rule.selector,
            (elements: Element[], attr: string | undefined) => {
              return elements.map(el => {
                return attr ? el.getAttribute(attr) : el.textContent?.trim();
              }).filter(Boolean);
            },
            rule.attribute
          );
          
          data[rule.name] = rule.transform 
            ? values.map(rule.transform)
            : values;
        } else {
          const value = await page.$eval(
            rule.selector,
            (el: Element, attr: string | undefined) => {
              return attr ? el.getAttribute(attr) : el.textContent?.trim();
            },
            rule.attribute
          );
          
          data[rule.name] = rule.transform && value 
            ? rule.transform(value)
            : value;
        }
      } catch (error) {
        logger.warn('Failed to extract data for rule', { rule: rule.name, error });
        data[rule.name] = null;
      }
    }

    return data;
  }

  /**
   * Take screenshot of a webpage
   */
  async takeScreenshot(url: string, options?: {
    fullPage?: boolean;
    selector?: string;
    width?: number;
    height?: number;
  }): Promise<Buffer> {
    const playwright = await import('playwright');
    
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { 
        width: options?.width || 1920, 
        height: options?.height || 1080 
      },
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      let screenshot: Buffer;
      if (options?.selector) {
        const element = await page.$(options.selector);
        if (!element) {
          throw new Error(`Element not found: ${options.selector}`);
        }
        screenshot = await element.screenshot();
      } else {
        screenshot = await page.screenshot({ 
          fullPage: options?.fullPage ?? false 
        });
      }

      await browser.close();
      return screenshot;

    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Generate PDF from webpage
   */
  async generatePDF(url: string, options?: {
    format?: 'A4' | 'Letter';
    landscape?: boolean;
  }): Promise<Buffer> {
    const playwright = await import('playwright');
    
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      const pdf = await page.pdf({
        format: options?.format || 'A4',
        landscape: options?.landscape ?? false,
        printBackground: true,
      });

      await browser.close();
      return pdf;

    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Search Google and return results
   */
  async searchGoogle(query: string, limit: number = 10): Promise<Array<{
    title: string;
    url: string;
    snippet: string;
  }>> {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}`;
    
    const result = await this.scrapeStatic({
      url: searchUrl,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const $ = cheerio.load(result.content);
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Parse Google search results
    $('.g').each((_, element) => {
      const $elem = $(element);
      const title = $elem.find('h3').text().trim();
      const url = $elem.find('a').attr('href');
      const snippet = $elem.find('.VwiC3b').text().trim() || 
                      $elem.find('.s').text().trim();

      if (title && url) {
        results.push({ title, url, snippet });
      }
    });

    return results.slice(0, limit);
  }

  /**
   * Clean extracted content
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Check robots.txt (basic implementation)
   */
  private async checkRobotsTxt(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      const response = await axios.get(robotsUrl, { timeout: 5000 });
      const robotsTxt = response.data;

      // Basic check - look for "Disallow: /"
      if (robotsTxt.includes('Disallow: /')) {
        logger.warn('robots.txt may disallow scraping', { url });
        // Continue anyway but log the warning
      }
    } catch (error) {
      // If robots.txt doesn't exist, that's fine
      logger.debug('robots.txt not found or inaccessible', { url });
    }
  }

  /**
   * Get random user agent
   */
  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Summarize content for SMS delivery
   */
  summarizeForSMS(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Take first N characters and add ellipsis
    const summary = content.substring(0, maxLength - 3).trim();
    const lastSpace = summary.lastIndexOf(' ');
    
    return summary.substring(0, lastSpace) + '...';
  }
}
