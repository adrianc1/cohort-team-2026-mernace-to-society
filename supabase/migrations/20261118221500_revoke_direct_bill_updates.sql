begin;

revoke update on table public.bill from public, anon, authenticated;
grant update on table public.bill to service_role;

commit;
