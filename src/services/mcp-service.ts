import { config } from '../config';
import { logger } from '../utils/logger';
import { MCPTool, MCPToolResult, MCPError } from '../types';
import { GoogleWorkspaceClient } from '../integrations/google-workspace';
import { NotionClient } from '../integrations/notion-client';
import { SlackClient } from '../integrations/slack-client';
import { ErpClient } from '../integrations/erp-client';

/**
 * MCP Service manages all integrations with external systems
 * This is the central hub for tool registration and execution
 */
export class MCPService {
  private tools: Map<string, MCPTool>;
  private toolHandlers: Map<string, (params: any) => Promise<any>>;
  private googleClient: GoogleWorkspaceClient | null = null;
  private notionClient: NotionClient | null = null;
  private slackClient: SlackClient | null = null;
  private erpClient: ErpClient | null = null;

  constructor() {
    this.tools = new Map();
    this.toolHandlers = new Map();
    this.initializeIntegrations();
    this.registerTools();
  }

  /**
   * Initialize integration clients based on available config
   */
  private initializeIntegrations(): void {
    const integrations = config.integrations;

    if (integrations.google) {
      try {
        this.googleClient = new GoogleWorkspaceClient(
          integrations.google.clientId,
          integrations.google.clientSecret,
          integrations.google.refreshToken
        );
        logger.info('Google Workspace integration initialized');
      } catch (error: any) {
        logger.error('Failed to initialize Google Workspace', { error: error.message });
      }
    } else {
      logger.info('Google Workspace not configured (skipping)');
    }

    if (integrations.notion) {
      try {
        this.notionClient = new NotionClient(integrations.notion.apiKey);
        logger.info('Notion integration initialized');
      } catch (error: any) {
        logger.error('Failed to initialize Notion', { error: error.message });
      }
    } else {
      logger.info('Notion not configured (skipping)');
    }

    if (integrations.slack) {
      try {
        this.slackClient = new SlackClient(integrations.slack.botToken);
        logger.info('Slack integration initialized');
      } catch (error: any) {
        logger.error('Failed to initialize Slack', { error: error.message });
      }
    } else {
      logger.info('Slack not configured (skipping)');
    }

    if (integrations.erp) {
      try {
        this.erpClient = new ErpClient(integrations.erp.apiUrl, integrations.erp.apiKey);
        logger.info('ERP integration initialized');
      } catch (error: any) {
        logger.error('Failed to initialize ERP', { error: error.message });
      }
    } else {
      logger.info('ERP not configured (skipping)');
    }
  }

