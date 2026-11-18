-- 1. Create the 'bills' bucket (Publicly accessible for viewing original invoice PDFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bills', 'bills', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create the 'receipts' bucket (Private, accessed only via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Optional: Add security policies for the 'bills' bucket
-- Allow authenticated users to upload and view bills
CREATE POLICY "Allow public read access on bills"
ON storage.objects FOR SELECT
USING (bucket_id = 'bills');

CREATE POLICY "Allow authenticated upload on bills"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bills');

-- 4. Add security policies for the 'receipts' bucket
-- Allow service role / authenticated workers to upload receipts, and users to read via signed URLs
CREATE POLICY "Allow service role upload on receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow read access on receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');