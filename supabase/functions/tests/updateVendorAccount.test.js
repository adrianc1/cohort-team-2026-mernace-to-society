import { assertEquals } from 'jsr:@std/assert';
import { handleUpdateVendorAccount } from '../update-vendor-account/handler.ts';

const accountId = '55555555-5555-4555-8555-555555555555';
const propertyId = '22222222-2222-4222-8222-222222222222';
const primaryId = '11111111-1111-4111-8111-111111111111';
const valid = {
	accountId,
	accountNumber: ' 123 ',
	service: ' Electric ',
	additionalPropertyIds: [propertyId],
};

function request(body = valid, method = 'PUT') {
	return new Request('http://localhost/update-vendor-account', {
		method,
		body: JSON.stringify(body),
	});
}

function client({ role = 'manager', status = 'active', id = accountId, data = { id }, error = null } = {}) {
	const updates = [];
	return {
		updates,
		rpc(name) {
			return Promise.resolve({
				data: name === 'get_current_user_profile' ? [{ role }] : status,
				error: null,
			});
		},
		from(table) {
			assertEquals(table, 'vendor_account');
			return {
				update(values) {
					updates.push(values);
					return {
						eq(column, value) {
							assertEquals([column, value], ['id', id]);
							return { select: () => ({ maybeSingle: () => Promise.resolve({ data, error }) }) };
						},
					};
				},
			};
		},
	};
}

Deno.test('updates account details and additional properties together', async () => {
	const supabase = client();
	const response = await handleUpdateVendorAccount(request(), supabase);
	assertEquals(response.status, 200);
	assertEquals(supabase.updates, [{
		account_number: '123',
		service: 'Electric',
		additional_property_ids: [propertyId],
	}]);
});

Deno.test('updates the primary property together with account details', async () => {
	const supabase = client();
	const response = await handleUpdateVendorAccount(request({ ...valid, propertyId: primaryId }), supabase);
	assertEquals(response.status, 200);
	assertEquals(supabase.updates, [{
		account_number: '123',
		service: 'Electric',
		property_id: primaryId,
		additional_property_ids: [propertyId],
	}]);
});

Deno.test('rejects invalid primary properties and duplicates in additional properties', async () => {
	for (const propertyIdValue of ['', 'bad', null, propertyId]) {
		const supabase = client();
		const response = await handleUpdateVendorAccount(request({ ...valid, propertyId: propertyIdValue }), supabase);
		assertEquals(response.status, 400);
		assertEquals(supabase.updates, []);
	}
});

Deno.test('accepts valid account IDs regardless of UUID version', async () => {
	const id = '55555555-5555-1555-8555-555555555555';
	const supabase = client({ id });
	assertEquals((await handleUpdateVendorAccount(request({ ...valid, accountId: id }), supabase)).status, 200);
});

Deno.test('denies staff and inactive managers before updating', async () => {
	for (const permissions of [{ role: 'staff' }, { status: 'inactive' }]) {
		const supabase = client(permissions);
		assertEquals((await handleUpdateVendorAccount(request(), supabase)).status, 403);
		assertEquals(supabase.updates, []);
	}
});

Deno.test('rejects invalid IDs and unsupported methods', async () => {
	const supabase = client();
	assertEquals((await handleUpdateVendorAccount(request({ ...valid, accountId: '123' }), supabase)).status, 400);
	assertEquals((await handleUpdateVendorAccount(request({ ...valid, additionalPropertyIds: ['bad'] }), supabase)).status, 400);
	assertEquals((await handleUpdateVendorAccount(request(valid, 'POST'), supabase)).status, 405);
	assertEquals(supabase.updates, []);
});

Deno.test('reports missing accounts and invalid property references', async () => {
	assertEquals((await handleUpdateVendorAccount(request(), client({ data: null }))).status, 404);
	const response = await handleUpdateVendorAccount(request(), client({
		error: { code: '23503', message: 'An additional property was not found.' },
	}));
	assertEquals(response.status, 400);
	assertEquals((await response.json()).error, 'An additional property was not found.');
});
