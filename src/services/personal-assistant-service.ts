import { logger } from '../utils/logger';
import cron from 'node-cron';
import { MessageRouter } from './message-router';

export interface Reminder {
  id: string;
  phoneNumber: string;
  title: string;
  description?: string;
  scheduledFor: Date;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'none';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  status: 'pending' | 'sent' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface DailySummary {
  date: Date;
  meetings: MeetingSummary[];
  tasks: TaskSummary[];
  events: EventSummary[];
  metrics: DailyMetrics;
}

export interface MeetingSummary {
  title: string;
  time: string;
  duration: string;
  attendees: string[];
  agenda?: string;
  outcome?: string;
  actionItems?: string[];
  location?: string;
}

export interface TaskSummary {
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  project?: string;
  assignedTo?: string;
}

export interface EventSummary {
  type: 'email' | 'slack' | 'notification' | 'system';
  title: string;
  time: Date;
  importance: 'low' | 'medium' | 'high';
  actionRequired?: boolean;
}

export interface DailyMetrics {
  totalMeetings: number;
  totalMeetingTime: string;
  completedTasks: number;
  pendingTasks: number;
  urgentItems: number;
  emailsReceived: number;
  emailsSent: number;
}

/**
 * Personal Assistant Service
 * Manages reminders, daily summaries, and intelligent briefings
 */
export class PersonalAssistantService {
  private messageRouter: MessageRouter;
  private reminders: Map<string, Reminder[]>;
  private dailySummaries: Map<string, DailySummary>;
  private cronJobs: Map<string, cron.ScheduledTask>;

  constructor(messageRouter: MessageRouter) {
    this.messageRouter = messageRouter;
    this.reminders = new Map();
    this.dailySummaries = new Map();
    this.cronJobs = new Map();
  }

  /**
   * Initialize the personal assistant service
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Personal Assistant Service');

    // Schedule daily summaries
    this.scheduleDailySummary();

    // Schedule reminder checks
    this.scheduleReminderChecks();

    // Schedule morning briefing
    this.scheduleMorningBriefing();

    // Schedule end-of-day summary
    this.scheduleEndOfDaySummary();

    logger.info('Personal Assistant Service initialized');
  }

  /**
   * Create a new reminder
   */
  async createReminder(params: {
    phoneNumber: string;
    title: string;
    description?: string;
    scheduledFor: Date;
    recurrence?: 'daily' | 'weekly' | 'monthly' | 'none';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    category?: string;
  }): Promise<Reminder> {
    const reminder: Reminder = {
      id: `reminder-${Date.now()}`,
      phoneNumber: params.phoneNumber,
      title: params.title,
      description: params.description,
      scheduledFor: params.scheduledFor,
      recurrence: params.recurrence || 'none',
      priority: params.priority || 'medium',
      category: params.category,
      status: 'pending',
      createdAt: new Date(),
    };

    // Store reminder
    const userReminders = this.reminders.get(params.phoneNumber) || [];
    userReminders.push(reminder);
    this.reminders.set(params.phoneNumber, userReminders);

    logger.info('Reminder created', {
      reminderId: reminder.id,
      phoneNumber: params.phoneNumber,
      scheduledFor: params.scheduledFor,
    });

    return reminder;
  }

  /**
   * Get upcoming reminders for a user
   */
  async getUpcomingReminders(
    phoneNumber: string,
    limit: number = 10
  ): Promise<Reminder[]> {
    const userReminders = this.reminders.get(phoneNumber) || [];
    const now = new Date();

    return userReminders
      .filter(r => r.status === 'pending' && r.scheduledFor > now)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .slice(0, limit);
  }

  /**
   * Generate daily summary for a user
   */
  async generateDailySummary(phoneNumber: string): Promise<DailySummary> {
    logger.info('Generating daily summary', { phoneNumber });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch data from integrated services
    const meetings = await this.getTodaysMeetings(phoneNumber);
    const tasks = await this.getPendingTasks(phoneNumber);
    const events = await this.getTodaysEvents(phoneNumber);

    // Calculate metrics
    const metrics = this.calculateDailyMetrics(meetings, tasks, events);

    const summary: DailySummary = {
      date: new Date(),
      meetings,
      tasks,
      events,
      metrics,
    };

    // Store summary
    this.dailySummaries.set(phoneNumber, summary);

    logger.info('Daily summary generated', {
      phoneNumber,
      meetings: meetings.length,
      tasks: tasks.length,
    });

    return summary;
  }

  /**
   * Generate morning briefing
   */
  async generateMorningBriefing(phoneNumber: string): Promise<string> {
    logger.info('Generating morning briefing', { phoneNumber });

    const summary = await this.generateDailySummary(phoneNumber);
    const weather = await this.getWeather();

    const briefing = this.formatMorningBriefing(summary, weather);

    return briefing;
  }

