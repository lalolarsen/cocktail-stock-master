-- Create app_secrets table for storing sensitive configuration (e.g., QZ Tray keys)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled — no policies means no access for anon/authenticated users.
-- Service role bypasses RLS automatically.
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Function to retrieve a secret by name.
-- Called by qz-sign and qz-certificate Edge Functions using the service role key.
CREATE OR REPLACE FUNCTION public.get_qz_secret(secret_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.app_secrets WHERE name = secret_name LIMIT 1;
$$;

-- Restrict execution: only service_role can call this function.
REVOKE ALL ON FUNCTION public.get_qz_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_qz_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_qz_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_qz_secret(text) TO service_role;
