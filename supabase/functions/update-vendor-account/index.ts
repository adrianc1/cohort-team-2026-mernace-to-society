import { withSupabase } from "jsr:@supabase/server@^1";
import { handleUpdateVendorAccount } from "./handler.ts";

export default {
	fetch: withSupabase({ auth: "user" }, (req, { supabase }) =>
		handleUpdateVendorAccount(req, supabase)
	),
};
