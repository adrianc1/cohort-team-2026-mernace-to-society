begin;

create function public.mark_bill_paid_with_audit(
	p_bill_id uuid,
	p_method text,
	p_confirmation_number text,
	p_receipt_url text
)
returns public.bill
language plpgsql
security definer
set search_path = ''
as $$
declare
	existing_bill public.bill%rowtype;
	updated_bill public.bill%rowtype;
	normalized_method text := nullif(pg_catalog.btrim(p_method), '');
	normalized_confirmation_number text :=
		nullif(pg_catalog.btrim(p_confirmation_number), '');
begin
	if normalized_method is null then
		raise exception using
			errcode = '22023',
			message = 'Payment method is required';
	end if;
	if normalized_confirmation_number is null then
		raise exception using
			errcode = '22023',
			message = 'Payment confirmation number is required';
	end if;

	select bill.*
	into existing_bill
	from public.bill as bill
	where bill.id = p_bill_id
		and bill.status = 'approved'
	for update;

	if not found then
		raise exception using
			errcode = 'P0002',
			message = 'Bill was not found or is no longer approved';
	end if;

	update public.bill as bill
	set
		status = 'paid',
		paid_on = current_date
	where bill.id = p_bill_id
	returning bill.* into updated_bill;

	insert into public.audit_trail (
		bill_id,
		user_id,
		action,
		from_status,
		to_status,
		note
	)
	values (
		updated_bill.id,
		null,
		'bill_paid',
		existing_bill.status,
		updated_bill.status,
		'Automated payment worker completed payment using '
			|| normalized_method
			|| '. Confirmation: '
			|| normalized_confirmation_number
	);

	insert into public.payment (
		bill_id,
		amount,
		status,
		method,
		confirmation_number,
		receipt_url,
		failure_reason,
		attempted_by,
		attempted_at
	)
	values (
		updated_bill.id,
		updated_bill.amount,
		'success',
		array[normalized_method],
		normalized_confirmation_number,
		p_receipt_url,
		'',
		existing_bill.created_by,
		pg_catalog.now()
	);

	return updated_bill;
end;
$$;

revoke all on function public.mark_bill_paid_with_audit(uuid, text, text, text)
	from public, anon, authenticated;
grant execute on function public.mark_bill_paid_with_audit(uuid, text, text, text)
	to service_role;

commit;
