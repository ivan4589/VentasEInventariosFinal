-- Backend-only tables: preserve trusted owner access and business data.
ALTER TABLE "public"."bonus_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sale_bonus_details" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.bonus_rules, public.sale_bonus_details FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.bonus_rules, public.sale_bonus_details FROM authenticated;
  END IF;
END
$$;