  /**
   * Generate end-of-day summary
   */
  async generateEndOfDaySummary(phoneNumber: string): Promise<string> {
    logger.info('Generating end-of-day summary', { phoneNumber });

    const summary = await this.generateDailySummary(phoneNumber);
    const completed = await this.getCompletedTasks(phoneNumber);

    const eodSummary = this.formatEndOfDaySummary(summary, completed);

    return eodSummary;
  }

  /**
   * Send reminder notification
   */
  private async sendReminder(reminder: Reminder): Promise<void> {
    const priorityEmoji = this.getPriorityEmoji(reminder.priority);
    
    const message = `${priorityEmoji} Reminder: ${reminder.title}

${reminder.description || ''}

Scheduled for: ${this.formatTime(reminder.scheduledFor)}
Category: ${reminder.category || 'General'}

Reply 'DONE ${reminder.id}' to mark complete
Reply 'SNOOZE ${reminder.id} 1h' to postpone`;

    try {
      await this.messageRouter.sendNotification(
        reminder.phoneNumber,
        message
      );

      reminder.status = 'sent';

      logger.info('Reminder sent', {
        reminderId: reminder.id,
        phoneNumber: reminder.phoneNumber,
      });

      // Schedule next occurrence if recurring
      if (reminder.recurrence !== 'none') {
        await this.scheduleNextRecurrence(reminder);
      }

    } catch (error) {
      logger.error('Failed to send reminder', {
        reminderId: reminder.id,
        error,
      });
    }
  }

  /**
   * Schedule reminder checks (every minute)
   */
  private scheduleReminderChecks(): void {
    const job = cron.schedule('* * * * *', async () => {
      await this.checkAndSendReminders();
    });

    this.cronJobs.set('reminder-check', job);
    logger.info('Scheduled reminder checks (every minute)');
  }

  /**
   * Check and send due reminders
   */
  private async checkAndSendReminders(): Promise<void> {
    const now = new Date();

    for (const [phoneNumber, reminders] of this.reminders.entries()) {
      for (const reminder of reminders) {
        if (
          reminder.status === 'pending' &&
          reminder.scheduledFor <= now
        ) {
          await this.sendReminder(reminder);
        }
      }
    }
  }

  /**
   * Schedule daily summary (every hour during work hours)
   */
  private scheduleDailySummary(): void {
    // Run every hour from 8 AM to 6 PM
    const job = cron.schedule('0 8-18 * * *', async () => {
      // This would be triggered on-demand
      logger.info('Daily summary scheduled check');
    });

    this.cronJobs.set('daily-summary', job);
  }

  /**
   * Schedule morning briefing (8 AM daily)
   */
  private scheduleMorningBriefing(): void {
    const job = cron.schedule('0 8 * * *', async () => {
      logger.info('Sending morning briefings');

      for (const [phoneNumber] of this.reminders.entries()) {
        try {
          const briefing = await this.generateMorningBriefing(phoneNumber);
          await this.messageRouter.sendNotification(phoneNumber, briefing);
        } catch (error) {
          logger.error('Failed to send morning briefing', {
            phoneNumber,
            error,
          });
        }
      }
    });

    this.cronJobs.set('morning-briefing', job);
    logger.info('Scheduled morning briefing (8 AM daily)');
  }

  /**
   * Schedule end-of-day summary (6 PM daily)
   */
  private scheduleEndOfDaySummary(): void {
    const job = cron.schedule('0 18 * * *', async () => {
      logger.info('Sending end-of-day summaries');

      for (const [phoneNumber] of this.reminders.entries()) {
        try {
          const summary = await this.generateEndOfDaySummary(phoneNumber);
          await this.messageRouter.sendNotification(phoneNumber, summary);
        } catch (error) {
          logger.error('Failed to send end-of-day summary', {
            phoneNumber,
            error,
          });
        }
      }
    });

    this.cronJobs.set('eod-summary', job);
    logger.info('Scheduled end-of-day summary (6 PM daily)');
  }

  /**
   * Get today's meetings (from Google Calendar)
   */
  private async getTodaysMeetings(phoneNumber: string): Promise<MeetingSummary[]> {
    // This would integrate with Google Calendar
    // For now, return mock data
    return [
      {
        title: 'Team Standup',
        time: '9:00 AM',
        duration: '30 min',
        attendees: ['Sarah', 'Mike', 'You'],
        agenda: 'Daily sync',
      },
      {
        title: 'Product Review',
        time: '2:00 PM',
        duration: '1 hour',
        attendees: ['Leadership Team'],
        agenda: 'Q1 roadmap discussion',
        actionItems: ['Finalize Q1 priorities', 'Review budget'],
      },
    ];
  }

  /**
   * Get pending tasks
   */
  private async getPendingTasks(phoneNumber: string): Promise<TaskSummary[]> {
    // This would integrate with task management tools
    return [
      {
        title: 'Review Q1 budget proposal',
        priority: 'high',
        dueDate: new Date(),
        status: 'pending',
        project: 'Planning',
      },
      {
        title: 'Send follow-up to prospects',
        priority: 'medium',
        status: 'pending',
        project: 'Sales',
      },
      {
        title: 'Update warehouse inventory',
        priority: 'urgent',
        dueDate: new Date(),
        status: 'pending',
        project: 'Operations',
      },
    ];
  }

