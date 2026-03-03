# SMS Agent Server

## Overview
SMS-powered AI agent built with Express/TypeScript. Provides SMS webhook handling via Twilio, AI processing via Claude, with Redis caching and PostgreSQL storage.

## Architecture
- **Framework**: Express.js with TypeScript
- **Entry Point**: `src/index.ts`
- **Config**: `src/config.ts` (env-var driven, all external services optional)
- **Port**: 5000 (default)

## Project Structure
```
src/
  index.ts              - Server entry point
  config.ts             - Configuration (env vars)
  types/index.ts        - TypeScript type definitions
  services/             - Business logic services
    message-router.ts   - SMS message routing (Twilio)
    claude-service.ts   - Claude AI integration
    database.ts         - PostgreSQL connection
    redis-client.ts     - Redis connection
    health-check.ts     - Health monitoring
    notification-service.ts - SMS notifications
    personal-assistant-service.ts - Cron-based assistant
    ... (many more service files)
  integrations/         - External service clients (Google, Notion, Slack, ERP)
  utils/                - Logger, error handler, response formatter
```

## Frontend Dashboard
- Static files served from `public/` directory
- `public/index.html` - Main dashboard page
- `public/styles.css` - Tesla-inspired light theme (white/gray backgrounds, dark accents, bold typography)
- `public/app.js` - Dashboard client logic
- Pages: Overview, Agents, Users, Security, Services, Messages, Logs, Settings

## Admin Dashboard Modules
- **Agents**: Create/edit/delete AI agent profiles with LLM model, tier, capabilities, system prompt
- **Users**: View all SMS users with phone, name, email, assigned agent, tier, last activity, status; edit user agent/tier/status
- **Security**: Configure session timeouts, idle thresholds, re-authentication rules, passcode settings; saved to system_settings table

## Key Endpoints
- `GET /` - Dashboard UI
- `GET /api/status` - Server status JSON (used by dashboard)
- `GET /health` - Health check
- `POST /sms/webhook` - Twilio SMS webhook
- `POST /sms/status` - SMS delivery status callback
- `GET/POST/PUT/DELETE /api/admin/agents` - Agent profile CRUD
- `GET/PUT /api/admin/users` - User management
- `GET/PUT /api/admin/security-settings` - Security configuration
- `GET/POST/PUT/DELETE /api/admin/tiers` - Subscription tier management
- `GET /api/admin/logs` - Admin action audit log

## External Services (all optional for dev)
- **Twilio**: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_WEBHOOK_URL
- **Claude**: ANTHROPIC_API_KEY
- **Redis**: REDIS_URL (defaults to localhost:6379)
- **PostgreSQL**: DATABASE_URL (configured)
- **Encryption**: ENCRYPTION_KEY (32 chars)
- **Auth**: AUTHORIZED_PHONE_NUMBERS (comma-separated)

## Running
```
npx ts-node-dev --respawn --transpile-only src/index.ts
```
