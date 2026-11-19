begin
alter table public.vendor_account_property enable row level security
drop policy if exists "vendor_account_property_select_policy"
	on public.vendor_account_property
drop policy if exists "vendor_account_property_insert_policy"
	on public.vendor_account_property
drop policy if exists "vendor_account_property_update_policy"
	on public.vendor_account_property
drop policy if exists "vendor_account_property_delete_policy"
	on public.vendor_account_property
revoke all on table public.vendor_account_property from public, anon, authenticated
commit