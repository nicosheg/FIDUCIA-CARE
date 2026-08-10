-- ============================================================
-- Priority 1 – Final Database Migration (Batch 4)
-- Run ONCE before deploying new code
-- ============================================================

-- Check for duplicates before adding constraint
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT organization_id, phone
    FROM people
    WHERE phone IS NOT NULL
    GROUP BY organization_id, phone
    HAVING COUNT(*) > 1
  ) dup;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Duplicate phone numbers found. Please reconcile before adding constraint.';
  END IF;
END $$;

-- Add unique constraint
ALTER TABLE people ADD CONSTRAINT people_org_phone_unique UNIQUE (organization_id, phone);
