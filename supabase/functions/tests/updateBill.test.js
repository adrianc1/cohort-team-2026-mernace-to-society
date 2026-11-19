import { assertEquals } from 'jsr:@std/assert';
import { handleUpdateBill } from '../update-bill/handler.js';

const billId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const oldProperty = '33333333-3333-4333-8333-333333333333';
const newProperty = '44444444-4444-4444-8444-444444444444';
const valid = {
	id: billId,
	vendor_account_id: accountId,
	invoice_number: '123',
	amount: 100,
	issue_date: '2026-01-01',
	due_date: '2026-01-30',
};

function request(body = valid) {
	return new Request('http://localhost/update-bill', {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

function client({ billProperty = oldProperty, accountProperty = newProperty, updateData = { id: billId } } = {}) {
	const updates = [];
	const nullChecks = [];
	return {
		updates,
		nullChecks,
		from(table) {
			return {
				select() {
					return {
						eq() {
							if (table === 'vendor_account') {
								return { maybeSingle: async () => ({ data: { property_id: accountProperty }, error: null }) };
							}
							return { in: () => ({ maybeSingle: async () => ({ data: { property_id: billProperty }, error: null }) }) };
						},
					};
				},
				update(values) {
					updates.push(values);
					const query = {
						eq: () => query,
						in: () => query,
						is(column, value) {
							nullChecks.push([column, value]);
							return query;
						},
						select: () => ({ maybeSingle: async () => ({ data: updateData, error: null }) }),
					};
					return query;
				},
			};
		},
	};
}

Deno.test('editing an existing bill never replaces its property with the account property', async () => {
	const supabase = client();
	const response = await handleUpdateBill(request({ ...valid, property_id: newProperty }), supabase);
	assertEquals(response.status, 200);
	assertEquals('property_id' in supabase.updates[0], false);
	assertEquals(supabase.nullChecks, []);
});

Deno.test('a bill with no property gets the account property only while still unassigned', async () => {
	const supabase = client({ billProperty: null });
	const response = await handleUpdateBill(request(), supabase);
	assertEquals(response.status, 200);
	assertEquals(supabase.updates[0].property_id, newProperty);
	assertEquals(supabase.nullChecks, [['property_id', null]]);
});

Deno.test('an unfinished bill cannot be submitted without an account property', async () => {
	const supabase = client({ billProperty: null, accountProperty: null });
	const response = await handleUpdateBill(request(), supabase);
	assertEquals(response.status, 400);
	assertEquals(supabase.updates, []);
});

Deno.test('reports a conflict if an unassigned bill changes before the update', async () => {
	const supabase = client({ billProperty: null, updateData: null });
	const response = await handleUpdateBill(request(), supabase);
	assertEquals(response.status, 409);
	assertEquals(supabase.nullChecks, [['property_id', null]]);
});
