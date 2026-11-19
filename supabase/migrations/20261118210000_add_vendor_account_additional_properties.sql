begin;

alter table public.vendor_account
	add column additional_property_ids uuid[] not null default '{}';

do $$
begin
	if exists (
		select 1
		from public.vendor_account_property as link
		join public.vendor_account as account on account.id = link.vendor_account_id
		where account.property_id is null
	) then
		raise exception 'A vendor account has linked properties but no primary property.';
	end if;
end;
$$;

update public.vendor_account as account
set additional_property_ids = links.property_ids
from (
	select link.vendor_account_id,
		array_agg(link.property_id order by link.property_id) as property_ids
	from public.vendor_account_property as link
	join public.vendor_account as account on account.id = link.vendor_account_id
	where link.property_id is distinct from account.property_id
	group by link.vendor_account_id
) as links
where account.id = links.vendor_account_id;

create function public.validate_vendor_account_additional_properties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	property_count integer;
begin
	if (tg_op = 'INSERT' and cardinality(new.additional_property_ids) > 0)
		or (tg_op = 'UPDATE' and new.additional_property_ids is distinct from old.additional_property_ids)
	then
		if auth.role() in ('authenticated', 'anon') and not exists (
			select 1 from public."user" as app_user
			where app_user.id = auth.uid()
				and app_user.status = 'active'
				and lower(app_user.role) in ('manager', 'admin')
		) then
			raise exception using errcode = '42501',
				message = 'Only active managers and administrators can change additional properties.';
		end if;
	end if;

	if cardinality(new.additional_property_ids) = 0 then
		return new;
	end if;
	if new.property_id is null
		or array_position(new.additional_property_ids, null) is not null
		or new.property_id = any(new.additional_property_ids)
		or cardinality(new.additional_property_ids) <> (
			select count(distinct property_id)
			from unnest(new.additional_property_ids) as property_id
		)
	then
		raise exception using errcode = '23514',
			message = 'Additional properties must be unique and different from the primary property.';
	end if;

	perform id from public.property
	where id = any(new.additional_property_ids)
	order by id
	for key share;
	get diagnostics property_count = row_count;
	if property_count <> cardinality(new.additional_property_ids) then
		raise exception using errcode = '23503',
			message = 'An additional property was not found.';
	end if;
	return new;
end;
$$;

revoke all on function public.validate_vendor_account_additional_properties()
	from public, anon, authenticated;

create trigger validate_vendor_account_additional_properties
	before insert or update of property_id, additional_property_ids
	on public.vendor_account
	for each row execute function public.validate_vendor_account_additional_properties();

create function public.prevent_deleting_additional_vendor_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if exists (
		select 1 from public.vendor_account
		where old.id = any(additional_property_ids)
	) then
		raise exception using errcode = '23503',
			message = 'Remove this property from vendor accounts before deleting it.';
	end if;
	return old;
end;
$$;

revoke all on function public.prevent_deleting_additional_vendor_property()
	from public, anon, authenticated;

create trigger prevent_deleting_additional_vendor_property
	before delete on public.property
	for each row execute function public.prevent_deleting_additional_vendor_property();

commit;
