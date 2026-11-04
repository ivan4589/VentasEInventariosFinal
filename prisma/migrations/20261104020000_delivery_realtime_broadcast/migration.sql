-- Supabase Realtime phase 2. No table is exposed to Postgres Changes.
-- DB triggers publish opaque identifiers ONLY. Android must reload through the
-- authenticated NestJS API; broadcast is not an authority for stock or delivery.
--
-- On plain PostgreSQL without the Supabase 'realtime' schema, this migration
-- deliberately does nothing. Do not treat that as a passing Realtime test.
DO $setup$
BEGIN
  IF to_regnamespace('realtime') IS NULL OR to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'Supabase Realtime schema unavailable; skipping broadcast triggers';
    RETURN;
  END IF;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION public.yungas_notify_sale_realtime()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
    BEGIN
      IF NEW."deliveryMode" = true
        AND (TG_OP = 'INSERT'
          OR OLD."deliveryRevision" IS DISTINCT FROM NEW."deliveryRevision"
          OR OLD."status" IS DISTINCT FROM NEW."status") THEN
        BEGIN
          PERFORM realtime.send(
            jsonb_build_object('saleId', NEW."id", 'revision', NEW."deliveryRevision"),
            'changed', 'yungas:delivery', true
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Realtime sale event skipped; delivery saved normally (SQLSTATE %)', SQLSTATE;
        END;
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$;

  EXECUTE $function$
    CREATE OR REPLACE FUNCTION public.yungas_notify_inventory_realtime()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
    BEGIN
      IF TG_OP = 'INSERT'
        OR OLD."stock" IS DISTINCT FROM NEW."stock"
        OR OLD."reservedStock" IS DISTINCT FROM NEW."reservedStock" THEN
        BEGIN
          PERFORM realtime.send(
            jsonb_build_object('productId', NEW."productId", 'warehouseId', NEW."warehouseId"),
            'changed', 'yungas:inventory', true
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Realtime inventory event skipped; stock saved normally (SQLSTATE %)', SQLSTATE;
        END;
      END IF;
      RETURN NEW;
    END;
    $body$;
  $function$;

  DROP TRIGGER IF EXISTS yungas_sales_realtime ON public."sales";
  CREATE TRIGGER yungas_sales_realtime
    AFTER INSERT OR UPDATE ON public."sales"
    FOR EACH ROW EXECUTE FUNCTION public.yungas_notify_sale_realtime();

  DROP TRIGGER IF EXISTS yungas_inventory_realtime ON public."warehouse_stocks";
  CREATE TRIGGER yungas_inventory_realtime
    AFTER INSERT OR UPDATE ON public."warehouse_stocks"
    FOR EACH ROW EXECUTE FUNCTION public.yungas_notify_inventory_realtime();

  -- The user identity is not the Supabase Auth UUID. NestJS authenticates users
  -- and signs a separate, short-lived HS256 Realtime token with these claims:
  -- role=authenticated, yungas_user_id, yungas_security_version,
  -- and optional yungas_session_id. RLS validates against our own User table.
  -- Send-only: clients cannot create broadcast messages, just receive.
  DROP POLICY IF EXISTS yungas_delivery_inventory_listen ON realtime.messages;
  CREATE POLICY yungas_delivery_inventory_listen
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      extension = 'broadcast'
      AND realtime.topic() IN ('yungas:delivery', 'yungas:inventory')
      AND coalesce(auth.jwt() ->> 'yungas_user_id', '') ~ '^[0-9]{1,10}$'
      AND coalesce(auth.jwt() ->> 'yungas_security_version', '') ~ '^[0-9]{1,10}$'
      AND EXISTS (
        SELECT 1 FROM public."User" u
        WHERE u.id = (auth.jwt() ->> 'yungas_user_id')::integer
          AND u."isActive" = true
          AND u."status"::text = 'ACTIVE'
          AND u."role"::text IN ('VENDEDOR', 'ADMIN')
          AND u."securityVersion" = (auth.jwt() ->> 'yungas_security_version')::integer
          AND (
            auth.jwt() ->> 'yungas_session_id' IS NULL
            OR EXISTS (
              SELECT 1 FROM public.auth_sessions ses
              WHERE ses.id = auth.jwt() ->> 'yungas_session_id'
                AND ses."userId" = u.id
                AND ses."revokedAt" IS NULL
                AND ses."expiresAt" > now()
            )
          )
      )
    );
END;
$setup$;
