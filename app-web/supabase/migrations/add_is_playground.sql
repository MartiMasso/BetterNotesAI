-- Add is_playground flag to projects table
-- Distinguishes playground/draft sessions from AI-generated projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_playground boolean NOT NULL DEFAULT false;
