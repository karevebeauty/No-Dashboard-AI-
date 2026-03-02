import { google, gmail_v1, calendar_v3, drive_v3 } from 'googleapis';
import { logger } from '../utils/logger';

export class GoogleWorkspaceClient {
  private auth: InstanceType<typeof google.auth.OAuth2>;
  private gmail: gmail_v1.Gmail;
  private calendar: calendar_v3.Calendar;
  private drive: drive_v3.Drive;

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    this.auth = new google.auth.OAuth2(clientId, clientSecret);
    this.auth.setCredentials({ refresh_token: refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  // ========== Gmail ==========

  async searchMessages(params: { query: string; maxResults?: number }): Promise<any> {
    const { query, maxResults = 10 } = params;

    try {
      const listRes = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      if (!listRes.data.messages || listRes.data.messages.length === 0) {
        return { messages: [], totalResults: 0 };
      }

      const messages = await Promise.all(
        listRes.data.messages.map(async (msg) => {
          const detail = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name === name)?.value || '';

          return {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: detail.data.snippet,
          };
        })
      );

      return {
        messages,
        totalResults: listRes.data.resultSizeEstimate || messages.length,
      };
    } catch (error: any) {
      this.handleApiError(error, 'Gmail');
    }
  }

  async sendMessage(params: {
    to: string[];
    subject: string;
    body: string;
    cc?: string[];
  }): Promise<any> {
    const { to, subject, body, cc } = params;

    try {
      // Build RFC 2822 email
      const messageParts = [
        `To: ${to.join(', ')}`,
        cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : '',
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
      ].filter(Boolean);

      const rawMessage = messageParts.join('\r\n');
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage },
      });

      return {
        messageId: res.data.id,
        threadId: res.data.threadId,
        status: 'sent',
      };
    } catch (error: any) {
      this.handleApiError(error, 'Gmail');
    }
  }

  // ========== Calendar ==========

  async listEvents(params: {
    startDate?: string;
    endDate?: string;
    query?: string;
  }): Promise<any> {
    try {
      const timeMin =
        params.startDate || new Date().toISOString();
      const timeMax =
        params.endDate ||
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
        q: params.query,
      });

      const events = (res.data.items || []).map((evt) => ({
        id: evt.id,
        title: evt.summary,
        description: evt.description,
        startTime: evt.start?.dateTime || evt.start?.date,
        endTime: evt.end?.dateTime || evt.end?.date,
        location: evt.location,
        attendees: (evt.attendees || []).map((a) => a.email),
        meetingLink:
          evt.hangoutLink ||
          evt.conferenceData?.entryPoints?.[0]?.uri,
        status: evt.status,
      }));

      return { events, count: events.length };
    } catch (error: any) {
      this.handleApiError(error, 'Google Calendar');
    }
  }

  async createEvent(params: {
    title: string;
    startTime: string;
    duration?: number;
    attendees?: string[];
    description?: string;
    location?: string;
  }): Promise<any> {
    try {
      const startDate = new Date(params.startTime);
      const durationMs = (params.duration || 60) * 60 * 1000;
      const endDate = new Date(startDate.getTime() + durationMs);

      const res = await this.calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary: params.title,
          description: params.description,
          location: params.location,
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          attendees: params.attendees?.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: `meet-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });

      return {
        eventId: res.data.id,
        title: res.data.summary,
        startTime: res.data.start?.dateTime,
        endTime: res.data.end?.dateTime,
        meetingLink:
          res.data.hangoutLink ||
          res.data.conferenceData?.entryPoints?.[0]?.uri,
        status: 'confirmed',
      };
    } catch (error: any) {
      this.handleApiError(error, 'Google Calendar');
    }
  }

  // ========== Drive ==========

  async searchFiles(params: {
    query: string;
    fileType?: string;
  }): Promise<any> {
    try {
      let q = `name contains '${params.query.replace(/'/g, "\\'")}'`;

      if (params.fileType) {
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          spreadsheet: 'application/vnd.google-apps.spreadsheet',
          document: 'application/vnd.google-apps.document',
          presentation: 'application/vnd.google-apps.presentation',
        };
        if (mimeTypes[params.fileType]) {
          q += ` and mimeType = '${mimeTypes[params.fileType]}'`;
        }
      }
      q += ' and trashed = false';

      const res = await this.drive.files.list({
        q,
        pageSize: 20,
        fields:
          'files(id, name, mimeType, webViewLink, modifiedTime, size, owners)',
      });

      const files = (res.data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        url: f.webViewLink,
        modifiedTime: f.modifiedTime,
        size: f.size,
        owner: f.owners?.[0]?.displayName,
      }));

      return { files, count: files.length };
    } catch (error: any) {
      this.handleApiError(error, 'Google Drive');
    }
  }

  // ========== Error Handling ==========

  private handleApiError(error: any, service: string): never {
    const status = error.response?.status || error.code;

    if (status === 401 || status === 403) {
      logger.error(`${service} auth failed`, { status });
      throw new Error(
        `${service} authentication failed (${status}). Check your Google OAuth credentials.`
      );
    }
    if (status === 429) {
      logger.warn(`${service} rate limited`);
      throw new Error(
        `${service} rate limit exceeded. Please try again in a few minutes.`
      );
    }

    logger.error(`${service} API error`, {
      status,
      message: error.message,
    });
    throw new Error(
      `${service} error: ${error.message}`
    );
  }
}
