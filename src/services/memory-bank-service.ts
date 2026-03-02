import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Pool } from 'pg';

export interface MemoryEntry {
  id: string;
  userId: string;
  type: 'conversation' | 'note' | 'document' | 'task' | 'insight';
  content: string;
  metadata: {
    timestamp: Date;
    source: 'sms' | 'upload' | 'system';
    category?: string;
    tags?: string[];
    importance?: number; // 0-10
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  embedding?: number[]; // Vector embedding for semantic search
  relatedMemories?: string[]; // IDs of related memories
}

export interface UserInsight {
  userId: string;
  category: string;
  insight: string;
  confidence: number; // 0-1
  basedOn: string[]; // Memory IDs
  createdAt: Date;
}

export interface PersonalizationProfile {
  userId: string;
  preferences: {
    communicationStyle: string;
    preferredTopics: string[];
    avoidedTopics: string[];
    responseLength: 'short' | 'medium' | 'long';
    formalityLevel: number; // 0-10
    humorLevel: number; // 0-10
  };
  patterns: {
    activeHours: string[];
    commonTasks: string[];
    frequentQuestions: string[];
    workingStyle: string;
  };
  relationships: {
    keyContacts: Array<{
      name: string;
      relationship: string;
      context: string;
    }>;
    companies: string[];
    projects: string[];
  };
  goals: {
    shortTerm: string[];
    longTerm: string[];
    achievements: string[];
  };
  learnings: {
    whatWorksWell: string[];
    whatToAvoid: string[];
    specialRequests: string[];
  };
}

/**
 * Intelligent Memory Bank
 * Stores, indexes, and learns from all user interactions
 */
export class MemoryBankService {
  private claude: Anthropic;
  private db: Pool;
  private memories: Map<string, MemoryEntry[]>;
  private insights: Map<string, UserInsight[]>;
  private profiles: Map<string, PersonalizationProfile>;

  constructor(dbPool: Pool) {
    this.claude = new Anthropic({ apiKey: config.claude.apiKey });
    this.db = dbPool;
    this.memories = new Map();
    this.insights = new Map();
    this.profiles = new Map();
  }

  /**
   * Store a new memory
   */
  async storeMemory(
    userId: string,
    type: MemoryEntry['type'],
    content: string,
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<MemoryEntry> {
    logger.info('Storing memory', { userId, type });

    // Generate embedding for semantic search
    const embedding = await this.generateEmbedding(content);

    // Extract metadata using Claude
    const extractedMetadata = await this.extractMetadata(content, type);

    const memory: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      content,
      metadata: {
        timestamp: new Date(),
        source: metadata?.source || 'sms',
        category: extractedMetadata.category,
        tags: extractedMetadata.tags,
        importance: extractedMetadata.importance,
        sentiment: extractedMetadata.sentiment,
        ...metadata,
      },
      embedding,
      relatedMemories: await this.findRelatedMemories(userId, embedding),
    };

    // Store in database
    await this.saveMemoryToDB(memory);

    // Update in-memory cache
    const userMemories = this.memories.get(userId) || [];
    userMemories.push(memory);
    this.memories.set(userId, userMemories);

    // Update personalization profile
    await this.updatePersonalizationProfile(userId, memory);

    // Generate insights periodically
    if (userMemories.length % 10 === 0) {
      await this.generateInsights(userId);
    }

    logger.info('Memory stored', { memoryId: memory.id, userId });

    return memory;
  }

  /**
   * Search memories semantically
   */
  async searchMemories(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    logger.info('Searching memories', { userId, query });

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Get user memories
    const userMemories = await this.getUserMemories(userId);

    // Calculate similarity scores
    const scoredMemories = userMemories.map(memory => ({
      memory,
      score: this.cosineSimilarity(queryEmbedding, memory.embedding || []),
    }));

    // Sort by relevance
    scoredMemories.sort((a, b) => b.score - a.score);

    // Return top matches
    return scoredMemories.slice(0, limit).map(sm => sm.memory);
  }

