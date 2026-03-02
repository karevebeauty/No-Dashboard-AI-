import { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger';

export class SlackClient {
  private client: WebClient;
  private channelCache: Map<string, string> = new Map();

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async sendMessage(params: { channel: string; text: string }): Promise<any> {
    try {
      let channelId = params.channel;

      // If channel is a name (not an ID starting with C/D/G), resolve it
      if (!channelId.match(/^[CDG][A-Z0-9]+$/)) {
        channelId = await this.resolveChannelName(channelId);
      }

      const res = await this.client.chat.postMessage({
        channel: channelId,
        text: params.text,
      });

      return {
        messageTs: res.ts,
        channel: res.channel,
        status: 'sent',
      };
    } catch (error: any) {
      this.handleApiError(error);
    }
  }

  private async resolveChannelName(name: string): Promise<string> {
    const cleanName = name.replace(/^#/, '');

    // Check cache
    const cached = this.channelCache.get(cleanName);
    if (cached) return cached;

    const listRes = await this.client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200,
    });

    for (const channel of listRes.channels || []) {
      if (channel.name && channel.id) {
        this.channelCache.set(channel.name, channel.id);
      }
    }

    const resolved = this.channelCache.get(cleanName);
    if (!resolved) {
      throw new Error(`Slack channel not found: #${cleanName}`);
    }

    return resolved;
  }

  private handleApiError(error: any): never {
    if (error.data?.error === 'not_authed' || error.data?.error === 'invalid_auth') {
      logger.error('Slack auth failed');
      throw new Error(
        'Slack authentication failed. Check your SLACK_BOT_TOKEN.'
      );
    }
    if (error.data?.error === 'ratelimited') {
      logger.warn('Slack rate limited');
      throw new Error(
        'Slack rate limit exceeded. Please try again in a few minutes.'
      );
    }
    if (error.data?.error === 'channel_not_found') {
      throw new Error(
        `Slack channel not found. Make sure the bot is added to the channel.`
      );
    }

    logger.error('Slack API error', { error: error.data?.error || error.message });
    throw new Error(`Slack error: ${error.data?.error || error.message}`);
  }
}
