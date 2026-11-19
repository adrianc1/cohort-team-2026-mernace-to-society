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

    const { data: { user } } = await supabase.auth.getUser();

    // 1. Fetch bill record
    const { data: bill, error: billError } = await supabase
      .from('bill')
      .select('id, amount, status, bill_url')
      .eq('id', billId)
      .single();

    if (billError || !bill) {
      return Response.json({ error: 'Bill not found' }, { status: 404 });
    }

    if (bill.status !== 'approved') {
      return Response.json({ error: 'Bill must be approved before payment.' }, { status: 400 });
    }

    // 2. Stagehand Automation & Receipt PDF Extraction Hook
    let confirmationNumber = `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    let receiptStoragePath = null;

    /* 
      --- Stagehand Worker Implementation Example ---
      const stagehand = new Stagehand({ env: "LOCAL" });
      await stagehand.init();
      await stagehand.page.goto(bill.bill_url);
      
      // Execute payment on vendor portal
      await stagehand.page.act("Complete the payment on the portal");
      
      // Extract confirmation number text
      confirmationNumber = await stagehand.page.extract("Extract the payment confirmation number");
      
      // Locate and click the PDF receipt download link
      const receiptDownloadLink = await stagehand.page.extract("Extract the direct PDF download link or URL for the receipt");
      
      if (receiptDownloadLink) {
        const pdfResponse = await fetch(receiptDownloadLink);
        const pdfBlob = await pdfResponse.blob();
        const fileName = `receipt-${bill.id}-${Date.now()}.pdf`;
        
        // Upload to your private 'receipts' bucket
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, pdfBlob, { contentType: 'application/pdf' });
          
        if (!uploadError && uploadData) {
          // Store the relative storage path for secure signed URL generation
          receiptStoragePath = uploadData.path; 
        }
      }
      await stagehand.close();
    */

    // 3. Insert payment record with receipt storage path
    const { error: paymentError } = await supabase
      .from('payment')
      .insert({
        bill_id: bill.id,
        amount: bill.amount,
        status: 'success',
        method: ['ach'],
        confirmation_number: confirmationNumber,
        failure_reason: '',
        receipt_url: receiptStoragePath, // Stores the private bucket file path
        attempted_at: new Date().toISOString(),
        attempted_by: user?.id,
        updated_at: new Date().toISOString(),
      });

    if (paymentError) {
      console.error('Payment insert error:', paymentError);
      return Response.json({ error: paymentError.message }, { status: 500 });
    }

    // 4. Update bill status to 'paid'
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

    return Response.json({ success: true, confirmationNumber, receiptStoragePath }, { status: 200 });
  }),
};