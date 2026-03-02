import { WebScrapingService } from './web-scraping-service';
import { logger } from '../utils/logger';

export interface RedditPost {
  id: string;
  title: string;
  content: string;
  subreddit: string;
  author: string;
  upvotes: number;
  comments: number;
  url: string;
  createdAt: Date;
  isProblem: boolean;
  problemSeverity?: number;
}

export interface ProblemDiscovery {
  problem: string;
  frequency: number;
  severity: number;
  sources: string[];
  relatedProblems: string[];
  targetAudience: string;
  businessOpportunity: number;
}

/**
 * Reddit Scraper for Problem Discovery
 * Finds pain points and problems people are discussing
 */
export class RedditScraperService {
  private webScraper: WebScrapingService;
  
  private problemKeywords = [
    'frustrated', 'annoying', 'hate', 'wish there was',
    'why isn\'t there', 'need a better', 'is there a',
    'looking for', 'struggling with', 'pain point',
    'difficult', 'time-consuming', 'waste of time',
  ];

  constructor() {
    this.webScraper = new WebScrapingService();
  }

  /**
   * Search Reddit for problems in specific domain
   */
  async findProblems(params: {
    subreddits?: string[];
    keywords?: string[];
    timeframe?: 'day' | 'week' | 'month' | 'year';
    limit?: number;
  }): Promise<ProblemDiscovery[]> {
    logger.info('Searching Reddit for problems', { params });

    const posts: RedditPost[] = [];

    // Search each subreddit
    const subreddits = params.subreddits || ['Entrepreneur', 'SaaS', 'startups'];
    
    for (const subreddit of subreddits) {
      try {
        const subredditPosts = await this.scrapeSubreddit(
          subreddit,
          params.keywords,
          params.timeframe
        );
        posts.push(...subredditPosts);
      } catch (error) {
        logger.warn('Failed to scrape subreddit', { subreddit });
      }
    }

    // Filter for problem posts
    const problemPosts = posts.filter(p => p.isProblem);

    // Extract and cluster problems
    const problems = this.extractProblems(problemPosts);

    // Rank by business opportunity
    problems.sort((a, b) => b.businessOpportunity - a.businessOpportunity);

    logger.info('Problems discovered', { count: problems.length });

    return problems.slice(0, params.limit || 10);
  }

  /**
   * Scrape a specific subreddit
   */
  private async scrapeSubreddit(
    subreddit: string,
    keywords?: string[],
    timeframe?: string
  ): Promise<RedditPost[]> {
    const posts: RedditPost[] = [];

    // Build search query
    const searchQuery = keywords 
      ? keywords.join(' OR ') 
      : this.problemKeywords.slice(0, 3).join(' OR ');

    // Reddit search URL
    const searchUrl = `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(searchQuery)}&restrict_sr=1&sort=top&t=${timeframe || 'month'}`;

    try {
      const result = await this.webScraper.scrape({
        url: searchUrl,
        method: 'dynamic',
        waitFor: '[data-testid="post-container"]',
      });

      // Parse posts (simplified)
      const extractedPosts = this.parseRedditPosts(result.content, subreddit);
      posts.push(...extractedPosts);

    } catch (error) {
      logger.warn('Failed to scrape Reddit search', { subreddit });
    }

    return posts;
  }

  /**
   * Scrape specific Reddit post for detailed analysis
   */
  async scrapePost(postUrl: string): Promise<RedditPost | null> {
    try {
      const result = await this.webScraper.scrape({
        url: postUrl,
        method: 'dynamic',
        extractRules: [
          { name: 'title', selector: '[data-testid="post-content"] h1', multiple: false },
          { name: 'content', selector: '[data-testid="post-content"] [data-click-id="text"]', multiple: false },
          { name: 'upvotes', selector: '[data-testid="vote-count"]', multiple: false },
          { name: 'comments', selector: '[data-testid="comment-count"]', multiple: false },
        ],
      });

      const post: RedditPost = {
        id: this.extractPostId(postUrl),
        title: result.extractedData?.title || '',
        content: result.extractedData?.content || '',
        subreddit: this.extractSubreddit(postUrl),
        author: 'unknown',
        upvotes: parseInt(result.extractedData?.upvotes || '0'),
        comments: parseInt(result.extractedData?.comments || '0'),
        url: postUrl,
        createdAt: new Date(),
        isProblem: this.isProblemPost(result.extractedData?.title, result.extractedData?.content),
      };

      if (post.isProblem) {
        post.problemSeverity = this.calculateProblemSeverity(post);
      }

      return post;

    } catch (error) {
      logger.error('Failed to scrape Reddit post', { postUrl });
      return null;
    }
  }

  /**
   * Find trending problems on Reddit
   */
  async findTrendingProblems(params: {
    subreddits?: string[];
    minUpvotes?: number;
    minComments?: number;
  }): Promise<ProblemDiscovery[]> {
    logger.info('Finding trending problems on Reddit', { params });

    const subreddits = params.subreddits || [
      'Entrepreneur',
      'smallbusiness', 
      'SaaS',
      'startups',
      'productivity',
      'technology',
    ];

    const allProblems: ProblemDiscovery[] = [];

    for (const subreddit of subreddits) {
      const problems = await this.findProblems({
        subreddits: [subreddit],
        limit: 5,
      });

      allProblems.push(...problems);
    }

    // Deduplicate and merge similar problems
    const uniqueProblems = this.deduplicateProblems(allProblems);

    // Filter by engagement
    const filteredProblems = uniqueProblems.filter(p => 
      p.frequency >= (params.minUpvotes || 10)
    );

    // Sort by business opportunity
    filteredProblems.sort((a, b) => b.businessOpportunity - a.businessOpportunity);

    logger.info('Trending problems found', { count: filteredProblems.length });

    return filteredProblems;
  }