  /**
   * Get conversation context
   */
  async getConversationContext(
    userId: string,
    currentMessage: string,
    limit: number = 5
  ): Promise<string> {
    // Get recent memories
    const recentMemories = await this.getRecentMemories(userId, 20);

    // Search for relevant memories
    const relevantMemories = await this.searchMemories(userId, currentMessage, 10);

    // Combine and deduplicate
    const allMemories = [...recentMemories, ...relevantMemories];
    const uniqueMemories = Array.from(
      new Map(allMemories.map(m => [m.id, m])).values()
    ).slice(0, limit);

    // Format context
    const context = uniqueMemories
      .map(m => `[${m.metadata.timestamp.toISOString()}] ${m.content}`)
      .join('\n');

    return context;
  }

  /**
   * Generate personalized response
   */
  async generatePersonalizedResponse(
    userId: string,
    message: string
  ): Promise<string> {
    // Get personalization profile
    const profile = await this.getPersonalizationProfile(userId);

    // Get relevant context
    const context = await this.getConversationContext(userId, message);

    // Build personalized prompt
    const prompt = this.buildPersonalizedPrompt(profile, context, message);

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      const text = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      return text;

    } catch (error) {
      logger.error('Failed to generate personalized response', { error });
      throw error;
    }
  }

  /**
   * Generate insights from user's memory bank
   */
  async generateInsights(userId: string): Promise<UserInsight[]> {
    logger.info('Generating insights', { userId });

    const memories = await this.getUserMemories(userId);
    
    if (memories.length < 10) {
      return []; // Need sufficient data
    }

    // Group memories by category
    const categories = this.groupByCategory(memories);

    const insights: UserInsight[] = [];

    for (const [category, categoryMemories] of Object.entries(categories)) {
      try {
        const insight = await this.analyzeCategory(
          userId,
          category,
          categoryMemories
        );
        
        if (insight) {
          insights.push(insight);
        }
      } catch (error) {
        logger.warn('Failed to generate insight for category', { category });
      }
    }

    // Store insights
    this.insights.set(userId, insights);
    
    logger.info('Insights generated', { userId, count: insights.length });

    return insights;
  }

  /**
   * Get personalization profile
   */
  async getPersonalizationProfile(
    userId: string
  ): Promise<PersonalizationProfile> {
    // Check cache
    if (this.profiles.has(userId)) {
      return this.profiles.get(userId)!;
    }

    // Load from database
    const profile = await this.loadProfileFromDB(userId);
    
    if (profile) {
      this.profiles.set(userId, profile);
      return profile;
    }

    // Create default profile
    const defaultProfile: PersonalizationProfile = {
      userId,
      preferences: {
        communicationStyle: 'balanced',
        preferredTopics: [],
        avoidedTopics: [],
        responseLength: 'medium',
        formalityLevel: 5,
        humorLevel: 3,
      },
      patterns: {
        activeHours: [],
        commonTasks: [],
        frequentQuestions: [],
        workingStyle: 'unknown',
      },
      relationships: {
        keyContacts: [],
        companies: [],
        projects: [],
      },
      goals: {
        shortTerm: [],
        longTerm: [],
        achievements: [],
      },
      learnings: {
        whatWorksWell: [],
        whatToAvoid: [],
        specialRequests: [],
      },
    };

    this.profiles.set(userId, defaultProfile);
    return defaultProfile;
  }

  /**
   * Update personalization profile based on new memory
   */
  private async updatePersonalizationProfile(
    userId: string,
    memory: MemoryEntry
  ): Promise<void> {
    const profile = await this.getPersonalizationProfile(userId);

    // Extract patterns
    const hour = memory.metadata.timestamp.getHours();
    if (!profile.patterns.activeHours.includes(hour.toString())) {
      profile.patterns.activeHours.push(hour.toString());
    }

    // Extract topics and tags
    if (memory.metadata.tags) {
      for (const tag of memory.metadata.tags) {
        if (!profile.preferences.preferredTopics.includes(tag)) {
          profile.preferences.preferredTopics.push(tag);
        }
      }
    }

    // Save updated profile
    await this.saveProfileToDB(profile);
  }

