import { withSupabase } from "jsr:@supabase/server@^1";

export default {
	fetch: withSupabase({ auth: "user" }, async (req, { supabase }) => {
		if (req.method !== "PUT") {
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

		const { accountId, accountNumber, service, propertyIds } = body ?? {};

		if (!accountId) {
			return Response.json(
				{ error: "Account ID is required" },
				{ status: 400 },
			);
		}

		if (!accountNumber || !service) {
			return Response.json(
				{ error: "Account number and service are required" },
				{ status: 400 },
			);
		}

		if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
			return Response.json(
				{ error: "At least one property must be selected" },
				{ status: 400 },
			);
		}

		try {
			// Update the vendor account
			const { error: updateError } = await supabase
				.from("vendor_account")
				.update({
					account_number: accountNumber.trim(),
					service: service.trim(),
				})
				.eq("id", accountId);

			if (updateError) {
				throw updateError;
			}

			// Delete existing property associations
			const { error: deleteError } = await supabase
				.from("vendor_account_property")
				.delete()
				.eq("vendor_account_id", accountId);

			if (deleteError) {
				throw deleteError;
			}

			// Insert new property associations
			const propertyRecords = propertyIds.map((propertyId) => ({
				vendor_account_id: accountId,
				property_id: propertyId,
			}));

			const { error: insertError } = await supabase
				.from("vendor_account_property")
				.insert(propertyRecords);

			if (insertError) {
				throw insertError;
			}

			return Response.json({ success: true });
		} catch (err) {
			console.error("Update vendor account error:", err);
			return Response.json(
				{ error: err instanceof Error ? err.message : "Failed to update account" },
				{ status: 500 },
			);
		}
	}),
};
