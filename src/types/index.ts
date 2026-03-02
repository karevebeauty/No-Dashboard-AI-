// Core type definitions for SMS Agent

export interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  status: 'received' | 'processing' | 'sent' | 'failed';
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  phoneNumber: string;
  sessionId: string;
  messages: Message[];
  lastActivity: Date;
  metadata: {
    userName?: string;
    permissions?: string[];
    preferences?: UserPreferences;
  };
}

export interface UserPreferences {
  timezone?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  notificationsEnabled?: boolean;
  preferredResponseLength?: 'concise' | 'detailed';
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  content?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  tools?: MCPTool[];
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  temperature?: number;
  system?: string;
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

export interface MCPToolCall {
  toolName: string;
  params: Record<string, any>;
  timestamp: Date;
}

export interface MCPToolResult {
  toolName: string;
  result: any;
  error?: string;
  timestamp: Date;
  executionTime: number;
}

export interface SMSChunk {
  content: string;
  sequence: number;
  total: number;
  hasMore: boolean;
}

export interface RateLimitInfo {
  phoneNumber: string;
  requestCount: number;
  windowStart: Date;
  windowEnd: Date;
  isLimited: boolean;
}

export interface SessionData {
  sessionId: string;
  phoneNumber: string;
  context: ConversationContext;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface NotificationTrigger {
  id: string;
  type: 'threshold' | 'event' | 'scheduled' | 'error';
  condition: string;
  evaluator: (data: any) => boolean;
  messageTemplate: (data: any) => string;
  recipients: string[];
  enabled: boolean;
  metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  triggerId: string;
  recipient: string;
  message: string;
  sentAt: Date;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed';
  metadata?: Record<string, any>;
}

export interface CostTracking {
  sessionId: string;
  phoneNumber: string;
  smsCount: number;
  smsCost: number;
  apiTokensInput: number;
  apiTokensOutput: number;
  apiCost: number;
  totalCost: number;
  timestamp: Date;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'down';
  components: {
    twilio: boolean;
    claude: boolean;
    mcp: boolean;
    database: boolean;
    redis: boolean;
  };
  latency: {
    sms: number;
    api: number;
  };
  uptime: number;
  timestamp: Date;
}

export interface AuthResult {
  authorized: boolean;
  phoneNumber: string;
  permissions: string[];
  reason?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  phoneNumber?: string; // Hashed for privacy
  messageType?: 'inbound' | 'outbound' | 'notification';
  intent?: string;
  toolsCalled?: string[];
  responseTime?: number;
  success: boolean;
  error?: string;
  cost?: {
    sms: number;
    api: number;
  };
  metadata?: Record<string, any>;
}

export interface SystemConfig {
  environment: 'development' | 'staging' | 'production';
  server: {
    port: number;
    host: string;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    webhookUrl: string;
  };
  authorizedNumbers: string[];
  claude: {
    apiKey: string;
    model: string;
  };
  redis: {
    url: string;
    password?: string;
    db: number;
  };
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  rateLimits: {
    perMinute: number;
    perHour: number;
    perDay: number;
    concurrentRequests: number;
  };
  security: {
    encryptionKey: string;
    pinProtectionEnabled: boolean;
    pinCode?: string;
  };
  notifications: {
    enabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsPort: number;
    healthCheckInterval: number;
  };
  integrations: IntegrationConfig;
}

export interface IntegrationConfig {
  google?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  notion?: {
    apiKey: string;
  };
  slack?: {
    botToken: string;
  };
  erp?: {
    apiUrl: string;
    apiKey: string;
  };
}

// MCP-specific types for system integrations

export interface ERPInventoryQuery {
  brand?: string;
  productType?: string;
  sku?: string;
  location?: string;
}

export interface ERPInventoryResult {
  sku: string;
  productName: string;
  brand: string;
  currentStock: number;
  warehouseStock: number;
  inTransit: number;
  reorderPoint: number;
  locations: Array<{
    name: string;
    quantity: number;
  }>;
}

export interface PurchaseOrder {
  poNumber: string;
  vendor: string;
  status: 'draft' | 'pending' | 'approved' | 'shipped' | 'received';
  orderDate: Date;
  expectedDate?: Date;
  total: number;
  currency: string;
  items: Array<{
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  approver?: string;
  approvalDate?: Date;
}

export interface ShipmentStatus {
  shipmentId: string;
  trackingNumber: string;
  carrier: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'exception';
  origin: string;
  destination: string;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  events: Array<{
    timestamp: Date;
    status: string;
    location: string;
    description: string;
  }>;
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  timestamp: Date;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees: string[];
  organizer: string;
  meetingLink?: string;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  createdTime: Date;
  lastEditedTime: Date;
  properties: Record<string, any>;
}

export interface SlackMessage {
  channel: string;
  text: string;
  threadTs?: string;
  blocks?: any[];
}

export interface CareFlowTicket {
  id: string;
  customer: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    from: string;
    content: string;
    timestamp: Date;
  }>;
}

// Error types

export class SMSAgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'SMSAgentError';
  }
}

export class TwilioError extends SMSAgentError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 'TWILIO_ERROR', 503, metadata);
    this.name = 'TwilioError';
  }
}

export class ClaudeAPIError extends SMSAgentError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 'CLAUDE_API_ERROR', 503, metadata);
    this.name = 'ClaudeAPIError';
  }
}

export class MCPError extends SMSAgentError {
  constructor(message: string, toolName?: string, metadata?: Record<string, any>) {
    super(message, 'MCP_ERROR', 503, { toolName, ...metadata });
    this.name = 'MCPError';
  }
}

export class AuthenticationError extends SMSAgentError {
  constructor(message: string, phoneNumber?: string) {
    super(message, 'AUTH_ERROR', 401, { phoneNumber });
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SMSAgentError {
  constructor(message: string, phoneNumber?: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { phoneNumber, retryAfter });
    this.name = 'RateLimitError';
  }
}
