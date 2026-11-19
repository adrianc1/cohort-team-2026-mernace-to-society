import { withSupabase } from 'jsr:@supabase/server@^1';
import { validateBill } from '../_shared/validateBill.js';

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNIQUE_VIOLATION = '23505';

export default {
	fetch: withSupabase({ auth: 'user' }, async (req, { supabase }) => {
		if (req.method !== 'PATCH') {
			return Response.json({ error: 'Method not allowed' }, { status: 405 });
		}

		let body;
		try {
			body = await req.json();
		} catch {
			return Response.json({ error: 'Invalid JSON' }, { status: 400 });
		}

		if (typeof body?.id !== 'string' || !UUID_RE.test(body.id)) {
			return Response.json({ error: 'Bill id is required' }, { status: 400 });
		}

		// Same rules as creating a bill, so an edit can't sneak in bad data
		const result = validateBill(body);
		if (!result.ok) {
			return Response.json({ error: result.error }, { status: 400 });
		}

		const { data: canEditBills, error: authorizationError } =
			await supabase.rpc('can_approve_bills');
		if (authorizationError) {
			console.error('Bill edit authorization check failed:', authorizationError);
			return Response.json(
				{ error: 'Could not verify bill edit permissions' },
				{ status: 500 },
			);
		}
		if (canEditBills !== true) {
			return Response.json(
				{ error: 'Only active managers and admins can edit bills' },
				{ status: 403 },
			);
		}

		// property_id comes from the vendor account, so the two can never disagree
		const { data: account, error: accountError } = await supabase
			.from('vendor_account')
			.select('property_id')
			.eq('id', result.value.vendor_account_id)
			.maybeSingle();

		if (accountError) {
			return Response.json({ error: accountError.message }, { status: 500 });
		}
		if (!account) {
			return Response.json(
				{ error: 'Vendor account not found' },
				{ status: 400 },
			);
		}

		// The database function locks and updates eligible bills while recording
		// the audit event in the same transaction.
		const { data, error } = await supabase.rpc('update_bill_with_audit', {
			p_bill_id: body.id,
			p_invoice_number: result.value.invoice_number,
			p_amount: result.value.amount,
			p_issue_date: result.value.issue_date,
			p_due_date: result.value.due_date,
			p_vendor_account_id: result.value.vendor_account_id,
			p_review_reason: result.value.review_reason,
			p_bill_url: result.value.bill_url ?? null,
			p_update_bill_url: Object.hasOwn(result.value, 'bill_url'),
		});

		if (error?.code === UNIQUE_VIOLATION) {
			return Response.json(
				{
					error: `Invoice ${result.value.invoice_number} was already entered for this account.`,
				},
				{ status: 409 },
			);
		}
		if (error) {
			if (error.code === '42501') {
				return Response.json(
					{ error: 'Only active managers and admins can edit bills' },
					{ status: 403 },
				);
			}
			if (error.code === 'P0002') {
				return Response.json(
					{ error: 'Bill was not found or is no longer pending' },
					{ status: 409 },
				);
			}
			if (error.code === '22023') {
				return Response.json({ error: error.message }, { status: 400 });
			}
			console.error('Atomic bill update failed:', error);
			return Response.json({ error: error.message }, { status: 500 });
		}

		return Response.json({ data });
	}),
};
