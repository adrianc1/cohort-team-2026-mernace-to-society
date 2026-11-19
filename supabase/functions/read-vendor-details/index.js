import { withSupabase } from "jsr:@supabase/server@^1";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {
	fetch: withSupabase({ auth: "user" }, async (req, { supabase }) => {
		if (req.method !== "POST") {
			return Response.json(
				{ error: "Method not allowed" },
				{ status: 405 },
			);
		}

		let body;
		try {
			body = await req.json();
		} catch {
			return Response.json(
				{ error: "Invalid JSON" },
				{ status: 400 },
			);
		}

		const { vendorId } = body ?? {};
		if (typeof vendorId !== "string" || !UUID_RE.test(vendorId)) {
			return Response.json(
				{ error: "Vendor ID is required and must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { data, error } = await supabase
			.from("vendor")
			.select(`
				id,
				name,
				aliases,
				portal_url,
				status,
				email,
				phone_number,
				vendor_account (
					id,
					account_number,
					service,
					payment_type,
					status,
					property_id,
					additional_property_ids,
					vendor_id,
					property(name)
				)
			`)
			.eq("id", vendorId)
			.maybeSingle();

		if (error) {
			return Response.json(
				{ error: error.message },
				{ status: 500 },
			);
		}

		if (!data) {
			return Response.json(
				{ error: "Vendor not found" },
				{ status: 404 },
			);
		}

		const { vendor_account: accounts = [], ...vendor } = data;
		const propertyIds = [...new Set(
			accounts.flatMap((account) => account.additional_property_ids),
		)];
		let properties = [];
		if (propertyIds.length > 0) {
			const { data: additionalProperties, error: propertyError } = await supabase
				.from("property")
				.select("id, name")
				.in("id", propertyIds);
			if (propertyError) {
				return Response.json({ error: propertyError.message }, { status: 500 });
			}
			properties = additionalProperties;
		}
		const propertyNames = new Map(properties.map((property) => [property.id, property.name]));
		return Response.json({
			vendor,
			accounts: accounts.map((account) => ({
				...account,
				additional_properties: account.additional_property_ids.map((id) => ({
					id,
					name: propertyNames.get(id) ?? null,
				})),
			})),
		});
	}),
};
