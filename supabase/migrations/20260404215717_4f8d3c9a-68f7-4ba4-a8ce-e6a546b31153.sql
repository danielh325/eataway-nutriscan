-- Drop the overly permissive anonymous upload policy
DROP POLICY IF EXISTS "Anyone can upload menu images" ON storage.objects;

-- Create a new INSERT policy for authenticated users only
CREATE POLICY "Authenticated users can upload menu images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'menu-uploads');

-- Add UPDATE policy for admins only
CREATE POLICY "Admins can update menu uploads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'menu-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Add DELETE policy for admins only
CREATE POLICY "Admins can delete menu uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'menu-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));
