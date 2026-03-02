# Web Scraping & Autonomous Actions Guide

Complete guide for using your SMS agent to scrape the web and execute autonomous multi-step tasks.

## Overview

Your agent can now:
- 🔍 **Scrape any website** - Extract text, data, images
- 🤖 **Execute autonomous tasks** - Multi-step workflows without constant input
- 📊 **Extract structured data** - Product info, prices, tables, lists
- 📸 **Take screenshots** - Visual captures of any webpage
- 🔎 **Search the web** - Google search integration
- ⚡ **Act on findings** - Create POs, send emails, schedule meetings based on research

## Web Scraping Capabilities

### 1. Basic URL Scraping

**Command:**
```
"Scrape https://example.com"
```

**What it does:**
- Extracts page title
- Gets main content
- Returns cleaned text
- Automatically handles static or dynamic content

**Response:**
```
🔍 Scraped: example.com

Title: Example Domain
Content: This domain is for use in illustrative examples...

Reply 'full' for complete text
```

### 2. Search the Web

**Command:**
```
"Search for iPhone 15 reviews"
```

**What it does:**
- Searches Google
- Returns top 10 results
- Includes titles, URLs, snippets

**Response:**
```
🔎 Search: iPhone 15 reviews

Found 10 results:

1. TechCrunch Review
   https://techcrunch.com/iphone-15
   "Best camera upgrade yet..."

2. The Verge Analysis
   https://theverge.com/iphone-15
   "Impressive battery life..."

Reply 'scrape 1' to read full article
```

### 3. Extract Product Information

**Command:**
```
"Extract product info from https://amazon.com/product/xyz"
```

**What it does:**
- Finds price
- Extracts title, description
- Gets availability
- Finds product images
- Extracts ratings

**Response:**
```
📦 Product Info Extracted

Title: iPhone 15 Pro Max
Price: $1,199.00
Availability: In Stock
Rating: 4.8/5 stars
Image: [link]

Reply 'buy' to create PO
```

### 4. Take Screenshots

**Command:**
```
"Take screenshot of https://example.com"
```

**What it does:**
- Captures webpage visually
- Returns base64-encoded image
- Full page or specific element
- Customizable viewport

**Response:**
```
📸 Screenshot captured

URL: example.com
Size: 156 KB
Format: PNG

Screenshot: [base64 data]

Image sent to your email
```

### 5. Monitor Prices

**Command:**
```
"Monitor price of https://amazon.com/product/xyz and alert me if it drops below $1000"
```

**What it does:**
- Checks price periodically
- Compares to target price
- Sends SMS alert when condition met

**Response:**
```
⏰ Price Monitor Active

Product: iPhone 15 Pro Max
Current: $1,199.00
Target: Below $1,000.00
Checks: Daily

You'll receive alerts via SMS
```

## Autonomous Task Execution

### How It Works

1. **You give a high-level command**
2. **Agent breaks it into steps**
3. **Executes each step automatically**
4. **Reports results back**

### Command Patterns

#### Pattern 1: Research + Action

**Format:** "Research [topic] and [action]"

**Example:**
```
"Research competitor pricing for iPhone 15 and create a pricing analysis email to the team"
```

**What happens:**
1. 🔍 Searches for competitor iPhone 15 prices
2. 📊 Extracts prices from top results
3. 🤔 Compares prices to our pricing
4. ⚠️ Creates email draft (requires confirmation)
5. ✅ Sends email after confirmation

**Response:**
```
🤖 Autonomous Task Started

Steps:
1. 🔍 Search competitor pricing ✓
2. 📊 Extract price data ✓
3. 🤔 Analyze pricing ✓
4. 📧 Draft email ⏳

Found 5 competitors:
• Best Buy: $1,199
• Amazon: $1,189
• Target: $1,199
• Walmart: $1,195
• Apple: $1,199

⚠️ Reply 'CONFIRM ABC123' to send email
```

#### Pattern 2: Monitor + Alert

**Format:** "Monitor [website] and alert me if/when [condition]"

**Example:**
```
"Monitor https://store.apple.com and alert me when iPhone 15 Pro is in stock"
```

**What happens:**
1. 🔍 Scrapes store page hourly
2. 🤔 Checks availability status
3. 📱 Sends SMS when condition met

