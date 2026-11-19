begin;

CREATE OR REPLACE FUNCTION public.log_bill_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    ignored_fields text[] := ARRAY[
        'id', 'created_at', 'updated_at', 'status',
        'approved_by', 'approved_on', 'rejection_reason', 'paid_on'
    ];
    new_row jsonb := pg_catalog.to_jsonb(NEW) - ignored_fields;
BEGIN
    -- Updates are audited by the dedicated atomic audit functions.
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Preserve the existing bill-created audit behavior.
    INSERT INTO public.audit_trail (
        bill_id, user_id, action, from_status, to_status, note, changes
    )
    VALUES (
        NEW.id,
        auth.uid(),
        'bill_created',
        NULL,
        NEW.status,
        'Bill uploaded',
        pg_catalog.jsonb_strip_nulls(new_row)
    );

    RETURN NEW;
END;
$function$;

commit;
SQLcat > ../supabase/migrations/20261118231900_fix_bill_audit_trigger.sql <<'SQL'
begin;

CREATE OR REPLACE FUNCTION public.log_bill_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    ignored_fields text[] := ARRAY[
        'id', 'created_at', 'updated_at', 'status',
        'approved_by', 'approved_on', 'rejection_reason', 'paid_on'
    ];
    new_row jsonb := pg_catalog.to_jsonb(NEW) - ignored_fields;
BEGIN
    -- Updates are audited by the dedicated atomic audit functions.
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;

    -- Preserve the existing bill-created audit behavior.
    INSERT INTO public.audit_trail (
        bill_id, user_id, action, from_status, to_status, note, changes
    )
    VALUES (
        NEW.id,
        auth.uid(),
        'bill_created',
        NULL,
        NEW.status,
        'Bill uploaded',
        pg_catalog.jsonb_strip_nulls(new_row)
    );

    RETURN NEW;
END;
$function$;

commit;
