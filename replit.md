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

## Key Endpoints
- `GET /` - Status page with service health
- `GET /health` - Health check
- `POST /sms/webhook` - Twilio SMS webhook
- `POST /sms/status` - SMS delivery status callback

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
