import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
	validateAccountFields,
	validateAdditionalPropertyIds,
} from "../_shared/validateVendorAccount.js";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleUpdateVendorAccount(req: Request, supabase: SupabaseClient) {
	if (req.method !== "PUT") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	const { data: profiles, error: profileError } = await supabase.rpc(
		"get_current_user_profile",
	);
	if (profileError) {
		return Response.json({ error: profileError.message }, { status: 500 });
	}
	const { data: status, error: statusError } = await supabase.rpc(
		"get_current_user_status",
	);
	if (statusError) {
		return Response.json({ error: statusError.message }, { status: 500 });
	}
	if (status !== "active" || !["admin", "manager"].includes(profiles?.[0]?.role?.toLowerCase())) {
		return Response.json(
			{ error: "Only active managers and administrators can edit vendor accounts." },
			{ status: 403 },
		);
	}

	let body;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	if (!body || typeof body !== "object" || Array.isArray(body) ||
		typeof body.accountId !== "string" || !UUID_RE.test(body.accountId)) {
		return Response.json({ error: "A valid account ID is required." }, { status: 400 });
	}
	const fields = validateAccountFields(body.accountNumber, body.service);
	if (!fields.ok) return Response.json({ error: fields.error }, { status: 400 });
	if (body.propertyId !== undefined &&
		(typeof body.propertyId !== "string" || !UUID_RE.test(body.propertyId))) {
		return Response.json({ error: "A valid primary property is required." }, { status: 400 });
	}
	const properties = validateAdditionalPropertyIds(body.additionalPropertyIds, body.propertyId);
	if (!properties.ok) return Response.json({ error: properties.error }, { status: 400 });

	const { data, error } = await supabase
		.from("vendor_account")
		.update({
			...fields.value,
			...(body.propertyId !== undefined ? { property_id: body.propertyId } : {}),
			additional_property_ids: properties.value,
		})
		.eq("id", body.accountId)
		.select("id, account_number, service, property_id, additional_property_ids")
		.maybeSingle();

	if (error) {
		if (error.code === "23505") {
			return Response.json({ error: "This vendor already has an account with that number." }, { status: 409 });
		}
		if (["23503", "23514"].includes(error.code)) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		if (error.code === "42501") {
			return Response.json({ error: error.message }, { status: 403 });
		}
		return Response.json({ error: error.message }, { status: 500 });
	}
	if (!data) {
		return Response.json({ error: "Account not found or update not permitted." }, { status: 404 });
	}
	return Response.json({ data });
}
