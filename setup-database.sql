-- SMS Agent Database Setup
-- Full schema for all services

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- CORE TABLES
-- ==========================================

-- User accounts
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  role VARCHAR(100),
  company VARCHAR(255),
  subscription_tier VARCHAR(20) DEFAULT 'free', -- free, pro, enterprise
  security_level VARCHAR(20) DEFAULT 'standard', -- standard, high, maximum
  is_active BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false,
  failed_login_attempts INTEGER DEFAULT 0,
  onboarding_completed BOOLEAN DEFAULT false,
  profile_data JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  UNIQUE(phone_number, session_id)
);

-- Messages
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

-- Action logs (audit trail)
CREATE TABLE IF NOT EXISTS action_logs (
  id SERIAL PRIMARY KEY,
  action_id VARCHAR(50) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  params JSONB NOT NULL,
  description TEXT,
  success BOOLEAN NOT NULL,
  result JSONB,
  error TEXT,
  executed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
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

-- ==========================================
-- MEMORY & PERSONALIZATION
-- ==========================================

-- Memory entries (for Memory Bank service)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL, -- conversation, note, document, task, insight
  content TEXT NOT NULL,
  embedding FLOAT8[],
  tags TEXT[],
  importance DECIMAL(3,2) DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Personalization profiles
CREATE TABLE IF NOT EXISTS personalization_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id) UNIQUE,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  preferences JSONB DEFAULT '{}',
  patterns JSONB DEFAULT '{}',
  relationships JSONB DEFAULT '{}',
  goals JSONB DEFAULT '{}',
  learnings JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User insights (generated from memory analysis)
CREATE TABLE IF NOT EXISTS user_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  insight TEXT NOT NULL,
  category VARCHAR(50),
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- SECURITY & SESSIONS
-- ==========================================

-- Security sessions
CREATE TABLE IF NOT EXISTS security_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT NOW()
);

-- Re-authentication requests
CREATE TABLE IF NOT EXISTS reauth_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  passcode_hash VARCHAR(255) NOT NULL,
  channel VARCHAR(20) NOT NULL, -- email, sms
  status VARCHAR(20) DEFAULT 'pending', -- pending, verified, expired
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- ==========================================
-- SUBSCRIPTIONS & BILLING
-- ==========================================

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id) UNIQUE,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, paused, cancelled, expired
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage metrics (per billing period)
CREATE TABLE IF NOT EXISTS usage_metrics (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  sms_sent INTEGER DEFAULT 0,
  sms_received INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  tool_executions INTEGER DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- FITNESS COACH
-- ==========================================

-- Fitness profiles
CREATE TABLE IF NOT EXISTS fitness_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id) UNIQUE,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  age INTEGER,
  gender VARCHAR(10),
  height_cm DECIMAL(5,1),
  weight_kg DECIMAL(5,1),
  activity_level VARCHAR(20),
  fitness_goal VARCHAR(50),
  dietary_restrictions TEXT[],
  daily_calorie_target INTEGER,
  macro_targets JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workout plans
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  exercises JSONB NOT NULL,
  schedule JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Food logs
CREATE TABLE IF NOT EXISTS food_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  meal_type VARCHAR(20), -- breakfast, lunch, dinner, snack
  food_items JSONB NOT NULL,
  total_calories INTEGER,
  macros JSONB,
  photo_url TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Progress photos
CREATE TABLE IF NOT EXISTS progress_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  photo_url TEXT NOT NULL,
  weight_kg DECIMAL(5,1),
  body_fat_pct DECIMAL(4,1),
  notes TEXT,
  taken_at TIMESTAMP DEFAULT NOW()
);

-- Health data (from wearables)
CREATE TABLE IF NOT EXISTS health_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  source VARCHAR(50), -- apple_health, whoop, oura
  data_type VARCHAR(50), -- steps, heart_rate, sleep, hrv
  value JSONB NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- ADMIN & SYSTEM
-- ==========================================

-- Assistant profiles (admin-defined)
CREATE TABLE IF NOT EXISTS assistant_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt TEXT,
  capabilities JSONB DEFAULT '[]',
  integrations JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Admin actions (audit)
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_id UUID,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(100),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications log
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_id VARCHAR(100),
  recipient VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  delivery_status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES user_accounts(id),
  phone_number VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  remind_at TIMESTAMP NOT NULL,
  recurrence VARCHAR(20), -- once, daily, weekly, monthly
  is_active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Core
CREATE INDEX IF NOT EXISTS idx_user_accounts_phone ON user_accounts(phone_number);
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

-- Memory
CREATE INDEX IF NOT EXISTS idx_memories_phone ON memories(phone_number);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN(tags);

-- Security
CREATE INDEX IF NOT EXISTS idx_security_sessions_phone ON security_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_security_sessions_active ON security_sessions(is_active) WHERE is_active = true;

-- Fitness
CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_user ON health_data(user_id);
CREATE INDEX IF NOT EXISTS idx_health_data_type ON health_data(data_type);

-- Admin
CREATE INDEX IF NOT EXISTS idx_admin_actions_date ON admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
CREATE INDEX IF NOT EXISTS idx_reminders_phone ON reminders(phone_number);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active, remind_at) WHERE is_active = true;

-- Usage
CREATE INDEX IF NOT EXISTS idx_usage_metrics_user ON usage_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period_start, period_end);

-- ==========================================
-- SEED DATA
-- ==========================================

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('max_sms_per_day', '500', 'Maximum SMS messages per user per day'),
  ('max_api_cost_per_day', '50.00', 'Maximum API cost per day in USD'),
  ('default_subscription_tier', '"free"', 'Default tier for new users'),
  ('maintenance_mode', 'false', 'System maintenance mode flag')
ON CONFLICT (key) DO NOTHING;

SELECT 'Database setup complete! All tables created.' as status;