  /**
   * Generate embedding for semantic search
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // In production, use proper embedding model (OpenAI, Cohere, etc.)
    // For now, return a simple hash-based vector
    const hash = this.simpleHash(text);
    return Array(384).fill(0).map((_, i) => (hash >> i) & 1);
  }

  /**
   * Extract metadata using Claude
   */
  private async extractMetadata(
    content: string,
    type: string
  ): Promise<{
    category: string;
    tags: string[];
    importance: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  }> {
    try {
      const prompt = `Analyze this ${type} and extract metadata:

"${content}"

Return JSON:
{
  "category": "work|personal|idea|task|note",
  "tags": ["tag1", "tag2"],
  "importance": 0-10,
  "sentiment": "positive|neutral|negative"
}`;

      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const metadata = JSON.parse(
        text.replace(/```json\n?/g, '').replace(/```/g, '')
      );

      return metadata;

    } catch (error) {
      // Fallback to defaults
      return {
        category: 'general',
        tags: [],
        importance: 5,
        sentiment: 'neutral',
      };
    }
  }

  /**
   * Find related memories
   */
  private async findRelatedMemories(
    userId: string,
    embedding: number[]
  ): Promise<string[]> {
    const userMemories = await this.getUserMemories(userId);
    
    const scoredMemories = userMemories
      .map(m => ({
        id: m.id,
        score: this.cosineSimilarity(embedding, m.embedding || []),
      }))
      .filter(sm => sm.score > 0.7)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scoredMemories.map(sm => sm.id);
  }

  /**
   * Cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (magA * magB);
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Get user memories
   */
  private async getUserMemories(userId: string): Promise<MemoryEntry[]> {
    // Check cache
    if (this.memories.has(userId)) {
      return this.memories.get(userId)!;
    }

    // Load from database
    const memories = await this.loadMemoriesFromDB(userId);
    this.memories.set(userId, memories);
    
    return memories;
  }

