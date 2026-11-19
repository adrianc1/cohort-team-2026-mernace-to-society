begin;

create or replace function public.update_bill_with_audit(
	p_bill_id uuid,
	p_invoice_number text,
	p_amount numeric,
	p_issue_date date,
	p_due_date date,
	p_vendor_account_id uuid,
	p_review_reason text,
	p_bill_url text,
	p_update_bill_url boolean,
	p_comments text default null,
	p_update_comments boolean default false
)
returns public.bill
language plpgsql
security definer
set search_path = ''
as $$
declare
	actor_id uuid := auth.uid();
	existing_bill public.bill%rowtype;
	updated_bill public.bill%rowtype;
	resolved_property_id uuid;
	normalized_invoice_number text := pg_catalog.btrim(p_invoice_number);
	normalized_review_reason text := nullif(pg_catalog.btrim(p_review_reason), '');
	normalized_bill_url text := case
		when p_update_bill_url then nullif(pg_catalog.btrim(p_bill_url), '')
		else null
	end;
	normalized_comments text := case
		when p_update_comments then nullif(pg_catalog.btrim(p_comments), '')
		else null
	end;
	updated_amount numeric := pg_catalog.round(p_amount, 2);
	next_status text;
	details jsonb := '{}'::jsonb;
	changed_fields text[] := array[]::text[];
