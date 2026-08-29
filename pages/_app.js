-- nyeo Care onboarding initialization
-- IMPORTANT: Existing organizations are NOT modified.
-- Only future organizations receive onboarding.enabled=true.

ALTER TABLE public.organizations
ALTER COLUMN settings
SET DEFAULT '{
  "onboarding": {
    "enabled": true,
    "experienced": {
      "home": false,
      "scan": false,
      "people": false,
      "review": false,
      "profile": false
    }
  }
}'::jsonb;

-- Also initialize onboarding when a future organization explicitly
-- supplies NULL or an empty settings object.
CREATE OR REPLACE FUNCTION public.initialize_organization_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.settings IS NULL OR NEW.settings = '{}'::jsonb THEN
    NEW.settings := '{
      "onboarding": {
        "enabled": true,
        "experienced": {
          "home": false,
          "scan": false,
          "people": false,
          "review": false,
          "profile": false
        }
      }
    }'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_organization_settings
ON public.organizations;

CREATE TRIGGER initialize_organization_settings
BEFORE INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.initialize_organization_settings();
