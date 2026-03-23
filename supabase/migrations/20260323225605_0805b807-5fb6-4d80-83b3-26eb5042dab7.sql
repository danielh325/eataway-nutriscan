
-- Table to cache Google Places photos for each vendor
CREATE TABLE public.place_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_name text UNIQUE NOT NULL,
  photo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow public read access (photos are public data)
ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read place photos"
  ON public.place_photos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can manage place photos"
  ON public.place_photos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Table for admin review status per vendor
CREATE TABLE public.admin_spot_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_name text UNIQUE NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_spot_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spot status"
  ON public.admin_spot_status FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can manage spot status"
  ON public.admin_spot_status FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