  /**
   * Get recent memories
   */
  private async getRecentMemories(
    userId: string,
    limit: number
  ): Promise<MemoryEntry[]> {
    const memories = await this.getUserMemories(userId);
    return memories
      .sort((a, b) => b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Group memories by category
   */
  private groupByCategory(
    memories: MemoryEntry[]
  ): Record<string, MemoryEntry[]> {
    const groups: Record<string, MemoryEntry[]> = {};
    
    for (const memory of memories) {
      const category = memory.metadata.category || 'general';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(memory);
    }
    
    return groups;
  }

  /**
   * Analyze category for insights
   */
  private async analyzeCategory(
    userId: string,
    category: string,
    memories: MemoryEntry[]
  ): Promise<UserInsight | null> {
    if (memories.length < 3) return null;

    const content = memories.map(m => m.content).join('\n');

    try {
      const prompt = `Analyze these ${category} memories and identify a key insight:

${content}

What pattern or insight can you identify? Be specific and actionable.`;

      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const insightText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      return {
        userId,
        category,
        insight: insightText,
        confidence: 0.8,
        basedOn: memories.map(m => m.id),
        createdAt: new Date(),
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Build personalized prompt
   */
  private buildPersonalizedPrompt(
    profile: PersonalizationProfile,
    context: string,
    message: string
  ): string {
    const style = profile.preferences.communicationStyle;
    const length = profile.preferences.responseLength;

    return `You are a personalized AI assistant. Use this context about the user:

**User's Context:**
${context}

**User's Preferences:**
- Communication style: ${style}
- Preferred response length: ${length}
- Topics of interest: ${profile.preferences.preferredTopics.join(', ')}

**User's Message:**
${message}

Respond in a way that's personalized to this specific user, referencing relevant context when appropriate.`;
  }

  // Database operations

  private async saveMemoryToDB(memory: MemoryEntry): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO memories (id, phone_number, type, content, embedding, tags, importance, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           tags = EXCLUDED.tags,
           importance = EXCLUDED.importance,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          memory.id,
          memory.userId, // phone_number maps to userId in this service
          memory.type,
          memory.content,
          memory.embedding || [],
          memory.metadata.tags || [],
          memory.metadata.importance || 5,
          JSON.stringify({
            source: memory.metadata.source,
            category: memory.metadata.category,
            sentiment: memory.metadata.sentiment,
            relatedMemories: memory.relatedMemories,
          }),
          memory.metadata.timestamp,
        ]
      );
      logger.debug('Memory saved to database', { memoryId: memory.id });
    } catch (error) {
      logger.error('Failed to save memory to database', { memoryId: memory.id, error });
    }
  }

  private async loadMemoriesFromDB(userId: string): Promise<MemoryEntry[]> {
    try {
      const result = await this.db.query(
        `SELECT id, phone_number, type, content, embedding, tags, importance, metadata, created_at
         FROM memories WHERE phone_number = $1
         ORDER BY created_at DESC LIMIT 200`,
        [userId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.phone_number,
        type: row.type,
        content: row.content,
        embedding: row.embedding || [],
        metadata: {
          timestamp: new Date(row.created_at),
          source: row.metadata?.source || 'sms',
          category: row.metadata?.category,
          tags: row.tags || [],
          importance: parseFloat(row.importance) || 5,
          sentiment: row.metadata?.sentiment || 'neutral',
        },
        relatedMemories: row.metadata?.relatedMemories || [],
      }));
    } catch (error) {
      logger.error('Failed to load memories from database', { userId, error });
      return [];
    }
  }

  private async loadProfileFromDB(
    userId: string
  ): Promise<PersonalizationProfile | null> {
    try {
      const result = await this.db.query(
        `SELECT preferences, patterns, relationships, goals, learnings
         FROM personalization_profiles WHERE phone_number = $1`,
        [userId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        userId,
        preferences: row.preferences || {
          communicationStyle: 'balanced',
          preferredTopics: [],
          avoidedTopics: [],
          responseLength: 'medium',
          formalityLevel: 5,
          humorLevel: 3,
        },
        patterns: row.patterns || {
          activeHours: [],
          commonTasks: [],
          frequentQuestions: [],
          workingStyle: 'unknown',
        },
        relationships: row.relationships || {
          keyContacts: [],
          companies: [],
          projects: [],
        },
        goals: row.goals || {
          shortTerm: [],
          longTerm: [],
          achievements: [],
        },
        learnings: row.learnings || {
          whatWorksWell: [],
          whatToAvoid: [],
          specialRequests: [],
        },
      };
    } catch (error) {
      logger.error('Failed to load profile from database', { userId, error });
      return null;
    }
  }

  private async saveProfileToDB(profile: PersonalizationProfile): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO personalization_profiles (phone_number, preferences, patterns, relationships, goals, learnings, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (phone_number) DO UPDATE SET
           preferences = EXCLUDED.preferences,
           patterns = EXCLUDED.patterns,
           relationships = EXCLUDED.relationships,
           goals = EXCLUDED.goals,
           learnings = EXCLUDED.learnings,
           updated_at = NOW()`,
        [
          profile.userId,
          JSON.stringify(profile.preferences),
          JSON.stringify(profile.patterns),
          JSON.stringify(profile.relationships),
          JSON.stringify(profile.goals),
          JSON.stringify(profile.learnings),
        ]
      );
      logger.debug('Profile saved to database', { userId: profile.userId });
    } catch (error) {
      logger.error('Failed to save profile to database', { userId: profile.userId, error });
    }
  }
}
