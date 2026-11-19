import { withSupabase } from 'jsr:@supabase/server@^1';
import { handleUpdateBill } from './handler.js';

export default {
	fetch: withSupabase({ auth: 'user' }, (req, { supabase }) =>
		handleUpdateBill(req, supabase)
	),
};
