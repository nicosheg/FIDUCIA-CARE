-- Add source, created_by, last_scan_job_id to people
ALTER TABLE people ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE people ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE people ADD COLUMN IF NOT EXISTS last_scan_job_id UUID;

-- Ensure unique constraint on (member_id, attendance_date) for attendance_records
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'attendance_records' AND constraint_name = 'unique_member_date'
    ) THEN
        ALTER TABLE attendance_records ADD CONSTRAINT unique_member_date UNIQUE (member_id, attendance_date);
    END IF;
END $$;

-- Add foreign key for last_scan_job_id if scan_jobs exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scan_jobs') THEN
        ALTER TABLE people ADD CONSTRAINT fk_people_scan_job 
            FOREIGN KEY (last_scan_job_id) REFERENCES scan_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;
