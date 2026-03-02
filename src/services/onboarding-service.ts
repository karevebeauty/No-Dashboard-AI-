import { logger } from '../utils/logger';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export interface UserProfile {
  id: string;
  phoneNumber: string;
  
  // Basic Info
  name: string;
  email?: string;
  timezone?: string;
  
  // Preferences
  preferences: {
    morningBriefingTime: string; // "08:00"
    eveningBriefingTime: string; // "18:00"
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "07:00"
    weekendBriefings: boolean;
    communicationStyle: 'concise' | 'detailed' | 'casual';
    emojiUsage: 'minimal' | 'moderate' | 'generous';
  };
  
  // Business Context
  business: {
    role?: string;
    company?: string;
    industry?: string;
    teamSize?: string;
    workingHours?: string;
  };
  
  // Integrations
  integrations: {
    googleCalendar?: boolean;
    gmail?: boolean;
    slack?: boolean;
    notion?: boolean;
    linkedin?: boolean;
  };
  
  // Assistant Settings
  assistant: {
    reminderDefaults: {
      leadTime: number; // minutes before
      priority: 'low' | 'medium' | 'high';
    };
    taskManagement: boolean;
    autoSummarize: boolean;
    proactiveAlerts: boolean;
  };
  
  // Onboarding
  onboarding: {
    status: 'not_started' | 'in_progress' | 'completed';
    currentStep: number;
    completedAt?: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingState {
  phoneNumber: string;
  currentStep: number;
  data: Partial<UserProfile>;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    message: string;
    timestamp: Date;
  }>;
}

/**
 * No-Dashboard Onboarding Service
 * Complete profile setup and management via SMS only
 */
export class OnboardingService {
  private claude: Anthropic;
  private onboardingStates: Map<string, OnboardingState>;
  private userProfiles: Map<string, UserProfile>;

  constructor() {
    this.claude = new Anthropic({ apiKey: config.claude.apiKey });
    this.onboardingStates = new Map();
    this.userProfiles = new Map();
  }

  /**
   * Check if user exists
   */
  isNewUser(phoneNumber: string): boolean {
    return !this.userProfiles.has(phoneNumber);
  }

  /**
   * Start onboarding for new user
   */
  async startOnboarding(phoneNumber: string): Promise<string> {
    logger.info('Starting onboarding', { phoneNumber });

    const state: OnboardingState = {
      phoneNumber,
      currentStep: 1,
      data: {},
      conversationHistory: [],
    };

    this.onboardingStates.set(phoneNumber, state);

    return this.getWelcomeMessage();
  }

  /**
   * Get welcome message
   */
  private getWelcomeMessage(): string {
    return `👋 Welcome to your AI Assistant!

I'm your personal AI assistant - no app, no dashboard, no login. Just text me and I'll handle everything.

I can help you with:
• 📅 Manage calendar & meetings
• ✅ Track tasks & projects
• 💼 Sales & outreach
• 💡 Startup ideas & research
• 📊 Business intelligence
• 🔍 Web research
• ⏰ Reminders & alerts

Let's get you set up (takes 2 minutes):

What's your name?`;
  }

  /**
   * Process onboarding message
   */
  async processOnboardingMessage(
    phoneNumber: string,
    message: string
  ): Promise<string> {
    const state = this.onboardingStates.get(phoneNumber);
    
    if (!state) {
      return await this.startOnboarding(phoneNumber);
    }

    // Add to conversation history
    state.conversationHistory.push({
      role: 'user',
      message,
      timestamp: new Date(),
    });

    // Process step
    const response = await this.processStep(state, message);

    // Add response to history
    state.conversationHistory.push({
      role: 'assistant',
      message: response,
      timestamp: new Date(),
    });

    // Check if onboarding complete
    if (state.currentStep > 10) {
      await this.completeOnboarding(state);
    }

    return response;
  }

  /**
   * Process onboarding step
   */
  private async processStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    const step = state.currentStep;

    switch (step) {
      case 1: // Name
        return await this.handleNameStep(state, message);
      
      case 2: // Email (optional)
        return await this.handleEmailStep(state, message);
      
      case 3: // Role/Company
        return await this.handleRoleStep(state, message);
      
      case 4: // Primary use case
        return await this.handleUseCaseStep(state, message);
      
      case 5: // Communication style
        return await this.handleStyleStep(state, message);
      
      case 6: // Morning briefing time
        return await this.handleBriefingTimeStep(state, message);
      
      case 7: // Integrations
        return await this.handleIntegrationsStep(state, message);
      
      case 8: // Preferences
        return await this.handlePreferencesStep(state, message);
      
      case 9: // Confirmation
        return await this.handleConfirmationStep(state, message);
      
      default:
        return "Setup complete! 🎉";
    }
  }

  /**
   * Handle name step
   */
  private async handleNameStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    state.data.name = message.trim();
    state.currentStep = 2;

    return `Great to meet you, ${state.data.name}! 👋

What's your email? (optional - helps with integrations)

Reply 'SKIP' if you prefer not to share`;
  }

  /**
   * Handle email step
   */
  private async handleEmailStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    if (message.toLowerCase() !== 'skip') {
      state.data.email = message.trim();
    }
    
    state.currentStep = 3;

    return `What do you do?

Example: "CEO at TechCorp" or "Operations Director" or "Entrepreneur"

This helps me understand your context.`;
  }

  /**
   * Handle role step
   */
  private async handleRoleStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    // Parse role and company using Claude
    const parsed = await this.parseRoleAndCompany(message);
    
    if (!state.data.business) {
      state.data.business = {};
    }
    
    state.data.business.role = parsed.role;
    state.data.business.company = parsed.company;
    
    state.currentStep = 4;

    return `Got it! ${parsed.role}${parsed.company ? ` at ${parsed.company}` : ''} 💼

What will you use me for most?

1️⃣ Personal assistant (calendar, tasks, reminders)
2️⃣ Business operations (inventory, orders, workflows)
3️⃣ Sales & outreach (LinkedIn, prospecting, campaigns)
4️⃣ Research & ideas (trends, startups, market intel)
5️⃣ All of the above

Reply with number or tell me what you need`;
  }

  /**
   * Handle use case step
   */
  private async handleUseCaseStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    state.currentStep = 5;

    return `Perfect! 🎯

How would you like me to communicate?

1️⃣ Concise - Short, direct messages
2️⃣ Balanced - Clear but friendly
3️⃣ Detailed - Comprehensive info

Reply 1, 2, or 3`;
  }

  /**
   * Handle style step
   */
  private async handleStyleStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    if (!state.data.preferences) {
      state.data.preferences = {
        morningBriefingTime: '08:00',
        eveningBriefingTime: '18:00',
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        weekendBriefings: false,
        communicationStyle: 'detailed',
        emojiUsage: 'moderate',
      };
    }

    const styleMap: Record<string, 'concise' | 'detailed' | 'casual'> = {
      '1': 'concise',
      '2': 'casual',
      '3': 'detailed',
    };

    state.data.preferences.communicationStyle = styleMap[message.trim()] || 'casual';
    state.currentStep = 6;

    return `Got it! I'll keep it ${state.data.preferences.communicationStyle} 👍

When should I send your morning briefing?

Examples:
• 7am or 07:00
• 8:30am or 08:30
• Skip (no morning briefing)`;
  }

  /**
   * Handle briefing time step
   */
  private async handleBriefingTimeStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    const time = this.parseTime(message);
    
    if (time && state.data.preferences) {
      state.data.preferences.morningBriefingTime = time;
    }
    
    state.currentStep = 7;

    const briefingTime = time ? `at ${this.formatTime(time)}` : 'disabled';

    return `Morning briefing set ${briefingTime} ☀️

Which services do you want to connect?

📧 Gmail - Email management
📅 Google Calendar - Meetings & schedule
💬 Slack - Team communication
📝 Notion - Tasks & notes
💼 LinkedIn - Professional network

Reply with letters (e.g., "ABC" for Gmail, Calendar, Slack)
Or reply "NONE" to skip
Or reply "ALL" for everything`;
  }

  /**
   * Handle integrations step
   */
  private async handleIntegrationsStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    if (!state.data.integrations) {
      state.data.integrations = {};
    }

    const msg = message.toUpperCase();
    
    if (msg === 'ALL') {
      state.data.integrations.gmail = true;
      state.data.integrations.googleCalendar = true;
      state.data.integrations.slack = true;
      state.data.integrations.notion = true;
      state.data.integrations.linkedin = true;
    } else if (msg !== 'NONE') {
      state.data.integrations.gmail = msg.includes('A');
      state.data.integrations.googleCalendar = msg.includes('B');
      state.data.integrations.slack = msg.includes('C');
      state.data.integrations.notion = msg.includes('D');
      state.data.integrations.linkedin = msg.includes('E');
    }
    
    state.currentStep = 8;

    const connected = Object.entries(state.data.integrations || {})
      .filter(([_, enabled]) => enabled)
      .map(([name]) => name)
      .join(', ');

    return `${connected ? `Connected: ${connected} ✓` : 'No integrations yet'}

Quick settings:

Do you want me to:
• Send reminders for upcoming tasks? (Y/N)
• Auto-summarize long emails/docs? (Y/N)
• Proactively alert you about important stuff? (Y/N)

Reply like: YYY (all yes) or YNY (mixed) or NNN (all no)`;
  }

  /**
   * Handle preferences step
   */
  private async handlePreferencesStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    if (!state.data.assistant) {
      state.data.assistant = {
        reminderDefaults: {
          leadTime: 30,
          priority: 'medium',
        },
        taskManagement: false,
        autoSummarize: false,
        proactiveAlerts: false,
      };
    }

    const responses = message.toUpperCase().trim();
    state.data.assistant.taskManagement = responses[0] === 'Y';
    state.data.assistant.autoSummarize = responses[1] === 'Y';
    state.data.assistant.proactiveAlerts = responses[2] === 'Y';
    
    state.currentStep = 9;

    return await this.generateSetupSummary(state);
  }

  /**
   * Generate setup summary
   */
  private async generateSetupSummary(state: OnboardingState): Promise<string> {
    const data = state.data;

    const integrations = Object.entries(data.integrations || {})
      .filter(([_, enabled]) => enabled)
      .map(([name]) => `✓ ${name}`)
      .join('\n');

    return `📋 Here's your setup:

👤 Profile:
• Name: ${data.name}
• Email: ${data.email || 'Not set'}
• Role: ${data.business?.role || 'Not set'}
• Company: ${data.business?.company || 'Not set'}

⚙️ Preferences:
• Style: ${data.preferences?.communicationStyle}
• Morning briefing: ${this.formatTime(data.preferences?.morningBriefingTime || '08:00')}
• Evening summary: ${this.formatTime(data.preferences?.eveningBriefingTime || '18:00')}

🔗 Integrations:
${integrations || '• None yet'}

🤖 Assistant:
• Task reminders: ${data.assistant?.taskManagement ? 'On' : 'Off'}
• Auto-summarize: ${data.assistant?.autoSummarize ? 'On' : 'Off'}
• Proactive alerts: ${data.assistant?.proactiveAlerts ? 'On' : 'Off'}

Everything look good?

Reply 'YES' to finish setup
Reply 'CHANGE [item]' to modify something`;
  }

  /**
   * Handle confirmation step
   */
  private async handleConfirmationStep(
    state: OnboardingState,
    message: string
  ): Promise<string> {
    if (message.toLowerCase().startsWith('yes')) {
      state.currentStep = 10;
      return "Processing your setup... ⏳";
    } else {
      return "What would you like to change? Reply with the item (e.g., 'name', 'email', 'briefing time')";
    }
  }

  /**
   * Complete onboarding
   */
  private async completeOnboarding(state: OnboardingState): Promise<void> {
    const profile: UserProfile = {
      id: `user-${Date.now()}`,
      phoneNumber: state.phoneNumber,
      name: state.data.name || 'User',
      email: state.data.email,
      timezone: 'America/New_York', // Default, can be detected
      preferences: state.data.preferences || {
        morningBriefingTime: '08:00',
        eveningBriefingTime: '18:00',
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        weekendBriefings: false,
        communicationStyle: 'casual',
        emojiUsage: 'moderate',
      },
      business: state.data.business || {},
      integrations: state.data.integrations || {},
      assistant: state.data.assistant || {
        reminderDefaults: {
          leadTime: 30,
          priority: 'medium',
        },
        taskManagement: true,
        autoSummarize: true,
        proactiveAlerts: true,
      },
      onboarding: {
        status: 'completed',
        currentStep: 10,
        completedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.userProfiles.set(state.phoneNumber, profile);
    this.onboardingStates.delete(state.phoneNumber);

    logger.info('Onboarding completed', {
      phoneNumber: state.phoneNumber,
      userId: profile.id,
    });
  }

  /**
   * Get completion message
   */
  getCompletionMessage(phoneNumber: string): string {
    const profile = this.userProfiles.get(phoneNumber);
    
    if (!profile) {
      return "Setup complete!";
    }

    return `🎉 You're all set, ${profile.name}!

Your AI assistant is ready. Here's what you can do:

**Try these commands:**

📅 Calendar:
• "What's on my schedule today?"
• "Schedule a meeting tomorrow at 2pm"

✅ Tasks:
• "Add task: Review Q1 budget"
• "What are my pending tasks?"

⏰ Reminders:
• "Remind me to call Sarah at 3pm"
• "Set daily reminder to review inbox"

💼 Business:
• "Check inventory for AcneFree"
• "Create PO for 500 units"

🔍 Research:
• "Find trending startup opportunities"
• "Research competitors in my space"

💡 Ideas:
• "Generate startup ideas from Reddit"
• "Turn this idea into an app spec"

📊 Sales:
• "Find CTOs at Series B companies"
• "Create LinkedIn outreach campaign"

Just text me naturally - I understand context!

Your first morning briefing arrives tomorrow at ${this.formatTime(profile.preferences.morningBriefingTime)}.

What would you like help with first?`;
  }

  /**
   * Update user profile (via SMS)
   */
  async updateProfile(
    phoneNumber: string,
    updates: Partial<UserProfile>
  ): Promise<string> {
    const profile = this.userProfiles.get(phoneNumber);
    
    if (!profile) {
      return "Profile not found. Please complete setup first.";
    }

    // Merge updates
    Object.assign(profile, updates);
    profile.updatedAt = new Date();

    this.userProfiles.set(phoneNumber, profile);

    return "✅ Profile updated!";
  }

  /**
   * Get user profile
   */
  getUserProfile(phoneNumber: string): UserProfile | null {
    return this.userProfiles.get(phoneNumber) || null;
  }

  /**
   * Handle profile management commands
   */
  async handleProfileCommand(
    phoneNumber: string,
    command: string
  ): Promise<string> {
    const profile = this.userProfiles.get(phoneNumber);
    
    if (!profile) {
      return "Please complete setup first.";
    }

    const cmd = command.toLowerCase();

    // View profile
    if (cmd.includes('profile') || cmd.includes('settings')) {
      return this.formatProfileView(profile);
    }

    // Change briefing time
    if (cmd.includes('briefing time')) {
      return "What time would you like your morning briefing? (e.g., '7am' or '08:00')";
    }

    // Toggle features
    if (cmd.includes('disable') || cmd.includes('enable')) {
      return this.handleToggleCommand(profile, cmd);
    }

    return "I can help you update your profile. Try:\n• 'Show profile'\n• 'Change briefing time'\n• 'Disable weekend briefings'";
  }

  /**
   * Format profile view
   */
  private formatProfileView(profile: UserProfile): string {
    const integrations = Object.entries(profile.integrations)
      .filter(([_, enabled]) => enabled)
      .map(([name]) => `✓ ${name}`)
      .join('\n');

    return `👤 Your Profile

Name: ${profile.name}
Email: ${profile.email || 'Not set'}
Phone: ${profile.phoneNumber}

💼 Business:
${profile.business.role ? `• Role: ${profile.business.role}` : ''}
${profile.business.company ? `• Company: ${profile.business.company}` : ''}

⚙️ Preferences:
• Communication: ${profile.preferences.communicationStyle}
• Morning briefing: ${this.formatTime(profile.preferences.morningBriefingTime)}
• Evening summary: ${this.formatTime(profile.preferences.eveningBriefingTime)}
• Weekend briefings: ${profile.preferences.weekendBriefings ? 'On' : 'Off'}
• Quiet hours: ${this.formatTime(profile.preferences.quietHoursStart)} - ${this.formatTime(profile.preferences.quietHoursEnd)}

🔗 Connected Services:
${integrations || '• None'}

🤖 Assistant:
• Task reminders: ${profile.assistant.taskManagement ? 'On' : 'Off'}
• Auto-summarize: ${profile.assistant.autoSummarize ? 'On' : 'Off'}
• Proactive alerts: ${profile.assistant.proactiveAlerts ? 'On' : 'Off'}

Reply 'CHANGE [item]' to update`;
  }

  /**
   * Handle toggle commands
   */
  private handleToggleCommand(profile: UserProfile, command: string): string {
    if (command.includes('weekend')) {
      profile.preferences.weekendBriefings = command.includes('enable');
      return `Weekend briefings ${profile.preferences.weekendBriefings ? 'enabled' : 'disabled'} ✓`;
    }

    if (command.includes('alerts')) {
      profile.assistant.proactiveAlerts = command.includes('enable');
      return `Proactive alerts ${profile.assistant.proactiveAlerts ? 'enabled' : 'disabled'} ✓`;
    }

    return "What would you like to toggle? Try 'enable weekend briefings' or 'disable alerts'";
  }

  /**
   * Parse time string
   */
  private parseTime(input: string): string | null {
    if (input.toLowerCase().includes('skip')) {
      return null;
    }

    // Match patterns like "7am", "07:00", "8:30am"
    const match = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    
    if (!match) {
      return null;
    }

    let hour = parseInt(match[1]);
    const minute = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3]?.toLowerCase();

    if (meridiem === 'pm' && hour < 12) {
      hour += 12;
    } else if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  /**
   * Format time for display
   */
  private formatTime(time: string): string {
    const [hour, minute] = time.split(':').map(Number);
    const meridiem = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${meridiem}`;
  }

  /**
   * Parse role and company from natural language
   */
  private async parseRoleAndCompany(text: string): Promise<{
    role: string;
    company?: string;
  }> {
    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Parse this into role and company: "${text}"\n\nReturn JSON: {"role": "...", "company": "..."}`,
        }],
      });

      const content = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, ''));
      
      return {
        role: parsed.role || text,
        company: parsed.company,
      };
    } catch {
      return { role: text };
    }
  }
}