begin
	if actor_id is null then
		raise exception using
			errcode = '42501',
			message = 'Authentication is required';
	end if;

	if not public.can_approve_bills() then
		raise exception using
			errcode = '42501',
			message = 'Only active managers and admins can edit bills';
	end if;

	if normalized_invoice_number is null
		or normalized_invoice_number = ''
		or pg_catalog.length(normalized_invoice_number) > 50 then
		raise exception using
			errcode = '22023',
			message = 'Invoice number is required and must be 50 characters or less';
	end if;
	if p_amount is null
		or p_amount::text in ('NaN', 'Infinity', '-Infinity')
		or updated_amount <= 0
		or updated_amount > 1000000 then
		raise exception using
			errcode = '22023',
			message = 'Amount must be greater than 0 and no more than 1000000';
	end if;
	if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
		raise exception using
			errcode = '22023',
			message = 'Issue and due dates are required, and due date cannot be before issue date';
	end if;
	if p_vendor_account_id is null then
		raise exception using
			errcode = '22023',
			message = 'Vendor account is required';
	end if;
	if p_review_reason is not null
		and pg_catalog.length(pg_catalog.btrim(p_review_reason)) > 2000 then
		raise exception using
			errcode = '22023',
			message = 'Review reason must be 2000 characters or less';
	end if;
	if p_update_bill_url is null or p_update_comments is null then
		raise exception using
			errcode = '22023',
			message = 'Bill URL and comments update flags are required';
	end if;
	if p_update_bill_url
		and normalized_bill_url is not null
		and (
			pg_catalog.length(normalized_bill_url) > 2048
			or normalized_bill_url !~* '^https?://'
		) then
		raise exception using
			errcode = '22023',
			message = 'Bill URL must be a valid HTTP or HTTPS URL of 2048 characters or less';
	end if;
	if normalized_comments is not null
		and pg_catalog.length(normalized_comments) > 2000 then
		raise exception using
			errcode = '22023',
			message = 'Comments must be 2000 characters or less';
	end if;

	select bill.*
	into existing_bill
	from public.bill as bill
	where bill.id = p_bill_id
		and bill.status in ('pending', 'needs_review', 'extraction_failed')
	for update;

	if not found then
		raise exception using
			errcode = 'P0002',
			message = 'Bill was not found or is no longer pending';
	end if;

	select account.property_id
	into resolved_property_id
	from public.vendor_account as account
	where account.id = p_vendor_account_id;

	if not found then
		raise exception using
			errcode = '22023',
			message = 'Vendor account not found';
	end if;

	resolved_property_id := coalesce(existing_bill.property_id, resolved_property_id);
	if resolved_property_id is null then
		raise exception using
			errcode = '22023',
			message = 'Vendor account must have a primary property';
	end if;

	next_status := case
		when normalized_review_reason is not null then 'needs_review'
		else 'pending'
	end;

	if existing_bill.invoice_number is distinct from normalized_invoice_number then
		details := details || pg_catalog.jsonb_build_object(
			'invoice_number',
			pg_catalog.jsonb_build_object('old', existing_bill.invoice_number, 'new', normalized_invoice_number)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Invoice number');
	end if;
	if existing_bill.amount is distinct from updated_amount then
		details := details || pg_catalog.jsonb_build_object(
			'amount',
			pg_catalog.jsonb_build_object('old', existing_bill.amount, 'new', updated_amount)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Amount');
	end if;
	if existing_bill.issue_date is distinct from p_issue_date then
		details := details || pg_catalog.jsonb_build_object(
			'issue_date',
			pg_catalog.jsonb_build_object('old', existing_bill.issue_date, 'new', p_issue_date)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Issue date');
	end if;
	if existing_bill.due_date is distinct from p_due_date then
		details := details || pg_catalog.jsonb_build_object(
			'due_date',
			pg_catalog.jsonb_build_object('old', existing_bill.due_date, 'new', p_due_date)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Due date');
	end if;
	if existing_bill.vendor_account_id is distinct from p_vendor_account_id then
		details := details || pg_catalog.jsonb_build_object(
			'vendor_account_id',
			pg_catalog.jsonb_build_object('old', existing_bill.vendor_account_id, 'new', p_vendor_account_id)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Vendor account');
	end if;
	if existing_bill.property_id is distinct from resolved_property_id then
		details := details || pg_catalog.jsonb_build_object(
			'property_id',
			pg_catalog.jsonb_build_object('old', existing_bill.property_id, 'new', resolved_property_id)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Property');
	end if;
	if existing_bill.review_reason is distinct from normalized_review_reason then
		details := details || pg_catalog.jsonb_build_object(
			'review_reason',
			pg_catalog.jsonb_build_object('old', existing_bill.review_reason, 'new', normalized_review_reason)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Review reason');
	end if;
	if p_update_bill_url
		and existing_bill.bill_url is distinct from normalized_bill_url then
		details := details || pg_catalog.jsonb_build_object(
			'bill_url',
			pg_catalog.jsonb_build_object('old', existing_bill.bill_url, 'new', normalized_bill_url)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Bill URL');
	end if;
	if p_update_comments
		and existing_bill.comments is distinct from normalized_comments then
		details := details || pg_catalog.jsonb_build_object(
			'comments',
			pg_catalog.jsonb_build_object('old', existing_bill.comments, 'new', normalized_comments)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Comments');
	end if;
	if existing_bill.status is distinct from next_status then
		details := details || pg_catalog.jsonb_build_object(
			'status',
			pg_catalog.jsonb_build_object('old', existing_bill.status, 'new', next_status)
		);
		changed_fields := pg_catalog.array_append(changed_fields, 'Status');
	end if;

	update public.bill as bill
	set
		invoice_number = normalized_invoice_number,
		amount = updated_amount,
		issue_date = p_issue_date,
		due_date = p_due_date,
		vendor_account_id = p_vendor_account_id,
		property_id = resolved_property_id,
		review_reason = normalized_review_reason,
		bill_url = case
			when p_update_bill_url then normalized_bill_url
			else bill.bill_url
		end,
		comments = case
			when p_update_comments then normalized_comments
			else bill.comments
		end,
		status = next_status
	where bill.id = p_bill_id
	returning bill.* into updated_bill;

	insert into public.audit_trail (
		bill_id,
		user_id,
		action,
		from_status,
		to_status,
		note,
		details
	)
	values (
		updated_bill.id,
		actor_id,
		'bill_edited',
		existing_bill.status,
		updated_bill.status,
		case
			when pg_catalog.cardinality(changed_fields) = 0
				then 'Bill edited; no field values changed.'
			else 'Updated: ' || pg_catalog.array_to_string(changed_fields, ', ')
		end,
		details
	);

	return updated_bill;
end;
$$;

revoke all on function public.update_bill_with_audit(
	uuid, text, numeric, date, date, uuid, text, text, boolean, text, boolean
) from public, anon;
grant execute on function public.update_bill_with_audit(
	uuid, text, numeric, date, date, uuid, text, text, boolean, text, boolean
) to authenticated;

commit;
