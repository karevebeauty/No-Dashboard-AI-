import { logger } from '../utils/logger';
import { MCPService } from './mcp-service';
import { WebScrapingService } from './web-scraping-service';
import { ActionConfirmationService } from './action-confirmation-service';

export interface TaskStep {
  type: 'research' | 'extract' | 'decide' | 'action';
  description: string;
  tool?: string;
  params?: any;
  condition?: (context: TaskContext) => boolean;
}

export interface TaskContext {
  phoneNumber: string;
  originalRequest: string;
  steps: Array<{
    step: TaskStep;
    result: any;
    timestamp: Date;
  }>;
  decisions: Record<string, any>;
  extractedData: Record<string, any>;
}

export interface AutonomousTask {
  id: string;
  phoneNumber: string;
  description: string;
  steps: TaskStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_confirmation';
  createdAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

/**
 * Autonomous Task Executor
 * Executes multi-step tasks with research, decision-making, and actions
 */
export class AutonomousTaskExecutor {
  private mcpService: MCPService;
  private webScrapingService: WebScrapingService;
  private actionConfirmationService: ActionConfirmationService;
  private runningTasks: Map<string, AutonomousTask>;

  constructor(
    mcpService: MCPService,
    actionConfirmationService: ActionConfirmationService
  ) {
    this.mcpService = mcpService;
    this.webScrapingService = new WebScrapingService();
    this.actionConfirmationService = actionConfirmationService;
    this.runningTasks = new Map();
  }

  /**
   * Execute an autonomous task
   */
  async executeTask(task: AutonomousTask): Promise<any> {
    logger.info('Starting autonomous task execution', {
      taskId: task.id,
      phoneNumber: task.phoneNumber,
      steps: task.steps.length,
    });

    this.runningTasks.set(task.id, task);
    task.status = 'running';

    const context: TaskContext = {
      phoneNumber: task.phoneNumber,
      originalRequest: task.description,
      steps: [],
      decisions: {},
      extractedData: {},
    };

    try {
      for (const step of task.steps) {
        // Check if step has a condition
        if (step.condition && !step.condition(context)) {
          logger.info('Skipping conditional step', { 
            taskId: task.id, 
            stepDescription: step.description 
          });
          continue;
        }

        logger.info('Executing task step', {
          taskId: task.id,
          stepType: step.type,
          stepDescription: step.description,
        });

        let result: any;

        switch (step.type) {
          case 'research':
            result = await this.executeResearchStep(step, context);
            break;
          
          case 'extract':
            result = await this.executeExtractStep(step, context);
            break;
          
          case 'decide':
            result = await this.executeDecideStep(step, context);
            break;
          
          case 'action':
            result = await this.executeActionStep(step, context, task);
            break;
          
          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }

        // Store step result in context
        context.steps.push({
          step,
          result,
          timestamp: new Date(),
        });

        logger.info('Task step completed', {
          taskId: task.id,
          stepType: step.type,
          resultKeys: result ? Object.keys(result) : [],
        });
      }

      task.status = 'completed';
      task.completedAt = new Date();
      task.result = this.formatTaskResult(context);

      logger.info('Autonomous task completed', {
        taskId: task.id,
        totalSteps: context.steps.length,
      });

      return task.result;

    } catch (error: any) {
      logger.error('Autonomous task failed', {
        taskId: task.id,
        error: error.message,
      });

      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();

      throw error;

    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Execute research step (web scraping, search)
   */
  private async executeResearchStep(
    step: TaskStep,
    context: TaskContext
  ): Promise<any> {
    const { tool, params } = step;

    switch (tool) {
      case 'scrape_url':
        return await this.webScrapingService.scrape({
          url: params.url,
          method: params.method,
          extractRules: params.extractRules,
        });

      case 'search_google':
        return await this.webScrapingService.searchGoogle(
          params.query,
          params.limit || 10
        );

      case 'take_screenshot':
        const screenshot = await this.webScrapingService.takeScreenshot(
          params.url,
          params.options
        );
        return { screenshot, size: screenshot.length };

      default:
        throw new Error(`Unknown research tool: ${tool}`);
    }
  }

  /**
   * Execute extract step (parse data from previous steps)
   */
  private async executeExtractStep(
    step: TaskStep,
    context: TaskContext
  ): Promise<any> {
    const { params } = step;

    // Find previous research step
    const researchStep = context.steps
      .filter(s => s.step.type === 'research')
      .reverse()[0];

    if (!researchStep) {
      throw new Error('No research step found for extraction');
    }

    const result = researchStep.result;

    // Extract specific fields based on params
    const extracted: Record<string, any> = {};

    if (params.fields) {
      for (const field of params.fields) {
        if (result.extractedData && result.extractedData[field]) {
          extracted[field] = result.extractedData[field];
        } else if (result[field]) {
          extracted[field] = result[field];
        }
      }
    }

    // Store in context for later use
    Object.assign(context.extractedData, extracted);

    return extracted;
  }

  /**
   * Execute decide step (make decisions based on extracted data)
   */
  private async executeDecideStep(
    step: TaskStep,
    context: TaskContext
  ): Promise<any> {
    const { params } = step;

    // Simple decision logic based on conditions
    const decisions: Record<string, any> = {};

    if (params.conditions) {
      for (const [key, condition] of Object.entries(params.conditions)) {
        const conditionFn = condition as (ctx: TaskContext) => boolean;
        decisions[key] = conditionFn(context);
      }
    }

    // Store decisions in context
    Object.assign(context.decisions, decisions);

    return decisions;
  }

  /**
   * Execute action step (perform actions via MCP tools)
   */
  private async executeActionStep(
    step: TaskStep,
    context: TaskContext,
    task: AutonomousTask
  ): Promise<any> {
    const { tool, params } = step;

    if (!tool) {
      throw new Error('Action step requires a tool');
    }

    // Replace placeholders in params with context data
    const resolvedParams = this.resolveParams(params, context);

    // Check if action requires confirmation
    if (this.actionConfirmationService.requiresConfirmation(tool)) {
      // Create pending action
      const pendingAction = await this.actionConfirmationService.createPendingAction(
        context.phoneNumber,
        tool,
        resolvedParams,
        step.description
      );

      // Mark task as awaiting confirmation
      task.status = 'awaiting_confirmation';

      // Return pending action info
      return {
        pending: true,
        actionId: pendingAction.id,
        description: step.description,
      };
    }

    // Execute action immediately
    const result = await this.mcpService.executeTool(tool, resolvedParams);

    if (result.error) {
      throw new Error(result.error);
    }

    return result.result;
  }

  /**
   * Resolve parameters with context data
   */
  private resolveParams(params: any, context: TaskContext): any {
    if (!params) return params;

    const resolved = { ...params };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Extract variable name from {{variableName}}
        const varName = value.slice(2, -2).trim();
        
        // Look for variable in extracted data or decisions
        if (context.extractedData[varName] !== undefined) {
          resolved[key] = context.extractedData[varName];
        } else if (context.decisions[varName] !== undefined) {
          resolved[key] = context.decisions[varName];
        }
      }
    }

    return resolved;
  }

