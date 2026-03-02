import { Client } from '@notionhq/client';
import { logger } from '../utils/logger';

export class NotionClient {
  private client: Client;

  constructor(apiKey: string) {
    this.client = new Client({ auth: apiKey });
  }

  async search(params: { query: string }): Promise<any> {
    try {
      const response = await this.client.search({
        query: params.query,
        page_size: 20,
      });

      const results = response.results.map((result: any) => {
        if (result.object === 'page') {
          const titleProp = Object.values(result.properties || {}).find(
            (p: any) => p.type === 'title'
          ) as any;
          const title = titleProp?.title?.[0]?.plain_text || 'Untitled';

          return {
            id: result.id,
            type: 'page',
            title,
            url: result.url,
            lastEdited: result.last_edited_time,
          };
        } else if (result.object === 'database') {
          const title = result.title?.[0]?.plain_text || 'Untitled Database';

          return {
            id: result.id,
            type: 'database',
            title,
            url: result.url,
            lastEdited: result.last_edited_time,
          };
        }

        return { id: result.id, type: result.object };
      });

      return { results, count: results.length, hasMore: response.has_more };
    } catch (error: any) {
      this.handleApiError(error);
    }
  }

  private handleApiError(error: any): never {
    const status = error.status || error.code;

    if (status === 401 || status === 403) {
      logger.error('Notion auth failed', { status });
      throw new Error(
        `Notion authentication failed (${status}). Check your NOTION_API_KEY.`
      );
    }
    if (status === 429) {
      logger.warn('Notion rate limited');
      throw new Error(
        'Notion rate limit exceeded. Please try again in a few minutes.'
      );
    }

    logger.error('Notion API error', { status, message: error.message });
    throw new Error(`Notion error: ${error.message}`);
  }
}
