begin;

create function public.get_bill_audit_history(p_bill_id uuid)
returns table (
	id uuid,
	bill_id uuid,
	action text,
	from_status text,
	to_status text,
	note text,
	details jsonb,
	created_at timestamptz,
	actor_name text
)
language sql
stable
security definer
set search_path to ''
as $$
	select
		history.id,
		history.bill_id,
		history.action,
		history.from_status,
		history.to_status,
		history.note,
		history.details,
		history.created_at,
		actor.name as actor_name
	from public.audit_trail as history
	left join public."user" as actor on actor.id = history.user_id
	where history.bill_id = p_bill_id
		and auth.uid() is not null
		and public.is_current_user_active()
		and exists (
			select 1
			from public.bill as bill
			where bill.id = p_bill_id
		)
	order by history.created_at desc;
$$;

revoke all on function public.get_bill_audit_history(uuid) from public, anon;
grant execute on function public.get_bill_audit_history(uuid) to authenticated;

commit;
