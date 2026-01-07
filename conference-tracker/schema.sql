-- Conference Tracker Database Schema

CREATE TABLE IF NOT EXISTS conferences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  deadline DATE NOT NULL,
  abstract_deadline DATE,
  location VARCHAR(255) NOT NULL,
  dates VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  link VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  
  -- Verification fields
  confidence_score VARCHAR(50) DEFAULT 'needs-review',
  verification_sources JSONB DEFAULT '[]'::jsonb,
  last_verified TIMESTAMP,
  verification_history JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conferences_deadline ON conferences(deadline);
CREATE INDEX IF NOT EXISTS idx_conferences_confidence ON conferences(confidence_score);
CREATE INDEX IF NOT EXISTS idx_conferences_status ON conferences(status);
CREATE INDEX IF NOT EXISTS idx_conferences_category ON conferences(category);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_conferences_updated_at BEFORE UPDATE ON conferences
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