  /**
   * Format task result for SMS delivery
   */
  private formatTaskResult(context: TaskContext): string {
    const results: string[] = [];

    results.push('✅ Task Completed\n');

    // Summarize each step
    for (const { step, result } of context.steps) {
      results.push(`${this.getStepEmoji(step.type)} ${step.description}`);

      if (step.type === 'research' && result.extractedData) {
        const data = Object.entries(result.extractedData)
          .slice(0, 3) // Limit to first 3 fields
          .map(([key, value]) => `  • ${key}: ${value}`)
          .join('\n');
        
        if (data) {
          results.push(data);
        }
      }

      if (step.type === 'action' && result.pending) {
        results.push(`  ⏳ Awaiting confirmation: ${result.actionId}`);
      }
    }

    return results.join('\n');
  }

  /**
   * Get emoji for step type
   */
  private getStepEmoji(type: string): string {
    switch (type) {
      case 'research': return '🔍';
      case 'extract': return '📊';
      case 'decide': return '🤔';
      case 'action': return '⚡';
      default: return '•';
    }
  }

  /**
   * Create task from natural language command
   */
  createTaskFromCommand(
    phoneNumber: string,
    command: string
  ): AutonomousTask | null {
    // Parse common command patterns
    const taskPatterns = [
      {
        // "Research [topic] and [action]"
        pattern: /research (.+?) and (.+)/i,
        builder: (matches: RegExpMatchArray) => this.buildResearchAndActTask(
          phoneNumber,
          matches[1],
          matches[2]
        ),
      },
      {
        // "Find the price of [product] and order it"
        pattern: /find (?:the )?price of (.+?) and (?:order|buy) it/i,
        builder: (matches: RegExpMatchArray) => this.buildPriceCheckAndOrderTask(
          phoneNumber,
          matches[1]
        ),
      },
      {
        // "Monitor [website] and alert me if [condition]"
        pattern: /monitor (.+?) and alert me (?:if|when) (.+)/i,
        builder: (matches: RegExpMatchArray) => this.buildMonitorTask(
          phoneNumber,
          matches[1],
          matches[2]
        ),
      },
      {
        // "Scrape [url] and extract [data]"
        pattern: /scrape (.+?) and extract (.+)/i,
        builder: (matches: RegExpMatchArray) => this.buildScrapeAndExtractTask(
          phoneNumber,
          matches[1],
          matches[2]
        ),
      },
    ];

    for (const { pattern, builder } of taskPatterns) {
      const match = command.match(pattern);
      if (match) {
        return builder(match);
      }
    }

    return null;
  }

