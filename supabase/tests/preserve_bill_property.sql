-- Run against an isolated, migrated test database; all fixture changes roll back.
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
	'a8000000-0000-4000-8000-000000000001',
	'bill-property-test@example.invalid',
	now(),
	'{"name":"Bill Property Test"}'::jsonb
);
update public."user"
set role = 'manager', status = 'active'
where id = 'a8000000-0000-4000-8000-000000000001';
select pg_catalog.set_config('request.jwt.claim.sub', 'a8000000-0000-4000-8000-000000000001', true);

insert into public.property (id, name, street, city, state, zip, status)
values
	('a8000000-0000-4000-8000-000000000002', 'Original', '1 Main St', 'Tampa', 'FL', '33602', 'active'),
	('a8000000-0000-4000-8000-000000000003', 'New', '2 Main St', 'Tampa', 'FL', '33602', 'active');
insert into public.vendor (id, name, aliases, portal_url, status, email, phone_number)
values ('a8000000-0000-4000-8000-000000000004', 'Test Vendor', array[]::text[],
	'https://example.invalid', 'active', 'vendor@example.invalid', '555-0101');
insert into public.vendor_account (id, vendor_id, property_id, account_number, service, payment_type, status)
values
	('a8000000-0000-4000-8000-000000000005', 'a8000000-0000-4000-8000-000000000004',
	 'a8000000-0000-4000-8000-000000000003', 'bill-property-test', 'Electric', 'manual', 'active'),
	('a8000000-0000-4000-8000-000000000008', 'a8000000-0000-4000-8000-000000000004',
	 null, 'bill-property-test-unassigned', 'Electric', 'manual', 'active');
insert into public.bill (id, created_by, status, property_id, vendor_account_id, invoice_number, amount, issue_date, due_date)
values
	('a8000000-0000-4000-8000-000000000006', 'a8000000-0000-4000-8000-000000000001', 'pending',
	 'a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000005',
	 'property-test-1', 100, '2026-01-01', '2026-01-31'),
	('a8000000-0000-4000-8000-000000000007', 'a8000000-0000-4000-8000-000000000001', 'needs_review',
	 null, null, null, null, null, null),
	('a8000000-0000-4000-8000-000000000009', 'a8000000-0000-4000-8000-000000000001', 'needs_review',
	 null, null, null, null, null, null);

set local role authenticated;
do $$
declare
	updated_bill public.bill%rowtype;
begin
	updated_bill := public.update_bill_with_audit(
		'a8000000-0000-4000-8000-000000000006', 'property-test-1', 105,
		'2026-01-01', '2026-01-31', 'a8000000-0000-4000-8000-000000000005',
		null, null, false, 'Updated comment', true
	);
	if updated_bill.property_id <> 'a8000000-0000-4000-8000-000000000002'::uuid
		or updated_bill.comments <> 'Updated comment' then
		raise exception 'Editing changed the original property or lost comments';
	end if;
	if not exists (
		select 1 from public.get_bill_audit_history(updated_bill.id)
		where action = 'bill_edited'
			and details ? 'amount' and details ? 'comments' and not details ? 'property_id'
	) then
		raise exception 'Existing bill edit audit is incorrect';
	end if;

	updated_bill := public.update_bill_with_audit(
		'a8000000-0000-4000-8000-000000000007', 'property-test-2', 100,
		'2026-01-01', '2026-01-31', 'a8000000-0000-4000-8000-000000000005',
		null, null, false, null, false
	);
	if updated_bill.property_id <> 'a8000000-0000-4000-8000-000000000003'::uuid then
		raise exception 'Unassigned bill did not receive the account property';
	end if;
	if not exists (
		select 1 from public.get_bill_audit_history(updated_bill.id)
		where action = 'bill_edited'
			and details -> 'property_id' ->> 'new' = 'a8000000-0000-4000-8000-000000000003'
	) then
		raise exception 'Assigned property was not audited';
	end if;

	begin
		perform public.update_bill_with_audit(
			'a8000000-0000-4000-8000-000000000009', 'property-test-3', 100,
			'2026-01-01', '2026-01-31', 'a8000000-0000-4000-8000-000000000008',
			null, null, false, null, false
		);
		raise exception 'An unassigned bill accepted an account without a property';
	exception when invalid_parameter_value then
		null;
	end;
	if exists (
		select 1 from public.get_bill_audit_history('a8000000-0000-4000-8000-000000000009')
		where action = 'bill_edited'
	) then
		raise exception 'A rejected edit created an audit entry';
	end if;
end;
$$;
rollback;
