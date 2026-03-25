
CREATE TABLE public.vendor_menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_name TEXT NOT NULL,
  dish_name TEXT NOT NULL,
  description TEXT,
  price TEXT,
  category TEXT DEFAULT 'Main',
  image_url TEXT,
  calories_kcal INTEGER NOT NULL DEFAULT 0,
  protein_g INTEGER NOT NULL DEFAULT 0,
  carbs_g INTEGER NOT NULL DEFAULT 0,
  fat_g INTEGER NOT NULL DEFAULT 0,
  fiber_g INTEGER DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'medium',
  ingredients JSONB,
  is_popular BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast vendor lookups
CREATE INDEX idx_vendor_menu_items_spot_name ON public.vendor_menu_items(spot_name);

-- Anyone can read menu items (public data)
ALTER TABLE public.vendor_menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read menu items" ON public.vendor_menu_items
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Service role can manage menu items" ON public.vendor_menu_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins can manage menu items" ON public.vendor_menu_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
