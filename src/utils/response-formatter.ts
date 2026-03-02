import { logger } from './logger';
import { ClaudeResponse, SMSChunk } from '../types';

const MAX_SMS_LENGTH = 1600; // Twilio concatenated SMS max

export interface FormattedResponse {
  fullText: string;
  chunks: SMSChunk[];
}

export class ResponseFormatter {
  async format(response: ClaudeResponse, phoneNumber: string): Promise<FormattedResponse> {
    // Extract text from Claude response
    const fullText = this.extractText(response);

    if (!fullText) {
      return {
        fullText: 'I processed your request but have no text to share.',
        chunks: [{
          content: 'I processed your request but have no text to share.',
          sequence: 1,
          total: 1,
          hasMore: false,
        }],
      };
    }

    // Split into SMS-sized chunks
    const chunks = this.splitIntoChunks(fullText);

    logger.debug('Response formatted', {
      phoneNumber: this.mask(phoneNumber),
      fullLength: fullText.length,
      chunks: chunks.length,
    });

    return { fullText, chunks };
  }

  private extractText(response: ClaudeResponse): string {
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text!)
      .filter(Boolean);

    return textBlocks.join('\n\n');
  }

  private splitIntoChunks(text: string): SMSChunk[] {
    if (text.length <= MAX_SMS_LENGTH) {
      return [{
        content: text,
        sequence: 1,
        total: 1,
        hasMore: false,
      }];
    }

    const chunks: SMSChunk[] = [];
    let remaining = text;
    let sequence = 1;

    while (remaining.length > 0) {
      let chunkSize = MAX_SMS_LENGTH;

      if (remaining.length > chunkSize) {
        // Find a good break point (newline or space)
        const newlineBreak = remaining.lastIndexOf('\n', chunkSize);
        const spaceBreak = remaining.lastIndexOf(' ', chunkSize);

        if (newlineBreak > chunkSize * 0.5) {
          chunkSize = newlineBreak + 1;
        } else if (spaceBreak > chunkSize * 0.5) {
          chunkSize = spaceBreak + 1;
        }
      }

      const content = remaining.slice(0, chunkSize).trim();
      remaining = remaining.slice(chunkSize).trim();

      chunks.push({
        content,
        sequence,
        total: 0, // Will be updated after
        hasMore: remaining.length > 0,
      });

      sequence++;
    }

    // Update total count
    for (const chunk of chunks) {
      chunk.total = chunks.length;
    }

    // Add pagination hint to multi-chunk messages
    if (chunks.length > 1) {
      for (let i = 0; i < chunks.length - 1; i++) {
        chunks[i].content += `\n\n(${i + 1}/${chunks.length})`;
      }
      chunks[chunks.length - 1].content += `\n\n(${chunks.length}/${chunks.length})`;
    }

    return chunks;
  }

  private mask(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    return `***${cleaned.slice(-4)}`;
  }
}
