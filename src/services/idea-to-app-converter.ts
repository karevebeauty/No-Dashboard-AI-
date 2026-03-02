import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { StartupIdea } from './trends-analysis-service';

export interface AppSpecification {
  id: string;
  idea: StartupIdea;
  
  // Product Requirements
  prd: {
    overview: string;
    objectives: string[];
    successMetrics: string[];
    userStories: UserStory[];
    functionalRequirements: string[];
    nonFunctionalRequirements: string[];
  };

  // Technical Architecture
  architecture: {
    systemArchitecture: string;
    frontendArchitecture: string;
    backendArchitecture: string;
    databaseSchema: DatabaseSchema;
    apiEndpoints: APIEndpoint[];
    thirdPartyIntegrations: string[];
  };

  // UI/UX Design
  design: {
    wireframes: WireframeSpec[];
    userFlows: UserFlow[];
    designSystem: {
      colors: string[];
      typography: string[];
      components: string[];
    };
  };

  // Development Plan
  development: {
    phases: DevelopmentPhase[];
    milestones: Milestone[];
    estimatedTimeline: string;
    teamRequirements: TeamMember[];
  };

  // Go-to-Market
  gtm: {
    targetAudience: string;
    valueProposition: string;
    pricingModel: string;
    marketingChannels: string[];
    launchStrategy: string;
  };

  createdAt: Date;
}

export interface UserStory {
  as: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  priority: 'must-have' | 'should-have' | 'nice-to-have';
}

export interface DatabaseSchema {
  tables: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      constraints: string[];
    }>;
    relationships: string[];
  }>;
}

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  requestBody?: any;
  responseBody?: any;
  authentication: boolean;
}

export interface WireframeSpec {
  screen: string;
  description: string;
  elements: string[];
  interactions: string[];
}

export interface UserFlow {
  name: string;
  steps: string[];
  alternatives: string[];
}

export interface DevelopmentPhase {
  phase: string;
  duration: string;
  deliverables: string[];
  tasks: string[];
}

export interface Milestone {
  name: string;
  date: string;
  criteria: string[];
}

export interface TeamMember {
  role: string;
  skills: string[];
  commitment: string;
}

/**
 * Idea to App Converter
 * Transforms startup ideas into complete app specifications
 */
export class IdeaToAppConverter {
  private claude: Anthropic;

  constructor() {
    this.claude = new Anthropic({ apiKey: config.claude.apiKey });
  }

  /**
   * Convert an idea into a full app specification
   */
  async convertIdeaToApp(idea: StartupIdea): Promise<AppSpecification> {
    logger.info('Converting idea to app specification', { ideaId: idea.id });

    const spec: AppSpecification = {
      id: `spec-${Date.now()}`,
      idea,
      prd: await this.generatePRD(idea),
      architecture: await this.generateArchitecture(idea),
      design: await this.generateDesign(idea),
      development: await this.generateDevelopmentPlan(idea),
      gtm: await this.generateGTMStrategy(idea),
      createdAt: new Date(),
    };

    logger.info('App specification generated', { specId: spec.id });

    return spec;
  }

