-- Allow authenticated users to insert payment records
CREATE POLICY "Logged-in users can insert payments" ON "public"."payment"
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to view payment receipts
CREATE POLICY "Logged-in users can read payments" ON "public"."payment"
FOR SELECT 
TO authenticated 
USING (true);