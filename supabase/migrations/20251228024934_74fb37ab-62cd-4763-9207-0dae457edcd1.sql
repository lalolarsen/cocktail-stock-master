-- Create login history table
CREATE TABLE public.login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all login history
CREATE POLICY "Admins can view all login history" 
ON public.login_history 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own login history
CREATE POLICY "Users can view their own login history" 
ON public.login_history 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow inserting login history (for the trigger)
CREATE POLICY "Allow insert login history" 
ON public.login_history 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_login_at ON public.login_history(login_at DESC);