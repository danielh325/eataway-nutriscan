CREATE TABLE public.vendor_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  cuisine TEXT,
  suggested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert vendor suggestions"
ON public.vendor_suggestions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can view own suggestions"
ON public.vendor_suggestions
FOR SELECT
TO authenticated
USING (suggested_by = auth.uid());