  /**
   * Build research and action task
   */
  private buildResearchAndActTask(
    phoneNumber: string,
    topic: string,
    action: string
  ): AutonomousTask {
    return {
      id: `task-${Date.now()}`,
      phoneNumber,
      description: `Research ${topic} and ${action}`,
      steps: [
        {
          type: 'research',
          description: `Search for information about ${topic}`,
          tool: 'search_google',
          params: { query: topic, limit: 5 },
        },
        {
          type: 'research',
          description: 'Scrape top result',
          tool: 'scrape_url',
          params: { url: '{{topResultUrl}}', method: 'static' },
        },
        {
          type: 'action',
          description: action,
          tool: this.inferActionTool(action),
          params: this.inferActionParams(action),
        },
      ],
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Build price check and order task
   */
  private buildPriceCheckAndOrderTask(
    phoneNumber: string,
    product: string
  ): AutonomousTask {
    return {
      id: `task-${Date.now()}`,
      phoneNumber,
      description: `Find price of ${product} and order`,
      steps: [
        {
          type: 'research',
          description: `Search for ${product} price`,
          tool: 'search_google',
          params: { query: `${product} price buy`, limit: 5 },
        },
        {
          type: 'extract',
          description: 'Extract price information',
          params: { fields: ['price', 'vendor', 'url'] },
        },
        {
          type: 'decide',
          description: 'Check if price is acceptable',
          params: {
            conditions: {
              priceAcceptable: (ctx: TaskContext) => {
                const price = ctx.extractedData.price;
                return price && parseFloat(price.replace(/[^0-9.]/g, '')) < 1000;
              },
            },
          },
        },
        {
          type: 'action',
          description: 'Create purchase order',
          tool: 'erp_create_po',
          params: {
            vendor: '{{vendor}}',
            items: [{ description: product, quantity: 1, unitPrice: '{{price}}' }],
          },
          condition: (ctx) => ctx.decisions.priceAcceptable === true,
        },
      ],
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Build monitor task
   */
  private buildMonitorTask(
    phoneNumber: string,
    website: string,
    condition: string
  ): AutonomousTask {
    return {
      id: `task-${Date.now()}`,
      phoneNumber,
      description: `Monitor ${website} for ${condition}`,
      steps: [
        {
          type: 'research',
          description: `Scrape ${website}`,
          tool: 'scrape_url',
          params: { url: website, method: 'dynamic' },
        },
        {
          type: 'decide',
          description: `Check if ${condition}`,
          params: {
            conditions: {
              conditionMet: (ctx: TaskContext) => {
                // Simple condition checking
                const content = ctx.steps[0]?.result?.content || '';
                return content.toLowerCase().includes(condition.toLowerCase());
              },
            },
          },
        },
        {
          type: 'action',
          description: 'Send alert notification',
          tool: 'notification_send',
          params: {
            message: `Alert: ${condition} detected on ${website}`,
          },
          condition: (ctx) => ctx.decisions.conditionMet === true,
        },
      ],
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Build scrape and extract task
   */
  private buildScrapeAndExtractTask(
    phoneNumber: string,
    url: string,
    dataToExtract: string
  ): AutonomousTask {
    return {
      id: `task-${Date.now()}`,
      phoneNumber,
      description: `Scrape ${url} and extract ${dataToExtract}`,
      steps: [
        {
          type: 'research',
          description: `Scrape ${url}`,
          tool: 'scrape_url',
          params: { url, method: 'static' },
        },
        {
          type: 'extract',
          description: `Extract ${dataToExtract}`,
          params: { fields: [dataToExtract] },
        },
      ],
      status: 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Infer action tool from description
   */
  private inferActionTool(action: string): string {
    const actionLower = action.toLowerCase();

    if (actionLower.includes('email') || actionLower.includes('send')) {
      return 'gmail_send_message';
    }
    if (actionLower.includes('calendar') || actionLower.includes('meeting')) {
      return 'gcal_create_event';
    }
    if (actionLower.includes('po') || actionLower.includes('purchase')) {
      return 'erp_create_po';
    }
    if (actionLower.includes('slack') || actionLower.includes('message')) {
      return 'slack_send_message';
    }
    if (actionLower.includes('notion') || actionLower.includes('page')) {
      return 'notion_create_page';
    }

    return 'unknown_action';
  }

  /**
   * Infer action parameters from description
   */
  private inferActionParams(action: string): any {
    // Very basic parameter inference
    // In production, this would use NLP/LLM to extract parameters
    return {};
  }
}
