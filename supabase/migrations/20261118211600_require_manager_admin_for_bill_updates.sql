begin;

-- Replace the active bill UPDATE policy while retaining its status restrictions.
drop policy if exists "Users can update pending bills" on public.bill;
drop policy if exists "Users can update active and approved bills" on public.bill;

create policy "Users can update active and approved bills"
on public.bill for update
to authenticated
using (
	public.can_approve_bills()
	and status = any (
		array[
			'processing'::text,
			'extraction_failed'::text,
			'needs_review'::text,
			'pending'::text
		]
	)
)
with check (
	public.can_approve_bills()
	and status = any (
		array[
			'processing'::text,
			'extraction_failed'::text,
			'needs_review'::text,
			'pending'::text
		]
	)
);

commit;
