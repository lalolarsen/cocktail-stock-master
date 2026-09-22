ALTER TABLE public.pos_terminals
  ALTER COLUMN venue_id SET DEFAULT public.get_user_venue_id();

CREATE OR REPLACE FUNCTION public.set_pos_terminal_venue_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.venue_id IS NULL THEN
    NEW.venue_id := public.get_user_venue_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_pos_terminal_venue_id ON public.pos_terminals;
CREATE TRIGGER set_pos_terminal_venue_id
  BEFORE INSERT ON public.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION public.set_pos_terminal_venue_id();