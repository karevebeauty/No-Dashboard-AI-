# SMS Agent - Replit Deployment Guide

Complete guide for deploying your action-capable SMS agent on Replit.

## Overview

This SMS agent can both **retrieve information** and **take actions** on your behalf:
- ✅ Read-only queries execute immediately
- ⚠️ Actions require confirmation via SMS
- 📋 Full audit trail of all actions
- 🔒 Secure with phone number authentication

---

## Quick Deploy on Replit

### Step 1: Create New Repl

1. Go to [Replit](https://replit.com)
2. Click **Create Repl**
3. Select **Import from GitHub** (or **Blank Repl** if uploading manually)
4. Choose **Node.js** template
5. Name it: `sms-agent`

### Step 2: Upload Code

If not importing from GitHub:
1. Upload all files from `sms-agent-replit/` folder
2. Ensure `.replit` and `replit.nix` are in root directory

### Step 3: Set Up Database

Replit provides PostgreSQL automatically:

1. Click **Tools** → **Database**
2. Enable PostgreSQL
3. Note the connection URL (automatically available as `DATABASE_URL`)

### Step 4: Configure Secrets

Click **Tools** → **Secrets** and add:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Your Phone Number (authorized user)
AUTHORIZED_PHONE_NUMBERS=+12345678900

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# Claude Model
CLAUDE_MODEL=claude-sonnet-4-20250514

# Session Secret (generate random string)
SESSION_SECRET=your_random_32_character_secret_key

# Encryption Key (exactly 32 characters)
ENCRYPTION_KEY=your_exactly_32_character_key

# Optional: Google Workspace
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret  
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Optional: Notion
NOTION_API_KEY=secret_xxxxxxxxxxxxx

# Optional: Slack
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxx

# Optional: Your ERP/Warehouse APIs
ERP_API_URL=https://erp.bridgesystems.com/api
ERP_API_KEY=your_api_key

WAREHOUSE_API_URL=https://warehouse.bridgesystems.com/api
WAREHOUSE_API_KEY=your_api_key

CAREFLOW_API_URL=https://careflow.biz/api
CAREFLOW_API_KEY=your_api_key
```

**How to generate secrets:**

```bash
# Session Secret (32 chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Encryption Key (32 chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### Step 5: Install Dependencies

In Replit Shell:

```bash
npm install
```

This installs:
- `@anthropic-ai/sdk` - Claude AI
- `twilio` - SMS communication
- `express` - Web server
- `pg` - PostgreSQL
- `ioredis` - Redis (Replit provides this)
- And all other dependencies

### Step 6: Set Up Database Tables

In Replit Shell:

```bash
# Connect to database
psql $DATABASE_URL

# Then paste and run:
```

```sql
-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(phone_number, session_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  message_id VARCHAR(100) UNIQUE NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  body TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL,
  metadata JSONB
);

-- Action logs table
CREATE TABLE IF NOT EXISTS action_logs (
  id SERIAL PRIMARY KEY,
  action_id VARCHAR(20) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  params JSONB NOT NULL,
  description TEXT,
  success BOOLEAN NOT NULL,
  result JSONB,
  error TEXT,
  executed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL
);

-- Cost tracking
CREATE TABLE IF NOT EXISTS cost_tracking (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  sms_count INTEGER DEFAULT 0,
  sms_cost DECIMAL(10,4) DEFAULT 0,
  api_tokens_input INTEGER DEFAULT 0,
  api_tokens_output INTEGER DEFAULT 0,
  api_cost DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_phone ON action_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(executed_at DESC);

\q
```

### Step 7: Configure Twilio Webhook

1. Start your Repl (click **Run**)
2. Copy your Repl URL: `https://your-repl-name.your-username.repl.co`
3. Go to [Twilio Console](https://console.twilio.com)
4. Navigate to **Phone Numbers** → **Active Numbers**
5. Click your SMS-enabled phone number
6. Under **Messaging Configuration**:
   - **A MESSAGE COMES IN**: Webhook
   - **URL**: `https://your-repl-name.your-username.repl.co/sms/webhook`
   - **HTTP**: POST
7. Save

### Step 8: Test Your Agent

Send an SMS to your Twilio number:

```
"What's our inventory for Carol's Daughter moisturizer?"
```

Expected response:
```
🔍 Checking inventory...

Carol's Daughter Hair Milk:
• Current: 847 units
• Warehouse: 612
• Transit: 235
✅ Stock healthy
```

---

## Action Confirmation Flow

### Read-Only Actions (Execute Immediately)

These commands execute without confirmation:

```
"What's our inventory for AcneFree?"
"Show me PO 12345"
"Check my calendar for tomorrow"
"Search emails from vendor@example.com"
"Find Q1 report in Drive"
```

### Actions Requiring Confirmation

These commands require confirmation:

```
"Create a PO for 500 units from BeautySource"
"Send the Q1 report to the team"
"Schedule a meeting tomorrow at 2pm"
"Update ticket TCK-001 to resolved"
```

**Example Flow:**

1. **You:** "Create a PO for 500 units from BeautySource"

2. **Agent:** 
```
⚠️ Confirm Action

Create Purchase Order

Vendor: BeautySource LLC
Items: 500 units
Est. value: $4,250.00

Reply with:
✅ "CONFIRM ABC123" to proceed
❌ "CANCEL ABC123" to abort

Expires in 5 minutes
```

3. **You:** "CONFIRM ABC123"

4. **Agent:**
```
✅ Purchase Order Created

PO #45893
Vendor: BeautySource LLC
Total: $4,250.00
Status: Draft

Reply 'submit' to send to vendor
```

### Cancelling Actions

```
You: "CANCEL ABC123"

Agent: 
❌ Action Cancelled

Action ABC123 has been cancelled.
```

---

## Available Actions

### ERP & Warehouse

**Read-Only:**
- Check inventory levels
- View purchase order status
- Track shipment status
- View sales reports

**Actions (require confirmation):**
- Create purchase orders
- Update purchase orders
- Create shipments
- Generate shipping labels

### Email (Gmail)

**Read-Only:**
- Search emails
- View email content

**Actions (require confirmation):**
- Send emails
- Reply to emails
- Forward emails

### Calendar (Google Calendar)

**Read-Only:**
- List events
- Check availability

**Actions (require confirmation):**
- Create events/meetings
- Update events
- Cancel events

### Documents (Google Drive)

**Read-Only:**
- Search documents
- View document content

**Actions (require confirmation):**
- Upload documents
- Share documents
- Create folders

### Collaboration

**Notion (require confirmation):**
- Create pages
- Update databases
- Add content

**Slack (require confirmation):**
- Send messages
- Post to channels

### Customer Support (CareFlow)

**Read-Only:**
- View tickets
- Search ticket history

**Actions (require confirmation):**
- Update ticket status
- Respond to customers
- Close tickets

---

## Monitoring & Maintenance

### View Logs

In Replit Console (bottom panel):
- Real-time logs appear automatically
- Look for errors in red
- Info messages in white

### Check Health

Open in browser:
```
https://your-repl-name.your-username.repl.co/health
```

Should return:
```json
{
  "status": "healthy",
  "components": {
    "twilio": true,
    "claude": true,
    "database": true
  }
}
```

### View Action History

Query database:

```bash
psql $DATABASE_URL

SELECT 
  action_id,
  tool_name,
  description,
  success,
  executed_at
FROM action_logs
WHERE phone_number = '+1234567890'
ORDER BY executed_at DESC
LIMIT 10;
```

### Cost Tracking

Check your costs:

```bash
psql $DATABASE_URL

SELECT 
  phone_number,
  SUM(sms_count) as total_sms,
  SUM(total_cost) as total_cost
FROM cost_tracking
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY phone_number;
```

---

## Security Best Practices

### 1. Phone Number Whitelist

Only authorized numbers can use the agent:

```bash
# In Secrets
AUTHORIZED_PHONE_NUMBERS=+12345678900,+19876543210
```

To add more numbers, update this secret and restart.

### 2. Action Confirmation

All destructive actions require explicit confirmation:
- Generated unique confirmation codes
- 5-minute expiration
- Full audit trail

### 3. Audit Logging

Every action is logged:
- Who initiated it
- What was requested
- When it was executed
- Result (success/failure)

View audit log:

```sql
SELECT * FROM action_logs 
ORDER BY executed_at DESC 
LIMIT 20;
```

### 4. Rate Limiting

Built-in rate limits:
- 10 messages per minute
- 100 messages per hour
- 500 messages per day

### 5. Sensitive Data

Never commit secrets:
- Use Replit Secrets for all credentials
- Don't hardcode API keys
- Keep `.env` in `.gitignore`

---

## Troubleshooting

### SMS Not Receiving

**Check:**
1. Repl is running (green "Run" button)
2. Twilio webhook URL is correct
3. Your phone number is in `AUTHORIZED_PHONE_NUMBERS`
4. Check Replit logs for errors

**Test webhook manually:**

```bash
curl -X POST https://your-repl.repl.co/sms/webhook \
  -d "From=+1234567890" \
  -d "Body=test message"
```

### Claude API Errors

**Check:**
1. `ANTHROPIC_API_KEY` is set correctly in Secrets
2. API key is valid (test at https://console.anthropic.com)
3. Account has sufficient credits

### Database Errors

**Check:**
1. DATABASE_URL is automatically set by Replit
2. Tables are created (run setup SQL again)
3. Check Replit database status

### Action Not Confirming

**Check:**
1. Confirmation code matches exactly (case-sensitive)
2. Action hasn't expired (5 minutes)
3. Phone number matches the one that created action

---

## Updating Your Agent

### Adding New Tools

1. Edit `src/services/mcp-service.ts`
2. Add new tool in `registerTools()`:

```typescript
this.registerTool({
  name: 'your_new_tool',
  description: 'What it does',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter 1' },
    },
    required: ['param1'],
  },
  annotations: { destructiveHint: true }, // If requires confirmation
}, this.yourToolHandler.bind(this));
```

3. Implement handler:

```typescript
private async yourToolHandler(params: any): Promise<any> {
  // Your implementation
  return { success: true };
}
```

4. Click **Run** to restart

### Changing Confirmation Requirements

Edit `src/services/action-confirmation-service.ts`:

```typescript
private readonly REQUIRES_CONFIRMATION = [
  'erp_create_po',
  'gmail_send_message',
  'your_new_destructive_tool', // Add here
];
```

### Updating Prompts

Edit `src/services/claude-service-enhanced.ts` → `buildSystemPrompt()` to customize how the agent behaves.

---

## Advanced Features

### Scheduled Actions

Create a cron job in Replit:

1. Install cron: `npm install node-cron`
2. Add to `src/index.ts`:

```typescript
import cron from 'node-cron';

// Daily inventory report at 8 AM
cron.schedule('0 8 * * *', async () => {
  const report = await generateInventoryReport();
  await sendSMS('+1234567890', report);
});
```

### Custom Notifications

Add event listeners for your systems:

```typescript
// When inventory drops below threshold
eventEmitter.on('inventory:low', async (product) => {
  const message = `⚠️ Low Inventory Alert
  
${product.name}
Current: ${product.quantity} units
Reorder point: ${product.reorderPoint}`;

  await sendSMS('+1234567890', message);
});
```

### Multi-User Support

To support multiple users with different permissions:

1. Extend `AUTHORIZED_PHONE_NUMBERS`:

```bash
# In Secrets - add phone:role pairs
USER_PERMISSIONS={
  "+12345678900": ["*"],
  "+19876543210": ["erp", "gmail"],
  "+15555555555": ["read_only"]
}
```

2. Update auth service to parse permissions per user

---

## Cost Optimization

### SMS Costs (Twilio)
- **Price**: ~$0.0079 per SMS (US)
- **Optimization**: 
  - Keep responses concise
  - Use message chunking wisely
  - Consider WhatsApp Business API (~$0.005/msg)

### Claude API Costs
- **Sonnet 4**: $3/MTok input, $15/MTok output
- **Optimization**:
  - Use prompt caching (enabled by default)
  - Limit conversation history to last 10 messages
  - Summarize long responses

### Monthly Estimate
- 1,000 SMS: ~$8
- 1,000 AI conversations: ~$100
- Replit Hacker Plan: $7/month
- **Total: ~$115/month**

---

## Support

### Getting Help

1. Check logs in Replit Console
2. Review this guide
3. Test individual components:
   - Webhook: `curl https://your-repl.repl.co/health`
   - Database: `psql $DATABASE_URL`
   - SMS: Send test message

### Common Commands

```bash
# Restart server
# Just click "Run" button again in Replit

# View logs
# Automatically visible in Console

# Check database
psql $DATABASE_URL

# Install new package
npm install package-name
```

---

## Next Steps

1. ✅ Complete Replit setup
2. ✅ Test with simple read queries
3. ✅ Test action confirmation flow
4. ✅ Configure your custom API integrations
5. ✅ Set up scheduled notifications
6. ✅ Add team members (if needed)

Your SMS agent is now ready to manage your business operations! 🚀

For questions: ahmad@bridgesystems.com
