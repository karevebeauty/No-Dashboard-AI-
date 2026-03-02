# SMS AI Agent - Replit Edition 🚀

**Action-capable SMS agent** that manages your entire business through text messages.

## What This Does

Text your Twilio number to:
- ✅ **Read data**: Check inventory, view emails, search documents
- ⚠️ **Take actions**: Create POs, send emails, schedule meetings (with confirmation)
- 🔍 **Scrape the web**: Extract data from any website, monitor prices, search Google
- 🤖 **Autonomous tasks**: Multi-step workflows that research, decide, and act
- 💼 **Sales outreach**: LinkedIn prospecting, personalized campaigns, lead scoring
- 🎯 **Lead research**: Company intelligence, decision maker identification
- 💡 **Startup ideas**: Google Trends analysis, Reddit mining, idea validation
- 🏗️ **Idea to app**: Generate specs, architecture, code from concepts
- 📋 **Full audit**: Every action is logged and trackable
- 🔒 **Secure**: Phone-based auth + confirmation for destructive ops

## Key Features

### Intelligent Action System
- **Read-only queries execute immediately** (no confirmation needed)
- **Actions require SMS confirmation** with unique codes
- **5-minute expiration** on pending actions
- **Complete audit trail** of all operations

### Integrated Systems
- ERP & Warehouse (KarEve Beauty Group operations)
- Google Workspace (Gmail, Calendar, Drive)
- Notion (pages and databases)
- Slack (messaging)
- CareFlow (customer support)
- Custom APIs (your ERP/warehouse systems)
- **Web Scraping** (any public website)
- **Google Search** (automated research)
- **Price Monitoring** (track product prices)
- **Screenshot Capture** (visual webpage captures)
- **LinkedIn** (prospecting, outreach, research)
- **Sales Intelligence** (lead scoring, company research)
- **Outreach Campaigns** (multi-step sequences)

## Quick Start (5 Minutes)

### 1. Import to Replit

Option A: **From GitHub**
- Click "Create Repl" → "Import from GitHub"
- Paste your repo URL
- Replit auto-detects Node.js

Option B: **Manual Upload**
- Create new Node.js Repl
- Upload all files from `sms-agent-replit/`

### 2. Configure Secrets

Click **Tools** → **Secrets**, add these:

