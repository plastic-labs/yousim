-- Create summaries table for storing constructor conversation summaries
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_created ON summaries(created_at DESC);

-- Add RLS (Row Level Security) policies
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own summaries
CREATE POLICY "Users can view own summaries"
  ON summaries
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own summaries
CREATE POLICY "Users can insert own summaries"
  ON summaries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own summaries
CREATE POLICY "Users can update own summaries"
  ON summaries
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own summaries
CREATE POLICY "Users can delete own summaries"
  ON summaries
  FOR DELETE
  USING (auth.uid() = user_id);