  /**
   * Generate Product Requirements Document
   */
  private async generatePRD(idea: StartupIdea): Promise<AppSpecification['prd']> {
    const prompt = `Generate a detailed Product Requirements Document for this startup idea:

**Idea:** ${idea.title}
**Problem:** ${idea.problem}
**Solution:** ${idea.solution}
**Target Market:** ${idea.targetMarket}

Generate:
1. Product Overview (2-3 paragraphs)
2. 5 key objectives
3. 5 success metrics
4. 10 user stories in format "As a [user], I want [action] so that [benefit]"
5. 10 functional requirements
6. 5 non-functional requirements

Return in JSON format.`;

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = this.extractTextFromResponse(response);
      const prdData = this.parseJSONResponse(content);

      return {
        overview: prdData.overview || `${idea.title} addresses ${idea.problem} by providing ${idea.solution}`,
        objectives: prdData.objectives || [
          'Launch MVP in 3 months',
          'Acquire 1000 users in first 6 months',
          'Achieve product-market fit',
        ],
        successMetrics: prdData.success_metrics || [
          'User activation rate > 40%',
          'Weekly active users growth > 10%',
          'Customer satisfaction score > 4.5/5',
        ],
        userStories: this.parseUserStories(prdData.user_stories || []),
        functionalRequirements: prdData.functional_requirements || idea.keyFeatures,
        nonFunctionalRequirements: prdData.non_functional_requirements || [
          'System uptime > 99.9%',
          'Page load time < 2 seconds',
          'Support 10,000 concurrent users',
        ],
      };

    } catch (error) {
      logger.warn('Failed to generate PRD via Claude, using fallback');
      return this.generateDefaultPRD(idea);
    }
  }

  /**
   * Generate technical architecture
   */
  private async generateArchitecture(idea: StartupIdea): Promise<AppSpecification['architecture']> {
    const complexity = idea.developmentComplexity;

    return {
      systemArchitecture: this.generateSystemArchitecture(complexity),
      frontendArchitecture: 'React SPA with TypeScript, state management via Redux/Zustand',
      backendArchitecture: 'REST API with Node.js/Express, microservices for scaling',
      databaseSchema: this.generateDatabaseSchema(idea),
      apiEndpoints: this.generateAPIEndpoints(idea),
      thirdPartyIntegrations: this.selectIntegrations(idea),
    };
  }

  /**
   * Generate UI/UX design specifications
   */
  private async generateDesign(idea: StartupIdea): Promise<AppSpecification['design']> {
    return {
      wireframes: this.generateWireframes(idea),
      userFlows: this.generateUserFlows(idea),
      designSystem: {
        colors: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
        typography: ['Inter', 'Roboto', 'SF Pro'],
        components: ['Button', 'Input', 'Card', 'Modal', 'Dropdown', 'Table'],
      },
    };
  }

  /**
   * Generate development plan
   */
  private async generateDevelopmentPlan(idea: StartupIdea): Promise<AppSpecification['development']> {
    const complexity = idea.developmentComplexity;
    
    return {
      phases: this.generatePhases(complexity),
      milestones: this.generateMilestones(complexity),
      estimatedTimeline: idea.estimatedTimeline,
      teamRequirements: this.generateTeamRequirements(complexity),
    };
  }

  /**
   * Generate go-to-market strategy
   */
  private async generateGTMStrategy(idea: StartupIdea): Promise<AppSpecification['gtm']> {
    return {
      targetAudience: idea.targetMarket,
      valueProposition: idea.uniqueValue,
      pricingModel: idea.monetization[0] || 'Freemium',
      marketingChannels: [
        'Product Hunt launch',
        'Content marketing (SEO blog)',
        'LinkedIn outreach',
        'Twitter/X community building',
        'YouTube tutorials',
      ],
      launchStrategy: this.generateLaunchStrategy(idea),
    };
  }

  // Helper methods

  private generateSystemArchitecture(complexity: string): string {
    if (complexity === 'low') {
      return 'Monolithic architecture: Frontend (Vercel) -> Backend (Heroku) -> Database (PostgreSQL)';
    }
    return 'Microservices architecture: Frontend (Vercel/Cloudflare) -> API Gateway -> Services (AWS Lambda/ECS) -> Databases (PostgreSQL + Redis) + Message Queue (RabbitMQ)';
  }

  private generateDatabaseSchema(idea: StartupIdea): DatabaseSchema {
    return {
      tables: [
        {
          name: 'users',
          fields: [
            { name: 'id', type: 'UUID', constraints: ['PRIMARY KEY'] },
            { name: 'email', type: 'VARCHAR(255)', constraints: ['UNIQUE', 'NOT NULL'] },
            { name: 'name', type: 'VARCHAR(255)', constraints: ['NOT NULL'] },
            { name: 'created_at', type: 'TIMESTAMP', constraints: ['DEFAULT NOW()'] },
          ],
          relationships: ['has many workspaces'],
        },
        {
          name: 'workspaces',
          fields: [
            { name: 'id', type: 'UUID', constraints: ['PRIMARY KEY'] },
            { name: 'name', type: 'VARCHAR(255)', constraints: ['NOT NULL'] },
            { name: 'owner_id', type: 'UUID', constraints: ['FOREIGN KEY users(id)'] },
          ],
          relationships: ['belongs to user', 'has many items'],
        },
      ],
    };
  }

  private generateAPIEndpoints(idea: StartupIdea): APIEndpoint[] {
    return [
      {
        method: 'POST',
        path: '/api/auth/register',
        description: 'Register new user',
        requestBody: { email: 'string', password: 'string', name: 'string' },
        responseBody: { user: 'object', token: 'string' },
        authentication: false,
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Login user',
        requestBody: { email: 'string', password: 'string' },
        responseBody: { user: 'object', token: 'string' },
        authentication: false,
      },
      {
        method: 'GET',
        path: '/api/workspaces',
        description: 'Get user workspaces',
        responseBody: { workspaces: 'array' },
        authentication: true,
      },
      {
        method: 'POST',
        path: '/api/workspaces',
        description: 'Create workspace',
        requestBody: { name: 'string' },
        responseBody: { workspace: 'object' },
        authentication: true,
      },
    ];
  }

  private selectIntegrations(idea: StartupIdea): string[] {
    const integrations = ['Stripe (payments)', 'SendGrid (emails)', 'Auth0 (authentication)'];
    
    if (idea.keyFeatures.some(f => f.toLowerCase().includes('ai'))) {
      integrations.push('OpenAI/Anthropic API');
    }
    
    return integrations;
  }

  private generateWireframes(idea: StartupIdea): WireframeSpec[] {
    return [
      {
        screen: 'Landing Page',
        description: 'Hero section with value prop, features, CTA',
        elements: ['Header', 'Hero', 'Features grid', 'Testimonials', 'CTA', 'Footer'],
        interactions: ['Sign up button', 'Demo video play'],
      },
      {
        screen: 'Dashboard',
        description: 'Main app interface',
        elements: ['Sidebar nav', 'Top bar', 'Main content', 'Quick actions'],
        interactions: ['Create new', 'Filter', 'Search', 'Sort'],
      },
    ];
  }

  private generateUserFlows(idea: StartupIdea): UserFlow[] {
    return [
      {
        name: 'User Onboarding',
        steps: [
          'Land on homepage',
          'Click sign up',
          'Enter email/password',
          'Verify email',
          'Complete profile',
          'See dashboard',
        ],
        alternatives: ['Skip email verification', 'Social login (Google/GitHub)'],
      },
    ];
  }

  private generatePhases(complexity: string): DevelopmentPhase[] {
    if (complexity === 'low') {
      return [
        {
          phase: 'Phase 1: MVP',
          duration: '6 weeks',
          deliverables: ['Core features', 'Basic UI', 'User auth'],
          tasks: ['Setup infrastructure', 'Build frontend', 'Build API', 'Testing'],
        },
        {
          phase: 'Phase 2: Launch',
          duration: '2 weeks',
          deliverables: ['Production deployment', 'Marketing site', 'Beta users'],
          tasks: ['Deploy to production', 'Create marketing materials', 'Get first users'],
        },
      ];
    }

    return [
      {
        phase: 'Phase 1: Foundation',
        duration: '4 weeks',
        deliverables: ['Architecture', 'Auth system', 'Database'],
        tasks: ['Design system architecture', 'Setup infrastructure', 'Build auth'],
      },
      {
        phase: 'Phase 2: Core Features',
        duration: '8 weeks',
        deliverables: ['Main features', 'API', 'Admin panel'],
        tasks: ['Build core functionality', 'API development', 'Admin tools'],
      },
      {
        phase: 'Phase 3: Polish & Launch',
        duration: '4 weeks',
        deliverables: ['Production app', 'Marketing', 'Launch'],
        tasks: ['Bug fixes', 'Performance optimization', 'Marketing prep', 'Launch'],
      },
    ];
  }

  private generateMilestones(complexity: string): Milestone[] {
    return [
      {
        name: 'MVP Complete',
        date: '+8 weeks',
        criteria: ['Core features working', 'User can complete key workflow', '10 beta testers onboarded'],
      },
      {
        name: 'Public Beta',
        date: '+12 weeks',
        criteria: ['100 active users', 'Bug-free experience', 'Positive feedback'],
      },
      {
        name: 'V1.0 Launch',
        date: '+16 weeks',
        criteria: ['1000 users', 'Revenue generating', 'Product-market fit signals'],
      },
    ];
  }

  private generateTeamRequirements(complexity: string): TeamMember[] {
    if (complexity === 'low') {
      return [
        { role: 'Full-stack Developer', skills: ['React', 'Node.js', 'PostgreSQL'], commitment: 'Full-time' },
        { role: 'Designer', skills: ['UI/UX', 'Figma'], commitment: 'Part-time' },
      ];
    }

    return [
      { role: 'Frontend Developer', skills: ['React', 'TypeScript', 'Tailwind'], commitment: 'Full-time' },
      { role: 'Backend Developer', skills: ['Node.js', 'Python', 'PostgreSQL'], commitment: 'Full-time' },
      { role: 'DevOps Engineer', skills: ['AWS', 'Docker', 'CI/CD'], commitment: 'Part-time' },
      { role: 'Product Designer', skills: ['UI/UX', 'Figma', 'User Research'], commitment: 'Full-time' },
    ];
  }

  private generateLaunchStrategy(idea: StartupIdea): string {
    return `1. Private Beta (Week 1-2): 50 invite-only users
2. Public Beta (Week 3-4): Open to all, Product Hunt launch
3. V1.0 Launch (Week 8): Full marketing campaign, press releases
4. Growth Phase: SEO content, partnerships, paid acquisition`;
  }

  private parseUserStories(stories: any[]): UserStory[] {
    return stories.map((s: any) => ({
      as: s.as || 'user',
      iWant: s.i_want || s.want || '',
      soThat: s.so_that || s.benefit || '',
      acceptanceCriteria: s.criteria || [],
      priority: s.priority || 'should-have',
    }));
  }

  private generateDefaultPRD(idea: StartupIdea): AppSpecification['prd'] {
    return {
      overview: `${idea.title} is designed to solve ${idea.problem} for ${idea.targetMarket}.`,
      objectives: idea.keyFeatures.slice(0, 5),
      successMetrics: ['User growth > 10%/week', 'Retention > 40%', 'NPS > 50'],
      userStories: [],
      functionalRequirements: idea.keyFeatures,
      nonFunctionalRequirements: ['99.9% uptime', 'Fast performance', 'Secure'],
    };
  }

  private extractTextFromResponse(response: any): string {
    return response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
  }

  private parseJSONResponse(text: string): any {
    try {
      // Remove markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }
}
