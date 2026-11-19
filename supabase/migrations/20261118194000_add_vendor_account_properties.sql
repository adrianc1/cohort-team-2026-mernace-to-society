-- Create junction table for vendor_account to support multiple properties
CREATE TABLE public.vendor_account_property (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_account_id uuid NOT NULL REFERENCES public.vendor_account(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.property(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(vendor_account_id, property_id)
)
-- Create index for faster queries
CREATE INDEX vendor_account_property_account_id_idx ON public.vendor_account_property(vendor_account_id)
CREATE INDEX vendor_account_property_property_id_idx ON public.vendor_account_property(property_id)
-- Migrate existing property_id values to junction table
INSERT INTO public.vendor_account_property (vendor_account_id, property_id)
SELECT id, property_id FROM public.vendor_account WHERE property_id IS NOT NULL
ON CONFLICT DO NOTHING
-- Make property_id nullable since we're using the junction table now
ALTER TABLE public.vendor_account ALTER COLUMN property_id DROP NOT NULL
-- Add RLS policies
CREATE POLICY "vendor_account_property_select_policy"
ON public.vendor_account_property
FOR SELECT
TO authenticated
USING (true)
CREATE POLICY "vendor_account_property_insert_policy"
ON public.vendor_account_property
FOR INSERT
TO authenticated
WITH CHECK (true)
CREATE POLICY "vendor_account_property_delete_policy"
ON public.vendor_account_property
FOR DELETE
TO authenticated
USING (true)
CREATE POLICY "vendor_account_property_update_policy"
ON public.vendor_account_property
FOR UPDATE
TO authenticated
USING (true)