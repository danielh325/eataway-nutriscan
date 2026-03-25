-- Add columns to vendor_suggestions for verified data
ALTER TABLE public.vendor_suggestions 
ADD COLUMN IF NOT EXISTS lat double precision,
ADD COLUMN IF NOT EXISTS lng double precision,
ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rating numeric,
ADD COLUMN IF NOT EXISTS place_id text,
ADD COLUMN IF NOT EXISTS image text,
ADD COLUMN IF NOT EXISTS hours text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS price_range text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS menu_image_url text;

-- Allow anon to read approved suggestions
CREATE POLICY "Anyone can read approved suggestions"
ON public.vendor_suggestions
FOR SELECT
TO anon
USING (status = 'approved');

-- Allow admins full access to vendor suggestions
CREATE POLICY "Admins can manage vendor suggestions"
ON public.vendor_suggestions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for menu uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-uploads', 'menu-uploads', true);

-- Allow anyone to upload to menu-uploads bucket
CREATE POLICY "Anyone can upload menu images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'menu-uploads');

-- Allow anyone to read from menu-uploads bucket
CREATE POLICY "Anyone can read menu images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'menu-uploads');