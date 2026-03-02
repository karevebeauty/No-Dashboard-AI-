-- SMS Agent Database Setup for Replit
-- Run this after connecting to your Replit PostgreSQL database

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
  direction VARCHAR(10) NOT NULL, -- 'inbound' or 'outbound'
  body TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL,
  metadata JSONB
);

-- Action logs table (for audit trail)
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

-- Cost tracking table
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_action_logs_phone ON action_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_action_id ON action_logs(action_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_session ON cost_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_phone ON cost_tracking(phone_number);

-- Success message
SELECT 'Database setup complete!' as status;
