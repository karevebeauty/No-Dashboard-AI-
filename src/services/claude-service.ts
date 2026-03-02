import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MCPService } from './mcp-service';
import {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeMessage,
  ContentBlock,
  ConversationContext,
  ClaudeAPIError,
} from '../types';

export class ClaudeService {
  private client: Anthropic;
  private mcpService: MCPService;
  private systemPrompt: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
    this.mcpService = new MCPService();
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build the system prompt that defines the agent's capabilities and behavior
   */
  private buildSystemPrompt(): string {
    return `You are an AI assistant helping Ahmad manage his business operations via SMS text messaging.

**Your Capabilities:**
You have access to Ahmad's complete business infrastructure through specialized tools:

1. **ERP & Warehouse Operations** (Bridge Systems LLC / KarEve Beauty Group)
   - Check inventory levels across 5 beauty brands (Carol's Daughter, Dermablend, Baxter of California, Ambi, AcneFree)
   - Retrieve purchase order status and details
   - Create and manage purchase orders
   - Track shipments and generate shipping labels
   - Access sales reports and analytics

2. **Google Workspace**
   - Search and send emails via Gmail
   - Check calendar and schedule meetings
   - Search and retrieve Google Drive documents

3. **Notion**
   - Search workspace content
   - Create and update pages
   - Query and update databases

4. **Communication**
   - Send Slack messages to team
   - Search Slack message history

5. **Customer Support** (CareFlow.biz)
   - View customer support tickets
   - Update ticket status and respond to customers

**Your Communication Style:**
- Be concise but informative (SMS character limits)
- Use emojis sparingly for visual clarity (✅ ❌ ⚠️ 📊 📋 🔍)
- For long responses, summarize key points and offer "Reply 'more' for details"
- Confirm destructive actions before executing
- Proactively suggest next steps when relevant

**Response Format:**
- Keep initial responses under 300 characters when possible
- Use line breaks for readability
- Include relevant numbers, dates, and specifics
- Offer follow-up options (e.g., "Reply 'items' for line items")

**Security:**
- Never share sensitive data (full credit card numbers, passwords)
- Confirm identity for sensitive operations
- Log all actions for audit trail

**Error Handling:**
- If a tool fails, explain clearly and suggest alternatives
- For ambiguous requests, ask clarifying questions
- If data is stale, mention the timestamp

**Examples:**

User: "What's our inventory for Carol's Daughter moisturizer?"
Assistant: "🔍 Checking inventory...

Carol's Daughter Hair Milk Moisturizer:
• Current: 847 units
• Warehouse: 612
• In transit: 235
• Reorder point: 500
✅ Stock healthy

Reply 'details' for locations"

User: "Send PO 12345 to my email"
Assistant: "📧 Retrieving PO #12345...

✅ PO details sent to ahmad@bridgesystems.com

Subject: PO #12345 - BeautySource LLC
Total: $12,450.00
Expected: Mar 15, 2026"

Current date: ${new Date().toLocaleDateString()}
Current time: ${new Date().toLocaleTimeString()}

Remember: You're communicating via SMS, so be concise and actionable.`;
  }

  /**
   * Process a message through Claude with MCP tool access
   */
  async processMessage(
    userMessage: string,
    context: ConversationContext,
    permissions: string[]
  ): Promise<ClaudeResponse> {
    try {
      logger.info('Processing message through Claude', {
        phoneNumber: context.phoneNumber,
        messageLength: userMessage.length,
        contextSize: context.messages.length,
      });

      // Build conversation history
      const messages = this.buildMessages(userMessage, context);

      // Get available MCP tools based on permissions
      const tools = await this.mcpService.getAvailableTools(permissions);

      // Prepare Claude request
      const request: ClaudeRequest = {
        model: config.claude.model,
        max_tokens: 4000,
        messages,
        tools,
        thinking: {
          type: 'enabled',
          budget_tokens: 10000,
        },
        temperature: 0.7,
        system: this.systemPrompt,
      };

      // Call Claude API with tool use orchestration
      let response = await this.callClaude(request);
      let iterationCount = 0;
      const maxIterations = 10; // Prevent infinite loops

      // Handle multi-step tool use
      while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
        iterationCount++;
        logger.info('Claude requested tool use', {
          iteration: iterationCount,
          toolsRequested: this.extractToolNames(response.content),
        });

        // Execute tools
        const toolResults = await this.executeTools(response.content);

        // Add assistant message and tool results to conversation
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation with tool results
        request.messages = messages;
        response = await this.callClaude(request);
      }

      if (iterationCount >= maxIterations) {
        logger.warn('Max tool use iterations reached', {
          phoneNumber: context.phoneNumber,
          iterations: iterationCount,
        });
      }

      logger.info('Message processed successfully', {
        phoneNumber: context.phoneNumber,
        iterations: iterationCount,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      return response;

    } catch (error) {
      logger.error('Error processing message through Claude', { error });
      throw new ClaudeAPIError(
        'Failed to process message',
        { originalError: error }
      );
    }
  }

  /**
   * Build messages array for Claude API
   */
  private buildMessages(
    userMessage: string,
    context: ConversationContext
  ): ClaudeMessage[] {
    const messages: ClaudeMessage[] = [];

    // Add recent conversation history (last 10 messages for context)
    const recentMessages = context.messages.slice(-10);
    for (const msg of recentMessages) {
      messages.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.body,
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * Call Claude API
   */
  private async callClaude(request: ClaudeRequest): Promise<ClaudeResponse> {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.max_tokens,
        messages: request.messages as any,
        tools: request.tools as any,
        system: request.system,
        temperature: request.temperature,
      });

      return response as unknown as ClaudeResponse;

    } catch (error: any) {
      logger.error('Claude API call failed', {
        error: error.message,
        status: error.status,
      });

      throw new ClaudeAPIError(
        `Claude API error: ${error.message}`,
        {
          status: error.status,
          type: error.type,
        }
      );
    }
  }

  /**
   * Execute MCP tools requested by Claude
   */
  private async executeTools(content: ContentBlock[]): Promise<ContentBlock[]> {
    const toolResults: ContentBlock[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        try {
          logger.info('Executing tool', {
            toolName: block.name,
            toolId: block.id,
          });

          const result = await this.mcpService.executeTool(
            block.name!,
            block.input || {}
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id!,
            content: JSON.stringify(result),
          });

          logger.info('Tool executed successfully', {
            toolName: block.name,
            toolId: block.id,
          });

        } catch (error: any) {
          logger.error('Tool execution failed', {
            toolName: block.name,
            toolId: block.id,
            error: error.message,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id!,
            content: JSON.stringify({
              error: error.message,
              toolName: block.name,
            }),
            is_error: true,
          });
        }
      }
    }

    return toolResults;
  }

  /**
   * Extract tool names from content blocks
   */
  private extractToolNames(content: ContentBlock[]): string[] {
    return content
      .filter((block) => block.type === 'tool_use')
      .map((block) => block.name!)
      .filter(Boolean);
  }

  /**
   * Extract text response from Claude
   */
  extractTextResponse(response: ClaudeResponse): string {
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text!)
      .filter(Boolean);

    return textBlocks.join('\n\n');
  }
}
