-- Allow edge functions (service role) to insert into notification_logs
-- Since edge functions use service role key, they bypass RLS
-- But we need to ensure the enqueue function can insert
CREATE POLICY "Allow insert for service role and enqueue function" ON public.notification_logs
  FOR INSERT WITH CHECK (true);

-- Allow updates only for status changes (sent/failed) from queued
CREATE POLICY "Allow status updates" ON public.notification_logs
  FOR UPDATE USING (has_role(auth.uid(), 'admin') OR status = 'queued');