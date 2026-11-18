const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns an error string, or null if the value is a real YYYY-MM-DD date
export function checkDate(value, label) {
	if (typeof value !== 'string' || !DATE_RE.test(value)) {
		return `${label} must be YYYY-MM-DD`;
	}
	// Catches dates that match the pattern but don't exist, like 2026-02-30
	const parsed = new Date(`${value}T00:00:00Z`);
	if (
		isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== value
	) {
		return `${label} is not a real date`;
	}
	return null;
}

export function validateBill(body) {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return { ok: false, error: 'Body must be an object' };
	}

	// Only these fields are read. Anything else in the body is ignored. We can always add more!
	// property_id isn't read either: the edge function looks it up from the vendor account.
	const {
		invoice_number,
		amount,
		issue_date,
		due_date,
		vendor_account_id,
		review_reason,
		bill_url,
	} = body;

	if (review_reason != null && typeof review_reason !== 'string') {
		return { ok: false, error: 'Review reason must be text' };
	}
	const normalizedReviewReason =
		typeof review_reason === 'string' ? review_reason.trim() : null;
	if (normalizedReviewReason && normalizedReviewReason.length > 2000) {
		return {
			ok: false,
			error: 'Review reason must be 2000 characters or less',
		};
	}

	if (typeof invoice_number !== 'string' || invoice_number.trim().length === 0) {
		return { ok: false, error: 'Invoice number is required' };
	}
	if (invoice_number.trim().length > 50) {
		return { ok: false, error: 'Invoice number must be 50 characters or less' };
	}

	if (typeof amount !== 'number' || !Number.isFinite(amount)) {
		return { ok: false, error: 'Amount must be a number' };
	}
	const rounded = Math.round(amount * 100) / 100;
	if (rounded <= 0) {
		return { ok: false, error: 'Amount must be greater than 0' };
	}
	if (rounded > 1000000) {
		return { ok: false, error: 'Amount is too large' };
	}

	const issueDateError = checkDate(issue_date, 'Issue date');
	if (issueDateError) {
		return { ok: false, error: issueDateError };
	}
	const dueDateError = checkDate(due_date, 'Due date');
	if (dueDateError) {
		return { ok: false, error: dueDateError };
	}
	// Same-format date strings compare correctly as plain strings
	if (due_date < issue_date) {
		return { ok: false, error: 'Due date cannot be before issue date' };
	}

	if (
		typeof vendor_account_id !== 'string' ||
		!UUID_RE.test(vendor_account_id)
	) {
		return { ok: false, error: 'Vendor account is required' };
	}

	// bill_url is optional. Three scenarios:
	// - The request has no bill_url -> keep the server's saved URL
	// - bill_url is empty '' or null -> the user deleted it so delete it on the server side as well
	// - bill_url has a value -> it needs to be a valid http(s) link, so we run the same check as vendor portal_url
	let billUrl;
	if (bill_url === null || (typeof bill_url === 'string' && bill_url.trim() === '')) {
		billUrl = null;
	} else if (bill_url !== undefined) {
		if (typeof bill_url !== 'string' || bill_url.trim().length > 2048) {
			return { ok: false, error: 'Bill URL must be text, 2048 characters or less' };
		}
		let parsed;
		try {
			parsed = new URL(bill_url.trim());
		} catch {
			return { ok: false, error: 'Bill URL is not a valid URL' };
		}
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			return { ok: false, error: 'Bill URL must start with http:// or https://' };
		}
		billUrl = parsed.href;
	}

	return {
		ok: true,
		value: {
			invoice_number: invoice_number.trim(),
			amount: rounded,
			issue_date,
			due_date,
			vendor_account_id,
			review_reason: normalizedReviewReason || null,
			...(billUrl !== undefined && { bill_url: billUrl }),
		},
	};
}