**Response:**
```
⏰ Monitoring Started

URL: store.apple.com
Condition: iPhone 15 Pro in stock
Checks: Every hour
Status: Currently out of stock

You'll receive SMS when available
```

#### Pattern 3: Extract + Order

**Format:** "Find the price of [product] and order it"

**Example:**
```
"Find the price of wholesale skincare products from BeautySource and create a PO if under $5,000"
```

**What happens:**
1. 🔍 Searches for BeautySource wholesale
2. 📊 Extracts product list and prices
3. 🤔 Calculates total cost
4. 📋 Creates PO if under budget
5. ⚠️ Requests confirmation

**Response:**
```
🤖 Task: Find & Order

1. 🔍 Found BeautySource catalog ✓
2. 📊 Extracted 12 products ✓
3. 🤔 Total cost: $4,250 ✓
4. 📋 PO draft created ⏳

Products:
• Moisturizer (100) - $2,100
• Serum (75) - $1,400
• Cleanser (120) - $750

Total: $4,250 ✅ Under budget

⚠️ Reply 'CONFIRM XYZ789' to create PO
```

#### Pattern 4: Scrape + Extract

**Format:** "Scrape [url] and extract [data]"

**Example:**
```
"Scrape https://competitor.com/products and extract product names and prices"
```

**What happens:**
1. 🔍 Scrapes competitor website
2. 📊 Extracts structured data
3. 📋 Formats for review

**Response:**
```
📊 Data Extracted

Source: competitor.com/products
Items: 24 products

Sample:
• Product A - $29.99
• Product B - $39.99
• Product C - $49.99
...

Full list sent to your email
Reply 'compare' to compare with our prices
```

## Advanced Examples

### Example 1: Competitive Analysis Workflow

**Command:**
```
"Research top 5 beauty brands' Q1 promotions, extract their discount strategies, and create a competitive analysis report"
```

**Execution:**
1. Search for each brand's Q1 promotions
2. Scrape promotion pages
3. Extract discount percentages, timing, products
4. Compare strategies
5. Generate analysis document
6. Email to team (after confirmation)

**Result:**
```
🤖 Competitive Analysis Complete

Brands analyzed: 5
Promotions found: 23

Key insights:
• Average discount: 25%
• Most common: Buy 2 Get 1
• Peak timing: Early January

📄 Full report created
⚠️ Reply 'CONFIRM ABC123' to email team
```

### Example 2: Inventory Restocking Automation

**Command:**
```
"Check our inventory levels for AcneFree products, research wholesale prices, and create POs for items below reorder point"
```

**Execution:**
1. Query ERP for AcneFree inventory
2. Identify items below reorder point
3. Search wholesale suppliers
4. Compare prices across suppliers
5. Create PO drafts for best prices
6. Request confirmation

**Result:**
```
🤖 Restocking Analysis

Low stock items: 3

1. AcneFree Spot Treatment
   Current: 89 units (Reorder: 150)
   Need: 500 units
   Best price: $2,850 (BeautySource)

2. AcneFree Cleanser
   Current: 45 units (Reorder: 100)
   Need: 300 units
   Best price: $1,200 (SupplyCo)

📋 2 POs drafted | Total: $4,050

⚠️ Reply 'CONFIRM XYZ789' to create both POs
```

### Example 3: Content Monitoring

**Command:**
```
"Monitor TechCrunch for articles about AI agents and summarize key points daily"
```

**Execution:**
1. Scrape TechCrunch AI section daily
2. Identify new articles about AI agents
3. Extract key points
4. Summarize in SMS-friendly format
5. Send daily digest

**Result (Daily):**
```
📰 AI Agent News - Mar 1

Found 3 new articles:

1. "AI Agents Transform Business"
   • Adoption up 40% in Q1
   • Focus on automation
   • ROI averaging 3x

2. "OpenAI Launches New Agent SDK"
   • Developer-focused
   • Released yesterday
   • Free tier available

3. "Ethics of Autonomous AI"
   • Industry debate
   • New regulations proposed

Reply 'read 1' for full article
```

## Custom Extraction Rules

### Define Your Own Selectors

