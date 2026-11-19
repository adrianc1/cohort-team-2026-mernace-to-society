begin;

revoke update on public.vendor_account from authenticated;
grant update (account_number, service, additional_property_ids)
	on public.vendor_account to authenticated;

create policy "Active managers can update vendor account details"
	on public.vendor_account
	for update to authenticated
	using (
		public.is_current_user_active()
		and exists (
			select 1 from public.get_current_user_profile() as profile
			where lower(profile.role) in ('manager', 'admin')
		)
	)
	with check (
		public.is_current_user_active()
		and exists (
			select 1 from public.get_current_user_profile() as profile
			where lower(profile.role) in ('manager', 'admin')
		)
	);

commit;
