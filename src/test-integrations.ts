/**
 * Integration Test Script
 *
 * Tests each integration client directly (no server needed).
 *
 * Usage:
 *   npx ts-node src/test-integrations.ts google
 *   npx ts-node src/test-integrations.ts notion
 *   npx ts-node src/test-integrations.ts slack
 *   npx ts-node src/test-integrations.ts erp
 *   npx ts-node src/test-integrations.ts all
 */

import dotenv from 'dotenv';
dotenv.config();

const target = process.argv[2] || 'all';

async function testGoogle() {
  console.log('\n=== Testing Google Workspace ===\n');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log('SKIP: Google not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
    return;
  }

  const { GoogleWorkspaceClient } = await import('./integrations/google-workspace');
  const client = new GoogleWorkspaceClient(clientId, clientSecret, refreshToken);

  try {
    console.log('1. Testing Gmail search...');
    const emails = await client.searchMessages({ query: 'is:inbox', maxResults: 3 });
    console.log(`   Found ${emails.messages.length} emails`);
    if (emails.messages[0]) {
      console.log(`   Latest: "${emails.messages[0].subject}" from ${emails.messages[0].from}`);
    }
    console.log('   PASS');
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }

  try {
    console.log('2. Testing Calendar list events...');
    const events = await client.listEvents({});
    console.log(`   Found ${events.count} upcoming events`);
    if (events.events[0]) {
      console.log(`   Next: "${events.events[0].title}" at ${events.events[0].startTime}`);
    }
    console.log('   PASS');
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }

  try {
    console.log('3. Testing Drive search...');
    const files = await client.searchFiles({ query: 'report' });
    console.log(`   Found ${files.count} files`);
    if (files.files[0]) {
      console.log(`   First: "${files.files[0].name}"`);
    }
    console.log('   PASS');
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }
}

async function testNotion() {
  console.log('\n=== Testing Notion ===\n');

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.log('SKIP: Notion not configured (set NOTION_API_KEY)');
    return;
  }

  const { NotionClient } = await import('./integrations/notion-client');
  const client = new NotionClient(apiKey);

  try {
    console.log('1. Testing Notion search...');
    const results = await client.search({ query: 'test' });
    console.log(`   Found ${results.count} results`);
    if (results.results[0]) {
      console.log(`   First: "${results.results[0].title}" (${results.results[0].type})`);
    }
    console.log('   PASS');
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }
}

async function testSlack() {
  console.log('\n=== Testing Slack ===\n');

  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    console.log('SKIP: Slack not configured (set SLACK_BOT_TOKEN)');
    return;
  }

  const { SlackClient } = await import('./integrations/slack-client');
  const client = new SlackClient(botToken);

  console.log('NOTE: Slack send test will actually send a message. Skipping by default.');
  console.log('To test, uncomment the send test below and set a channel name.');
  console.log('   SKIPPED (to avoid sending real messages)');

  // Uncomment to test:
  // try {
  //   console.log('1. Testing Slack send message...');
  //   const result = await client.sendMessage({ channel: '#test', text: 'Integration test from SMS Agent' });
  //   console.log(`   Sent to ${result.channel}, ts: ${result.messageTs}`);
  //   console.log('   PASS');
  // } catch (error: any) {
  //   console.log(`   FAIL: ${error.message}`);
  // }
}

async function testErp() {
  console.log('\n=== Testing ERP ===\n');

  const apiUrl = process.env.ERP_API_URL;
  const apiKey = process.env.ERP_API_KEY;
  if (!apiUrl || !apiKey) {
    console.log('SKIP: ERP not configured (set ERP_API_URL and ERP_API_KEY)');
    return;
  }

  const { ErpClient } = await import('./integrations/erp-client');
  const client = new ErpClient(apiUrl, apiKey);

  try {
    console.log('1. Testing ERP get inventory...');
    const inventory = await client.getInventory({ brand: "Carol's Daughter" });
    console.log(`   Response:`, JSON.stringify(inventory).slice(0, 200));
    console.log('   PASS');
  } catch (error: any) {
    console.log(`   FAIL: ${error.message}`);
  }
}

async function main() {
  console.log('SMS Agent - Integration Test Suite');
  console.log('==================================');

  if (target === 'google' || target === 'all') await testGoogle();
  if (target === 'notion' || target === 'all') await testNotion();
  if (target === 'slack' || target === 'all') await testSlack();
  if (target === 'erp' || target === 'all') await testErp();

  console.log('\n==================================');
  console.log('Tests complete.');
}

main().catch(console.error);
