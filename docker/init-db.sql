-- Mail Queue Database Initialization
-- This script runs when the PostgreSQL container is first created

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types (enums will be created by Drizzle migrations)
-- This file is for any custom setup needed before migrations run

-- Grant permissions (for safety)
GRANT ALL PRIVILEGES ON DATABASE mailqueue TO mailqueue;

-- Output confirmation
DO $$
BEGIN
    RAISE NOTICE 'Mail Queue database initialized successfully';
END $$;