  /**
   * Parse Reddit posts from HTML
   */
  private parseRedditPosts(html: string, subreddit: string): RedditPost[] {
    // This would parse actual Reddit HTML
    // Simplified for demo
    return [];
  }

  /**
   * Check if post describes a problem
   */
  private isProblemPost(title?: string, content?: string): boolean {
    const text = `${title} ${content}`.toLowerCase();
    
    return this.problemKeywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
  }

  /**
   * Calculate problem severity score
   */
  private calculateProblemSeverity(post: RedditPost): number {
    let score = 0;

    // Upvotes indicate agreement/resonance
    score += Math.min(post.upvotes / 10, 30);

    // Comments indicate engagement
    score += Math.min(post.comments / 5, 30);

    // Check for strong emotional language
    const strongWords = ['hate', 'terrible', 'awful', 'frustrated', 'impossible'];
    const text = `${post.title} ${post.content}`.toLowerCase();
    strongWords.forEach(word => {
      if (text.includes(word)) score += 10;
    });

    return Math.min(score, 100);
  }

  /**
   * Extract problems from posts
   */
  private extractProblems(posts: RedditPost[]): ProblemDiscovery[] {
    const problemMap = new Map<string, ProblemDiscovery>();

    for (const post of posts) {
      // Extract main problem from title
      const problem = this.normalizeProblem(post.title);

      if (problemMap.has(problem)) {
        const existing = problemMap.get(problem)!;
        existing.frequency += post.upvotes;
        existing.severity = Math.max(existing.severity, post.problemSeverity || 0);
        existing.sources.push(post.url);
      } else {
        problemMap.set(problem, {
          problem,
          frequency: post.upvotes,
          severity: post.problemSeverity || 50,
          sources: [post.url],
          relatedProblems: [],
          targetAudience: post.subreddit,
          businessOpportunity: this.calculateBusinessOpportunity(post),
        });
      }
    }

    return Array.from(problemMap.values());
  }

  /**
   * Normalize problem text
   */
  private normalizeProblem(text: string): string {
    // Remove question marks, lowercase, trim
    return text
      .replace(/[?!]/g, '')
      .toLowerCase()
      .trim()
      .substring(0, 100);
  }

  /**
   * Calculate business opportunity score
   */
  private calculateBusinessOpportunity(post: RedditPost): number {
    let score = 0;

    // High engagement = big problem
    score += Math.min((post.upvotes / 50) * 30, 30);
    score += Math.min((post.comments / 20) * 20, 20);

    // Problem severity
    score += (post.problemSeverity || 50) * 0.3;

    // Business-related subreddits get bonus
    const businessSubreddits = ['entrepreneur', 'smallbusiness', 'saas', 'startups'];
    if (businessSubreddits.includes(post.subreddit.toLowerCase())) {
      score += 20;
    }

    return Math.round(Math.min(score, 100));
  }

  /**
   * Deduplicate similar problems
   */
  private deduplicateProblems(problems: ProblemDiscovery[]): ProblemDiscovery[] {
    const unique: ProblemDiscovery[] = [];
    const seen = new Set<string>();

    for (const problem of problems) {
      const normalized = this.normalizeProblem(problem.problem);
      
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(problem);
      } else {
        // Merge with existing
        const existing = unique.find(p => 
          this.normalizeProblem(p.problem) === normalized
        );
        if (existing) {
          existing.frequency += problem.frequency;
          existing.sources.push(...problem.sources);
          existing.severity = Math.max(existing.severity, problem.severity);
        }
      }
    }

    return unique;
  }

  /**
   * Extract post ID from URL
   */
  private extractPostId(url: string): string {
    const match = url.match(/comments\/([a-z0-9]+)/);
    return match ? match[1] : '';
  }

  /**
   * Extract subreddit from URL
   */
  private extractSubreddit(url: string): string {
    const match = url.match(/\/r\/([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Find solution gaps (problems without good solutions)
   */
  async findSolutionGaps(subreddit: string): Promise<Array<{
    problem: string;
    currentSolutions: string[];
    gaps: string[];
    opportunityScore: number;
  }>> {
    logger.info('Finding solution gaps', { subreddit });

    const problems = await this.findProblems({
      subreddits: [subreddit],
      limit: 10,
    });

    const gaps = [];

    for (const problem of problems) {
      // Search for existing solutions
      const searchResults = await this.webScraper.searchGoogle(
        `${problem.problem} solution`,
        5
      );

      const currentSolutions = searchResults.map(r => r.title);

      // Analyze if solutions are inadequate
      const hasGoodSolution = searchResults.some(r => 
        r.snippet.includes('best') || r.snippet.includes('recommended')
      );

      if (!hasGoodSolution) {
        gaps.push({
          problem: problem.problem,
          currentSolutions,
          gaps: ['No comprehensive solution', 'Fragmented tools', 'High complexity'],
          opportunityScore: problem.businessOpportunity,
        });
      }
    }

    return gaps;
  }
}
