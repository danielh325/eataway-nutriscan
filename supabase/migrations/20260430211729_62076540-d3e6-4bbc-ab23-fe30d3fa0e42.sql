
-- 1. Restrict has_role() execution to authenticated/service roles (revoke from anon, public)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- handle_new_user is a trigger function on auth.users; revoke direct execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Protect phone numbers in vendor_suggestions
-- Drop existing user-can-view-own policy and re-create a column-safe view
-- We keep the row-level select for user's own suggestions (they submitted them, so they know their own phone)
-- but ensure no anon/auth user can read OTHER users' phones. The current policies already enforce this.
-- Add an explicit comment + ensure no anon path leaks phone:
-- The "Anyone can read approved suggestions" policy currently exposes phone of approved vendors to anon.
-- Restrict that policy to non-PII columns by replacing with a view.

DROP POLICY IF EXISTS "Anyone can read approved suggestions" ON public.vendor_suggestions;

-- Re-create policy WITHOUT exposing phone for anonymous reads — we'll move public reads to a sanitized view.
CREATE OR REPLACE VIEW public.vendor_suggestions_public
WITH (security_invoker = true) AS
SELECT
  id, name, address, cuisine, status, created_at,
  lat, lng, categories, rating, place_id, image, hours,
  price_range, description, review_count, verified, menu_image_url
FROM public.vendor_suggestions
WHERE status = 'approved';

GRANT SELECT ON public.vendor_suggestions_public TO anon, authenticated;

-- Restore an authenticated-only narrow read for approved suggestions on the base table for backwards compat,
-- but EXCLUDE phone by relying on app code to use the view. Add policy so authenticated users can still read approved.
CREATE POLICY "Authenticated can read approved suggestions"
  ON public.vendor_suggestions
  FOR SELECT
  TO authenticated
  USING (status = 'approved');

-- 3. Lock down menu-uploads bucket — make it private and admin-only writes
UPDATE storage.buckets SET public = false WHERE id = 'menu-uploads';

DROP POLICY IF EXISTS "Anyone can read menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload menu images" ON storage.objects;

CREATE POLICY "Admins can read menu uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'menu-uploads' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can upload menu images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-uploads' AND has_role(auth.uid(), 'admin'::app_role));
