-- Enable realtime for jornadas table so vendedor can see jornada changes instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.jornadas;