  /**
   * Get completed tasks
   */
  private async getCompletedTasks(phoneNumber: string): Promise<TaskSummary[]> {
    return [
      {
        title: 'Process purchase orders',
        priority: 'high',
        status: 'completed',
        project: 'Operations',
      },
      {
        title: 'Review contracts',
        priority: 'medium',
        status: 'completed',
        project: 'Legal',
      },
    ];
  }

  /**
   * Get today's events
   */
  private async getTodaysEvents(phoneNumber: string): Promise<EventSummary[]> {
    return [
      {
        type: 'email',
        title: '12 new emails (3 urgent)',
        time: new Date(),
        importance: 'high',
        actionRequired: true,
      },
      {
        type: 'slack',
        title: '5 Slack mentions',
        time: new Date(),
        importance: 'medium',
      },
    ];
  }

  /**
   * Calculate daily metrics
   */
  private calculateDailyMetrics(
    meetings: MeetingSummary[],
    tasks: TaskSummary[],
    events: EventSummary[]
  ): DailyMetrics {
    const totalMeetingMinutes = meetings.reduce((total, m) => {
      const minutes = parseInt(m.duration.match(/\d+/)?.[0] || '0');
      return total + minutes;
    }, 0);

    return {
      totalMeetings: meetings.length,
      totalMeetingTime: `${Math.floor(totalMeetingMinutes / 60)}h ${totalMeetingMinutes % 60}m`,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      urgentItems: tasks.filter(t => t.priority === 'urgent').length,
      emailsReceived: 12, // Would come from Gmail integration
      emailsSent: 8,
    };
  }

  /**
   * Format morning briefing
   */
  private formatMorningBriefing(summary: DailySummary, weather: string): string {
    const urgent = summary.tasks.filter(t => t.priority === 'urgent');
    
    return `☀️ Good Morning! ${this.formatDate(new Date())}

${weather}

📅 Today's Schedule:
${summary.meetings.map(m => `• ${m.time} - ${m.title} (${m.duration})`).join('\n')}

Total: ${summary.metrics.totalMeetings} meetings, ${summary.metrics.totalMeetingTime}

⚡ Urgent Tasks (${urgent.length}):
${urgent.map(t => `• ${t.title}`).join('\n')}

📋 Pending Tasks: ${summary.metrics.pendingTasks}

💡 Quick Actions:
• Reply 'TASKS' to see all tasks
• Reply 'MEETINGS' for meeting details
• Reply 'FOCUS' for deep work time suggestions

Have a productive day! 🚀`;
  }

  /**
   * Format end-of-day summary
   */
  private formatEndOfDaySummary(
    summary: DailySummary,
    completed: TaskSummary[]
  ): string {
    return `🌙 End of Day Summary

✅ Completed Today (${completed.length}):
${completed.slice(0, 5).map(t => `• ${t.title}`).join('\n')}

📊 Stats:
• Meetings: ${summary.metrics.totalMeetings} (${summary.metrics.totalMeetingTime})
• Tasks completed: ${summary.metrics.completedTasks}
• Tasks remaining: ${summary.metrics.pendingTasks}
• Emails: ${summary.metrics.emailsReceived} received, ${summary.metrics.emailsSent} sent

${summary.metrics.urgentItems > 0 ? `⚠️ ${summary.metrics.urgentItems} urgent items for tomorrow` : '✓ All urgent items handled!'}

🎯 Tomorrow's Top 3:
${summary.tasks.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`).join('\n')}

Reply 'PLAN TOMORROW' for detailed planning
Reply 'REVIEW WEEK' for weekly summary

Rest well! 😴`;
  }

  /**
   * Get weather (simplified)
   */
  private async getWeather(): Promise<string> {
    // Would integrate with weather API
    return '🌤️ Weather: 72°F, Partly Cloudy';
  }

  /**
   * Schedule next recurrence
   */
  private async scheduleNextRecurrence(reminder: Reminder): Promise<void> {
    const nextDate = new Date(reminder.scheduledFor);

    switch (reminder.recurrence) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }

    await this.createReminder({
      phoneNumber: reminder.phoneNumber,
      title: reminder.title,
      description: reminder.description,
      scheduledFor: nextDate,
      recurrence: reminder.recurrence,
      priority: reminder.priority,
      category: reminder.category,
    });
  }

  /**
   * Get priority emoji
   */
  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case 'urgent': return '🚨';
      case 'high': return '⚡';
      case 'medium': return '📌';
      case 'low': return '📝';
      default: return '📋';
    }
  }

  /**
   * Format time
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Format date
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Stop all scheduled jobs
   */
  async stop(): Promise<void> {
    for (const [name, job] of this.cronJobs.entries()) {
      job.stop();
      logger.info('Stopped cron job', { name });
    }
  }
}