  /**
   * Register all available MCP tools
   */
  private registerTools(): void {
    // ERP & Warehouse Tools
    this.registerTool({
      name: 'erp_get_inventory',
      description: 'Check inventory levels for products across all locations. Returns current stock, warehouse stock, in-transit quantities, and reorder points.',
      input_schema: {
        type: 'object',
        properties: {
          brand: { type: 'string', description: 'Brand name (e.g., "Carol\'s Daughter", "Dermablend")' },
          productType: { type: 'string', description: 'Product type (e.g., "moisturizer", "serum")' },
          sku: { type: 'string', description: 'Specific SKU code' },
          location: { type: 'string', description: 'Warehouse location' },
        },
      },
      annotations: { readOnlyHint: true },
    }, this.erpGetInventory.bind(this));

    this.registerTool({
      name: 'erp_get_po_status',
      description: 'Get purchase order status and details including items, vendor, dates, and approval status.',
      input_schema: {
        type: 'object',
        properties: {
          poNumber: { type: 'string', description: 'Purchase order number' },
        },
        required: ['poNumber'],
      },
      annotations: { readOnlyHint: true },
    }, this.erpGetPOStatus.bind(this));

    this.registerTool({
      name: 'erp_create_po',
      description: 'Create a new purchase order with specified items and vendor.',
      input_schema: {
        type: 'object',
        properties: {
          vendor: { type: 'string', description: 'Vendor name' },
          items: {
            type: 'array',
            description: 'Array of items to order',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
              },
            },
          },
          expectedDate: { type: 'string', description: 'Expected delivery date (ISO format)' },
        },
        required: ['vendor', 'items'],
      },
      annotations: { destructiveHint: true },
    }, this.erpCreatePO.bind(this));

    // Gmail Tools
    this.registerTool({
      name: 'gmail_search_messages',
      description: 'Search Gmail messages using query syntax.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g., "from:vendor@example.com subject:invoice")' },
          maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
    }, this.gmailSearchMessages.bind(this));

    this.registerTool({
      name: 'gmail_send_message',
      description: 'Send an email message via Gmail.',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (HTML or plain text)' },
          cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
          attachments: { type: 'array', description: 'File attachments' },
        },
        required: ['to', 'subject', 'body'],
      },
      annotations: { destructiveHint: true },
    }, this.gmailSendMessage.bind(this));

    // Google Calendar Tools
    this.registerTool({
      name: 'gcal_list_events',
      description: 'List calendar events within a date range.',
      input_schema: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date (ISO format)' },
          endDate: { type: 'string', description: 'End date (ISO format)' },
          query: { type: 'string', description: 'Search query for event title' },
        },
      },
      annotations: { readOnlyHint: true },
    }, this.gcalListEvents.bind(this));

    this.registerTool({
      name: 'gcal_create_event',
      description: 'Create a new calendar event with attendees and meeting link.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          startTime: { type: 'string', description: 'Start time (ISO format or natural language like "tomorrow 2pm")' },
          duration: { type: 'number', description: 'Duration in minutes (default: 60)' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
          description: { type: 'string', description: 'Event description' },
          location: { type: 'string', description: 'Event location' },
        },
        required: ['title', 'startTime'],
      },
      annotations: { destructiveHint: true },
    }, this.gcalCreateEvent.bind(this));

    // Google Drive Tools
    this.registerTool({
      name: 'gdrive_search',
      description: 'Search for files in Google Drive by name or content.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          fileType: { type: 'string', description: 'File type filter (e.g., "pdf", "spreadsheet")' },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
    }, this.gdriveSearch.bind(this));

    // Notion Tools
    this.registerTool({
      name: 'notion_search',
      description: 'Search Notion workspace for pages and databases.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
    }, this.notionSearch.bind(this));

    // Slack Tools
    this.registerTool({
      name: 'slack_send_message',
      description: 'Send a message to a Slack channel.',
      input_schema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name or ID' },
          text: { type: 'string', description: 'Message text' },
        },
        required: ['channel', 'text'],
      },
      annotations: { destructiveHint: true },
    }, this.slackSendMessage.bind(this));

    // CareFlow Customer Support Tools
    this.registerTool({
      name: 'careflow_get_tickets',
      description: 'Get customer support tickets with optional filtering.',
      input_schema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status (open, pending, resolved, closed)' },
          priority: { type: 'string', description: 'Filter by priority (low, medium, high, urgent)' },
          limit: { type: 'number', description: 'Maximum tickets to return (default: 20)' },
        },
      },
      annotations: { readOnlyHint: true },
    }, this.careflowGetTickets.bind(this));

    // Web Scraping & Research Tools
    this.registerWebScrapingTools();

    logger.info(`Registered ${this.tools.size} MCP tools`);
  }

  /**
   * Register a single tool
   */
  private registerTool(
    tool: MCPTool,
    handler: (params: any) => Promise<any>
  ): void {
    this.tools.set(tool.name, tool);
    this.toolHandlers.set(tool.name, handler);
  }

  /**
   * Get available tools based on user permissions
   */
  async getAvailableTools(permissions: string[]): Promise<MCPTool[]> {
    // For full access user, return all tools
    if (permissions.includes('*')) {
      return Array.from(this.tools.values());
    }

    // Filter tools based on permissions
    const availableTools: MCPTool[] = [];
    for (const [name, tool] of this.tools.entries()) {
      const toolCategory = name.split('_')[0]; // e.g., 'erp', 'gmail'
      if (permissions.includes(toolCategory) || permissions.includes(name)) {
        availableTools.push(tool);
      }
    }

    return availableTools;
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, params: any): Promise<MCPToolResult> {
    const startTime = Date.now();

    try {
      const handler = this.toolHandlers.get(name);
      if (!handler) {
        throw new MCPError(`Tool not found: ${name}`, name);
      }

      logger.info('Executing MCP tool', { name, params });

      const result = await handler(params);
      const executionTime = Date.now() - startTime;

      logger.info('MCP tool executed successfully', {
        name,
        executionTime,
      });

      return {
        toolName: name,
        result,
        timestamp: new Date(),
        executionTime,
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      logger.error('MCP tool execution failed', {
        name,
        error: error.message,
        executionTime,
      });

      return {
        toolName: name,
        result: null,
        error: error.message,
        timestamp: new Date(),
        executionTime,
      };
    }
  }

  // =====================================================================
  // TOOL IMPLEMENTATIONS
  // These are placeholder implementations - replace with actual API calls
  // =====================================================================

  // =====================================================================
  // REAL INTEGRATION HANDLERS
  // Each checks if its client is configured, then delegates the API call
  // =====================================================================

  private async erpGetInventory(params: any): Promise<any> {
    if (!this.erpClient) {
      return { error: 'ERP integration not configured.', hint: 'Set ERP_API_URL and ERP_API_KEY environment variables.' };
    }
    return await this.erpClient.getInventory(params);
  }

  private async erpGetPOStatus(params: any): Promise<any> {
    if (!this.erpClient) {
      return { error: 'ERP integration not configured.', hint: 'Set ERP_API_URL and ERP_API_KEY environment variables.' };
    }
    return await this.erpClient.getPOStatus(params);
  }

  private async erpCreatePO(params: any): Promise<any> {
    if (!this.erpClient) {
      return { error: 'ERP integration not configured.', hint: 'Set ERP_API_URL and ERP_API_KEY environment variables.' };
    }
    return await this.erpClient.createPO(params);
  }

  private async gmailSearchMessages(params: any): Promise<any> {
    if (!this.googleClient) {
      return { error: 'Gmail not configured.', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' };
    }
    return await this.googleClient.searchMessages(params);
  }

  private async gmailSendMessage(params: any): Promise<any> {
    if (!this.googleClient) {
      return { error: 'Gmail not configured.', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' };
    }
    return await this.googleClient.sendMessage(params);
  }

  private async gcalListEvents(params: any): Promise<any> {
    if (!this.googleClient) {
      return { error: 'Google Calendar not configured.', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' };
    }
    return await this.googleClient.listEvents(params);
  }

  private async gcalCreateEvent(params: any): Promise<any> {
    if (!this.googleClient) {
      return { error: 'Google Calendar not configured.', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' };
    }
    return await this.googleClient.createEvent(params);
  }

  private async gdriveSearch(params: any): Promise<any> {
    if (!this.googleClient) {
      return { error: 'Google Drive not configured.', hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' };
    }
    return await this.googleClient.searchFiles(params);
  }

  private async notionSearch(params: any): Promise<any> {
    if (!this.notionClient) {
      return { error: 'Notion not configured.', hint: 'Set NOTION_API_KEY environment variable.' };
    }
    return await this.notionClient.search(params);
  }

  private async slackSendMessage(params: any): Promise<any> {
    if (!this.slackClient) {
      return { error: 'Slack not configured.', hint: 'Set SLACK_BOT_TOKEN environment variable.' };
    }
    return await this.slackClient.sendMessage(params);
  }

  // CareFlow: Intentionally not implemented yet
  private async careflowGetTickets(params: any): Promise<any> {
    return {
      error: 'CareFlow integration coming soon.',
      tickets: [],
    };
  }

  /**
   * Register web scraping and research tools
   */
  private registerWebScrapingTools(): void {
    this.registerTool({
      name: 'scrape_url',
      description: 'Scrape content from a URL. Supports both static HTML and dynamic JavaScript-rendered pages. Returns page title, main content, and optionally structured data.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          method: { 
            type: 'string', 
            enum: ['static', 'dynamic'],
            description: 'Scraping method: static for simple HTML, dynamic for JavaScript-heavy sites' 
          },
          extractRules: {
            type: 'array',
            description: 'CSS selectors to extract structured data',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                selector: { type: 'string' },
                attribute: { type: 'string' },
                multiple: { type: 'boolean' },
              },
            },
          },
        },
        required: ['url'],
      },
      annotations: { readOnlyHint: true },
    }, this.scrapeUrl.bind(this));

    this.registerTool({
      name: 'search_web',
      description: 'Search Google and return top results with titles, URLs, and snippets.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Number of results (default: 10, max: 20)' },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
    }, this.searchWeb.bind(this));

    this.registerTool({
      name: 'take_screenshot',
      description: 'Take a screenshot of a webpage. Returns base64-encoded image.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to screenshot' },
          fullPage: { type: 'boolean', description: 'Capture full page (default: false)' },
          selector: { type: 'string', description: 'CSS selector to screenshot specific element' },
          width: { type: 'number', description: 'Viewport width (default: 1920)' },
          height: { type: 'number', description: 'Viewport height (default: 1080)' },
        },
        required: ['url'],
      },
      annotations: { readOnlyHint: true },
    }, this.takeScreenshot.bind(this));

    this.registerTool({
      name: 'extract_product_info',
      description: 'Extract product information from e-commerce pages (price, title, availability, images).',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Product page URL' },
        },
        required: ['url'],
      },
      annotations: { readOnlyHint: true },
    }, this.extractProductInfo.bind(this));

    this.registerTool({
      name: 'monitor_price',
      description: 'Monitor a product URL for price changes. Sets up periodic checking.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Product page URL' },
          targetPrice: { type: 'number', description: 'Alert when price drops below this' },
          interval: { type: 'string', description: 'Check interval (hourly, daily)' },
        },
        required: ['url'],
      },
      annotations: { destructiveHint: true },
    }, this.monitorPrice.bind(this));
  }

  // Web scraping tool implementations
  private async scrapeUrl(params: any): Promise<any> {
    const webScraper = new (await import('./web-scraping-service')).WebScrapingService();
    
    const result = await webScraper.scrape({
      url: params.url,
      method: params.method || 'static',
      extractRules: params.extractRules,
    });

    return {
      url: result.url,
      title: result.title,
      content: webScraper.summarizeForSMS(result.content, 1000),
      fullContent: result.content,
      extractedData: result.extractedData,
      metadata: result.metadata,
    };
  }

  private async searchWeb(params: any): Promise<any> {
    const webScraper = new (await import('./web-scraping-service')).WebScrapingService();
    
    const results = await webScraper.searchGoogle(
      params.query,
      Math.min(params.limit || 10, 20)
    );

    return {
      query: params.query,
      results,
      count: results.length,
    };
  }

  private async takeScreenshot(params: any): Promise<any> {
    const webScraper = new (await import('./web-scraping-service')).WebScrapingService();
    
    const screenshot = await webScraper.takeScreenshot(params.url, {
      fullPage: params.fullPage,
      selector: params.selector,
      width: params.width,
      height: params.height,
    });

    // Convert to base64 for transport
    const base64 = screenshot.toString('base64');

    return {
      url: params.url,
      screenshot: base64,
      size: screenshot.length,
      format: 'png',
    };
  }

  private async extractProductInfo(params: any): Promise<any> {
    const webScraper = new (await import('./web-scraping-service')).WebScrapingService();
    
    // Common product page selectors
    const extractRules = [
      { name: 'title', selector: 'h1, .product-title, [itemprop="name"]', multiple: false },
      { name: 'price', selector: '.price, [itemprop="price"], .product-price', multiple: false },
      { name: 'availability', selector: '.availability, [itemprop="availability"]', multiple: false },
      { name: 'image', selector: '.product-image img, [itemprop="image"]', attribute: 'src', multiple: false },
      { name: 'description', selector: '.description, [itemprop="description"], .product-description', multiple: false },
      { name: 'rating', selector: '[itemprop="ratingValue"], .rating', multiple: false },
    ];

    const result = await webScraper.scrape({
      url: params.url,
      method: 'dynamic',
      extractRules,
    });

    return {
      url: params.url,
      productInfo: result.extractedData,
      scrapedAt: result.metadata.scrapedAt,
    };
  }

  private async monitorPrice(params: any): Promise<any> {
    // TODO: Implement actual price monitoring with cron jobs
    return {
      monitorId: `monitor-${Date.now()}`,
      url: params.url,
      targetPrice: params.targetPrice,
      interval: params.interval || 'daily',
      status: 'active',
      message: 'Price monitoring activated. You will receive alerts when price changes.',
    };
  }
}
