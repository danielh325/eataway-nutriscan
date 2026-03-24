-- Add missing UPDATE policy on meal_logs
CREATE POLICY "Users can update their own logs"
ON public.meal_logs
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Replace overly permissive INSERT on vendor_suggestions
DROP POLICY IF EXISTS "Anyone can insert vendor suggestions" ON public.vendor_suggestions;
CREATE POLICY "Authenticated users can insert vendor suggestions"
ON public.vendor_suggestions
FOR INSERT
TO authenticated
WITH CHECK (suggested_by = auth.uid() OR suggested_by IS NULL);