**Command:**
```
"Scrape https://site.com and extract:
- Product titles from .product-name
- Prices from .price-value
- Stock from .availability"
```

**Response:**
```
📊 Custom Extraction Complete

Extracted 15 items:

Product: Premium Widget
Price: $99.99
Stock: In Stock

Product: Deluxe Gadget
Price: $149.99
Stock: Low Stock

...

Full data sent to email
```

### Common Selectors

| Data Type | Common Selectors |
|-----------|-----------------|
| **Title** | `h1`, `.title`, `[itemprop="name"]` |
| **Price** | `.price`, `[itemprop="price"]`, `.product-price` |
| **Description** | `.description`, `[itemprop="description"]` |
| **Image** | `img.product`, `[itemprop="image"]` |
| **Rating** | `.rating`, `[itemprop="ratingValue"]` |
| **Availability** | `.stock`, `[itemprop="availability"]` |

## Best Practices

### 1. Start Simple

```
✅ "Scrape example.com"
✅ "Search for product reviews"

❌ "Scrape 50 websites and create complex analysis"
```

Start with single actions, then chain them.

### 2. Be Specific

```
✅ "Extract price from amazon.com/product/xyz"
✅ "Monitor this specific product page"

❌ "Get prices from Amazon"
❌ "Watch Amazon"
```

Specific URLs and conditions work best.

### 3. Set Realistic Timeframes

```
✅ "Check price daily"
✅ "Monitor hourly during business hours"

❌ "Check every second"
```

Respect rate limits and be reasonable.

### 4. Confirm Important Actions

```
✅ Always confirm before:
   • Creating purchase orders
   • Sending emails
   • Making purchases
   • Updating databases
```

Read-only research doesn't need confirmation.

### 5. Handle Errors Gracefully

If scraping fails:
- Agent tries dynamic method
- Falls back to search
- Suggests alternative approaches
- Reports clear errors

## Limitations & Legal

### Technical Limitations

- **JavaScript-heavy sites**: Some sites may be hard to scrape
- **CAPTCHAs**: Cannot bypass CAPTCHA protections
- **Rate limits**: Respects site rate limits
- **Dynamic content**: May miss AJAX-loaded content
- **Authentication**: Cannot access logged-in areas

### Legal Considerations

- ✅ **Public data**: Scraping public websites is generally OK
- ✅ **Personal use**: Using data for your own analysis
- ❌ **Terms of Service**: Some sites prohibit scraping
- ❌ **Copyrighted content**: Don't redistribute copyrighted material
- ⚠️ **robots.txt**: Agent respects robots.txt directives

**Best practice**: Only scrape sites you have permission to access.

## Troubleshooting

### "Failed to scrape URL"

**Possible causes:**
- Site blocks bots (try dynamic method)
- Invalid URL
- Site requires authentication
- CAPTCHA protection

**Solutions:**
```
"Try scraping with dynamic method"
"Search for the information instead"
```

### "Extraction rules returned no data"

**Possible causes:**
- Incorrect CSS selector
- Site structure changed
- Content is dynamically loaded

**Solutions:**
```
"Scrape the site without rules first"
"Take screenshot to inspect structure"
```

### "Task timeout"

**Possible causes:**
- Too many steps
- Slow websites
- Network issues

**Solutions:**
- Break into smaller tasks
- Increase timeout
- Retry with simpler approach

## Command Reference

### Quick Commands

| Command | Action |
|---------|--------|
| `scrape [url]` | Scrape content from URL |
| `search [query]` | Google search |
| `screenshot [url]` | Take webpage screenshot |
| `extract [url]` | Extract product info |
| `monitor [url]` | Set up monitoring |
| `research [topic]` | Research and report |

### Autonomous Patterns

| Pattern | Example |
|---------|---------|
| Research + Action | "Research X and do Y" |
| Monitor + Alert | "Monitor X and alert if Y" |
| Extract + Order | "Find price and order if Z" |
| Scrape + Extract | "Scrape X and extract Y" |

## Support

For issues with web scraping:
1. Check URL is publicly accessible
2. Try dynamic scraping method
3. Verify extraction rules
4. Review Replit logs

Contact: ahmad@bridgesystems.com

---

**Autonomous. Intelligent. Action-capable.** 🤖
