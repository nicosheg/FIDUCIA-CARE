-- Add timing and state columns to scan_jobs
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS queued_at TIMESTAMP DEFAULT NOW();
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMP;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS provider_used TEXT;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS heartbeat TIMESTAMP;
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS image_hash TEXT;

-- Add audit columns to people
ALTER TABLE people ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE people ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE people ADD COLUMN IF NOT EXISTS last_scan_job_id UUID;
ALTER TABLE people ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMP;

-- Ensure unique constraint on attendance_records
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'attendance_records' AND constraint_name = 'unique_member_date'
    ) THEN
        ALTER TABLE attendance_records ADD CONSTRAINT unique_member_date UNIQUE (member_id, attendance_date);
    END IF;
END $$;

-- Optional: add foreign key for last_scan_job_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scan_jobs') THEN
        ALTER TABLE people ADD CONSTRAINT fk_people_scan_job
            FOREIGN KEY (last_scan_job_id) REFERENCES scan_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;
