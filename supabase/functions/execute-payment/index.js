import { withSupabase } from 'jsr:@supabase/server@^1';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, { supabase }) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { billId } = body;
    if (!billId) {
      return Response.json({ error: 'billId is required' }, { status: 400 });
    }

    // Get the authenticated user ID for auditing
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Fetch the bill record
    const { data: bill, error: billError } = await supabase
      .from('bill')
      .select('id, amount, status')
      .eq('id', billId)
      .single();

    if (billError || !bill) {
      return Response.json({ error: 'Bill not found' }, { status: 404 });
    }

    if (bill.status !== 'approved') {
      return Response.json({ error: 'Bill must be approved before payment.' }, { status: 400 });
    }

    // 2. Generate confirmation number and insert payment record (including failure_reason)
    const confirmationNumber = `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const { error: paymentError } = await supabase
      .from('payment')
      .insert({
        bill_id: bill.id,
        amount: bill.amount,
        status: 'success',
        method: ['ach'],
        confirmation_number: confirmationNumber,
        failure_reason: '', // Satisfies the not-null constraint for successful payments
        attempted_at: new Date().toISOString(),
        attempted_by: user?.id,
        updated_at: new Date().toISOString(),
      });

    if (paymentError) {
      console.error('Payment insert error:', paymentError);
      return Response.json({ error: paymentError.message }, { status: 500 });
    }

    // 3. Update the bill status to 'paid'
    const { error: updateError } = await supabase
      .from('bill')
      .update({
        status: 'paid',
        paid_on: new Date().toISOString().split('T')[0],
      })
      .eq('id', bill.id);

    if (updateError) {
      console.error('Bill update error:', updateError);
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true, confirmationNumber }, { status: 200 });
  }),
};