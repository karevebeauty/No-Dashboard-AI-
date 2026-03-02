import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MCPService } from './mcp-service';
import { ActionConfirmationService } from './action-confirmation-service';
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
  private actionConfirmationService: ActionConfirmationService;
  private systemPrompt: string;

  constructor(actionConfirmationService: ActionConfirmationService) {
    this.client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
    this.mcpService = new MCPService();
    this.actionConfirmationService = actionConfirmationService;
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `You are an AI assistant helping Ahmad manage his business operations via SMS text messaging. You can both RETRIEVE information and TAKE ACTIONS on his behalf.

**Your Capabilities:**

1. **ERP & Warehouse Operations** (Bridge Systems LLC / KarEve Beauty Group)
   READ: Check inventory, view PO status, track shipments, access reports
   WRITE: Create purchase orders, update inventory, create shipping labels, approve/reject POs

2. **Google Workspace**
   READ: Search emails, check calendar, find documents
   WRITE: Send emails, schedule meetings, create/update documents

3. **Notion**
   READ: Search workspace, view pages/databases
   WRITE: Create pages, update databases, add content

4. **Slack**
   READ: Search message history
   WRITE: Send messages to channels/users

5. **Customer Support (CareFlow)**
   READ: View tickets, search ticket history
   WRITE: Update tickets, respond to customers, close tickets

**ACTION CONFIRMATION SYSTEM:**

For DESTRUCTIVE or IMPORTANT actions, you MUST request confirmation:
- Creating/sending anything (POs, emails, messages, events)
- Updating/deleting records
- Financial transactions

When requesting confirmation:
1. Clearly describe what will happen
2. Include all relevant details (amounts, recipients, dates)
3. Tell the user you'll provide a confirmation code
4. Use the action confirmation service to create a pending action

Example confirmation message:
"📧 Ready to send email

To: team@kareve.com
Subject: Q1 Report
Attachment: Q1-Report.pdf

⚠️ Reply 'CONFIRM [CODE]' to send
Reply 'CANCEL [CODE]' to abort"

**READ-ONLY actions** can be executed immediately:
- Checking inventory
- Viewing PO status
- Searching emails
- Listing calendar events
- Viewing documents

**Your Communication Style:**
- Be concise and actionable
- Use emojis for clarity: ✅ (success), ❌ (error), ⚠️ (warning), 🔍 (searching), 📊 (data), 💰 (money)
- For long results, summarize and offer "Reply 'more' for details"
- Proactively suggest next steps
- Confirm successful actions clearly

**Action Execution Flow:**
1. User requests action: "Send the Q1 report to the team"
2. You identify required action: gmail_send_message
3. Check if requires confirmation: YES
4. Create pending action with description
5. Send confirmation message with code
6. Wait for user to confirm/cancel
7. Execute action upon confirmation
8. Report results

**Error Handling:**
- If action fails, explain clearly what went wrong
- Suggest alternatives or fixes
- Log all actions for audit trail
- Never silently fail

**Examples:**

User: "What's our inventory for Carol's Daughter moisturizer?"
Assistant: [Execute erp_get_inventory immediately - READ ONLY]
"🔍 Carol's Daughter Hair Milk:
• Current: 847 units
• Warehouse: 612
• Transit: 235
✅ Stock healthy"

User: "Create a PO for 500 units from BeautySource"
Assistant: [Create pending action - REQUIRES CONFIRMATION]
"📋 Ready to create Purchase Order

Vendor: BeautySource LLC
Items: 500 units
Est. value: ~$4,250

⚠️ Reply 'CONFIRM ABC123' to create
Expires in 5 minutes"

User: "CONFIRM ABC123"
Assistant: [Execute erp_create_po]
"✅ PO Created Successfully

PO #45893
Vendor: BeautySource LLC
Total: $4,250.00
Status: Draft

Reply 'submit' to send to vendor"

Current date: ${new Date().toLocaleDateString()}
Current time: ${new Date().toLocaleTimeString()}

Remember: You can take real actions. Be confident but always confirm destructive operations.`;
  }

  async processMessage(
    userMessage: string,
    context: ConversationContext,
    permissions: string[]
  ): Promise<ClaudeResponse> {
    try {
      // First, check if this is a confirmation message
      const confirmation = this.actionConfirmationService.parseConfirmation(userMessage);
      
      if (confirmation.action && confirmation.actionId) {
        return await this.handleConfirmation(
          confirmation.action,
          confirmation.actionId,
          context.phoneNumber
        );
      }

      logger.info('Processing message through Claude', {
        phoneNumber: context.phoneNumber,
        messageLength: userMessage.length,
        contextSize: context.messages.length,
      });

      const messages = this.buildMessages(userMessage, context);
      const tools = await this.mcpService.getAvailableTools(permissions);

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

      let response = await this.callClaude(request);
      let iterationCount = 0;
      const maxIterations = 10;

      while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
        iterationCount++;
        
        const toolResults = await this.executeToolsWithConfirmation(
          response.content,
          context.phoneNumber
        );

        // If we created a pending action, return immediately
        const hasPendingAction = toolResults.some(
          (result) => result.type === 'tool_result' && 
          result.content?.includes('pending_action_created')
        );

        if (hasPendingAction) {
          // Extract the pending action message
          const pendingResult = toolResults.find(
            (r) => r.content?.includes('pending_action_created')
          );
          
          if (pendingResult) {
            const data = JSON.parse(pendingResult.content!);
            const pendingAction = data.pending_action;
            
            // Return a response with confirmation message
            return {
              id: response.id,
              type: 'message',
              role: 'assistant',
              content: [{
                type: 'text',
                text: this.actionConfirmationService.formatConfirmationMessage(pendingAction),
              }],
              model: response.model,
              stop_reason: 'end_turn',
              usage: response.usage,
            };
          }
        }

        messages.push({
          role: 'assistant',
          content: response.content,
        });

        messages.push({
          role: 'user',
          content: toolResults,
        });

        request.messages = messages;
        response = await this.callClaude(request);
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
   * Handle confirmation/cancellation of pending actions
   */
  private async handleConfirmation(
    action: 'confirm' | 'cancel',
    actionId: string,
    phoneNumber: string
  ): Promise<ClaudeResponse> {
    if (action === 'cancel') {
      const cancelled = await this.actionConfirmationService.cancelAction(actionId);
      
      const message = cancelled
        ? `❌ Action Cancelled\n\nAction ${actionId} has been cancelled.`
        : `⚠️ Action Not Found\n\nAction ${actionId} not found or already expired.`;

      return this.createTextResponse(message);
    }

    // Confirm action
    const pendingAction = await this.actionConfirmationService.confirmAction(
      actionId,
      phoneNumber
    );

    if (!pendingAction) {
      return this.createTextResponse(
        `⚠️ Unable to Confirm\n\nAction ${actionId} not found, expired, or unauthorized.`
      );
    }

    // Execute the confirmed action
    try {
      const result = await this.mcpService.executeTool(
        pendingAction.toolName,
        pendingAction.params
      );

      // Log the action
      await this.actionConfirmationService.logActionExecution(pendingAction, {
        actionId: pendingAction.id,
        success: !result.error,
        result: result.result,
        error: result.error,
        executedAt: new Date(),
      });

      if (result.error) {
        return this.createTextResponse(
          `❌ Action Failed\n\n${result.error}\n\nAction ID: ${actionId}`
        );
      }

      // Format success message based on tool
      const successMessage = this.formatActionSuccess(
        pendingAction.toolName,
        result.result
      );

      return this.createTextResponse(successMessage);

    } catch (error: any) {
      logger.error('Error executing confirmed action', {
        actionId,
        error: error.message,
      });

      return this.createTextResponse(
        `❌ Execution Error\n\n${error.message}\n\nAction ID: ${actionId}`
      );
    }
  }

  /**
   * Execute tools with confirmation checks
   */
  private async executeToolsWithConfirmation(
    content: ContentBlock[],
    phoneNumber: string
  ): Promise<ContentBlock[]> {
    const toolResults: ContentBlock[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        try {
          const toolName = block.name!;
          const params = block.input || {};

          // Check if requires confirmation
          if (this.actionConfirmationService.requiresConfirmation(toolName)) {
            logger.info('Action requires confirmation', { toolName, phoneNumber });

            // Create pending action
            const description = this.generateActionDescription(toolName, params);
            const pendingAction = await this.actionConfirmationService.createPendingAction(
              phoneNumber,
              toolName,
              params,
              description
            );

            // Return special result indicating pending action
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id!,
              content: JSON.stringify({
                pending_action_created: true,
                pending_action: pendingAction,
                message: 'Action requires confirmation from user',
              }),
            });

          } else {
            // Execute immediately for read-only actions
            logger.info('Executing tool (no confirmation required)', { toolName });

            const result = await this.mcpService.executeTool(toolName, params);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id!,
              content: JSON.stringify(result.result),
            });
          }

        } catch (error: any) {
          logger.error('Tool execution failed', {
            toolName: block.name,
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
   * Generate human-readable action description
   */
  private generateActionDescription(toolName: string, params: any): string {
    switch (toolName) {
      case 'erp_create_po':
        return `Create Purchase Order\n\nVendor: ${params.vendor}\nItems: ${params.items?.length || 0}\nEstimated: $${this.estimatePOTotal(params.items)}`;
      
      case 'gmail_send_message':
        return `Send Email\n\nTo: ${params.to?.join(', ')}\nSubject: ${params.subject}`;
      
      case 'gcal_create_event':
        return `Create Calendar Event\n\nTitle: ${params.title}\nTime: ${params.startTime}\nAttendees: ${params.attendees?.length || 0}`;
      
      case 'slack_send_message':
        return `Send Slack Message\n\nChannel: ${params.channel}\nMessage: ${params.text.substring(0, 100)}...`;
      
      default:
        return `Execute: ${toolName}`;
    }
  }

  /**
   * Format action success message
   */
  private formatActionSuccess(toolName: string, result: any): string {
    switch (toolName) {
      case 'erp_create_po':
        return `✅ Purchase Order Created\n\nPO #${result.poNumber}\nStatus: ${result.status}`;
      
      case 'gmail_send_message':
        return `✅ Email Sent\n\nMessage ID: ${result.messageId}`;
      
      case 'gcal_create_event':
        return `✅ Event Created\n\nEvent ID: ${result.eventId}\nMeeting: ${result.meetingLink || 'N/A'}`;
      
      case 'slack_send_message':
        return `✅ Slack Message Sent\n\nChannel: ${result.channel}`;
      
      default:
        return `✅ Action Completed Successfully`;
    }
  }

  private estimatePOTotal(items: any[]): string {
    if (!items || items.length === 0) return '0.00';
    const total = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    return total.toFixed(2);
  }

  private createTextResponse(text: string): ClaudeResponse {
    return {
      id: `msg-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: config.claude.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  private buildMessages(
    userMessage: string,
    context: ConversationContext
  ): ClaudeMessage[] {
    const messages: ClaudeMessage[] = [];
    const recentMessages = context.messages.slice(-10);
    
    for (const msg of recentMessages) {
      messages.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.body,
      });
    }

    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

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
        { status: error.status, type: error.type }
      );
    }
  }

  extractTextResponse(response: ClaudeResponse): string {
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text!)
      .filter(Boolean);

    return textBlocks.join('\n\n');
  }
}