```bash
# Required
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
AUTHORIZED_PHONE_NUMBERS=+12345678900
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Generate these
SESSION_SECRET=<32 random characters>
ENCRYPTION_KEY=<32 random characters>
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 3. Set Up Database

Replit provides PostgreSQL automatically. In Shell:

```bash
psql $DATABASE_URL < setup-database.sql
```

Or manually run the SQL from `REPLIT-DEPLOY.md`.

### 4. Install & Run

```bash
npm install
npm start
```

### 5. Configure Twilio

1. Copy your Repl URL: `https://your-repl.repl.co`
2. Go to [Twilio Console](https://console.twilio.com)
3. Phone Numbers → Your Number → Messaging
4. Webhook URL: `https://your-repl.repl.co/sms/webhook`
5. Save

### 6. Test!

Text your Twilio number:
```
"What's our inventory for Carol's Daughter moisturizer?"
```

## Usage Examples

### Read-Only (Instant)

```
You: "What's our inventory for AcneFree?"

Agent: "🔍 AcneFree Spot Treatment:
• Current: 847 units
• Warehouse: 612
• Transit: 235
✅ Stock healthy"
```

### Actions (Require Confirmation)

```
You: "Create a PO for 500 units from BeautySource"

Agent: "⚠️ Confirm Action

Create Purchase Order

Vendor: BeautySource LLC
Items: 500 units
Est. value: $4,250.00

✅ Reply 'CONFIRM ABC123' to proceed
❌ Reply 'CANCEL ABC123' to abort

Expires in 5 minutes"

You: "CONFIRM ABC123"

Agent: "✅ Purchase Order Created

PO #45893
Vendor: BeautySource LLC
Total: $4,250.00
Status: Draft"
```

### Multi-Step Actions

```
You: "Email Q1 report to team and schedule review meeting tomorrow 2pm"

Agent: "📧 Found 'Q1 Report.pdf'

⚠️ Confirm 2 Actions:

1. Send email to operations@kareve.com
2. Create meeting Mar 2 @ 2:00 PM

Reply 'CONFIRM XYZ789' to execute both

Expires in 5 minutes"
```

### Web Scraping

```
You: "Research competitor pricing for iPhone 15"

Agent: "🔍 Researching...

Found 5 competitors:
• Best Buy: $1,199
• Amazon: $1,189  
• Target: $1,199
• Walmart: $1,195
• Apple: $1,199

Average: $1,196
Our price: $1,249

Reply 'adjust' to update pricing"
```

### Autonomous Tasks

```
You: "Monitor Apple store and alert me when iPhone 15 Pro is in stock"

Agent: "⏰ Monitoring Started

URL: store.apple.com/iphone-15-pro
Condition: In stock
Checks: Every 2 hours
Status: Currently out of stock

You'll receive SMS when available ✓"
```

### Sales Outreach

```
You: "Find CTOs at Series B SaaS companies and start outreach campaign"

Agent: "🎯 Prospecting Complete

Found: 25 qualified CTOs
Avg Score: 82/100

Top 3:
• Sarah Chen - DataFlow (92)
• Michael Torres - CloudCorp (89)
• Jennifer Lee - AppScale (87)

Campaign: 3-step LinkedIn sequence
Duration: 7 days
Expected replies: 6-8

⚠️ Reply 'CONFIRM ABC123' to launch
"
```

### Startup Idea Generation

```
You: "Generate startup ideas from Google Trends and Reddit"

Agent: "💡 3 Validated Ideas

Idea #1: AI Meeting Assistant (94/100) 🔥
• Problem: Teams waste 12hrs/week in meetings
• Solution: Auto-record, transcribe, extract action items
• Market: $2.3B growing 45%/year
• Timeline: 3-4 months MVP
• Investment: $30K-50K

Reply 'BUILD 1' for full app specification
Reply 'VALIDATE 1' for market research

Idea #2: No-Code Workflow Builder (89/100)
• Problem: Tools don't connect
• Solution: Visual automation platform
[continues...]"
```

## Action Types

### Immediate Execution (No Confirmation)
- ✅ Check inventory levels
- ✅ View purchase orders
- ✅ Search emails
- ✅ List calendar events
- ✅ Find documents
- ✅ View customer tickets

### Requires Confirmation
- ⚠️ Create/update purchase orders
- ⚠️ Send emails
- ⚠️ Create/modify calendar events
- ⚠️ Send Slack messages
- ⚠️ Create/update Notion pages
- ⚠️ Update customer tickets

### Web Scraping (Read-Only)
- ✅ Scrape any public URL
- ✅ Search Google
- ✅ Extract product information
- ✅ Take screenshots
- ✅ Monitor prices
- ✅ Extract structured data

## File Structure

```
sms-agent-replit/
├── .replit                          # Replit configuration
├── replit.nix                       # Nix dependencies
├── REPLIT-DEPLOY.md                 # Detailed deployment guide
├── README.md                        # This file
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── .env.example                     # Environment template
└── src/
    ├── index.ts                     # Entry point
    ├── config.ts                    # Configuration
    ├── types/index.ts               # TypeScript types
    ├── services/
    │   ├── message-router.ts        # SMS handling
    │   ├── claude-service-enhanced.ts  # AI with actions
    │   ├── action-confirmation-service.ts  # Confirmation flow
    │   ├── mcp-service.ts           # System integrations
    │   ├── redis-client.ts          # Redis connection
    │   └── ...
    └── utils/
        ├── logger.ts                # Logging
        └── ...
```

## Security

### Authentication
- ✅ Phone number whitelist
- ✅ Twilio signature validation
- ✅ Action confirmation with unique codes
- ✅ 5-minute expiration on pending actions

### Audit Trail
Every action is logged:
- Who requested it
- What was requested
- Confirmation code
- Execution result
- Timestamp

View audit log:
```sql
SELECT * FROM action_logs 
ORDER BY executed_at DESC 
LIMIT 20;
```

### Rate Limiting
- 10 messages/minute
- 100 messages/hour
- 500 messages/day

## Monitoring

### Health Check
```
https://your-repl.repl.co/health
```

### Logs
Visible in Replit Console (auto-updating)

### Database Queries

**Recent actions:**
```sql
SELECT action_id, tool_name, description, success 
FROM action_logs 
ORDER BY executed_at DESC LIMIT 10;
```

**Cost tracking:**
```sql
SELECT SUM(total_cost) as total_spent 
FROM cost_tracking 
WHERE timestamp >= NOW() - INTERVAL '30 days';
```

## Customization

### Add New Action

Edit `src/services/mcp-service.ts`:

```typescript
this.registerTool({
  name: 'your_new_action',
  description: 'What it does',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Param description' },
    },
    required: ['param1'],
  },
  annotations: { destructiveHint: true }, // Requires confirmation
}, this.yourHandler.bind(this));
```

### Change Confirmation Behavior

Edit `src/services/action-confirmation-service.ts`:

```typescript
private readonly REQUIRES_CONFIRMATION = [
  'erp_create_po',
  'gmail_send_message',
  'your_new_action', // Add here
];
```

### Customize AI Behavior

Edit `src/services/claude-service-enhanced.ts` → `buildSystemPrompt()`

## Cost Estimate

**Monthly (1000 conversations + actions):**
- Twilio SMS: ~$8
- Claude API: ~$100
- Replit Hacker: $7
- **Total: ~$115/month**

## Troubleshooting

**SMS not working:**
- Check Repl is running (green Run button)
- Verify Twilio webhook URL
- Check phone in AUTHORIZED_PHONE_NUMBERS
- View logs in Console

**Action won't confirm:**
- Code must match exactly (case-sensitive)
- Must confirm within 5 minutes
- Phone number must match requester

**Database errors:**
- Repl provides DATABASE_URL automatically
- Run setup SQL if tables missing
- Check Replit Database status

## Advanced

### Scheduled Notifications

Add to `src/index.ts`:

```typescript
import cron from 'node-cron';

// Daily inventory report at 8 AM
cron.schedule('0 8 * * *', async () => {
  const report = await generateReport();
  await sendSMS('+1234567890', report);
});
```

### Custom Event Triggers

```typescript
// Low inventory alert
emitter.on('inventory:low', async (product) => {
  await sendSMS('+1234567890', 
    `⚠️ Low stock: ${product.name} at ${product.quantity} units`
  );
});
```

## Documentation

- **README.md** (this file) - Quick start guide
- **REPLIT-DEPLOY.md** - Complete deployment guide
- **WEB-SCRAPING-GUIDE.md** - Web scraping & autonomous tasks
- **SALES-OUTREACH-GUIDE.md** - LinkedIn automation & sales campaigns
- **STARTUP-IDEAS-GUIDE.md** - Idea generation, validation & app building
- Inline code comments for implementation details

## Support

For issues:
1. Check Replit Console logs
2. Review REPLIT-DEPLOY.md troubleshooting section
3. Test health endpoint
4. Verify secrets are set correctly

Contact: ahmad@bridgesystems.com

---

**Built with:**
- [Claude AI](https://anthropic.com) - Intelligence
- [Twilio](https://twilio.com) - SMS
- [Replit](https://replit.com) - Hosting
- TypeScript, Node.js, PostgreSQL, Redis

**Deploy once, manage everything via SMS.** 📱
