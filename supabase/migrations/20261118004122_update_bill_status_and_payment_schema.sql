-- 1. Drop the old restrictive policy on the bill table
DROP POLICY IF EXISTS "Users can update pending bills" ON "public"."bill";

-- 2. Create an updated policy allowing updates for processing, review, pending, approved, and paid statuses
CREATE POLICY "Users can update active and approved bills" ON "public"."bill"
FOR UPDATE 
TO authenticated
USING (
  status = ANY (ARRAY['processing'::text, 'extraction_failed'::text, 'needs_review'::text, 'pending'::text, 'approved'::text, 'paid'::text])
)
WITH CHECK (
  status = ANY (ARRAY['processing'::text, 'extraction_failed'::text, 'needs_review'::text, 'pending'::text, 'approved'::text, 'paid'::text])
);

-- 3. (Optional safeguard) Give the payment method column a default empty array if not already set
ALTER TABLE "public"."payment" ALTER COLUMN "method" SET DEFAULT ARRAY[]::text[];