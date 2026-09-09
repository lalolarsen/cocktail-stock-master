import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type SuppressionReason = 'bounce' | 'complaint' | 'unsubscribe'
type LogStatus = 'bounced' | 'complained' | 'suppressed'

async function record(
  eventId: string,
  recipient: string,
  reason: SuppressionReason,
  logStatus: LogStatus,
  description: string,
) {
  const email = recipient.toLowerCase()

  const { error: suppressionError } = await supabase
    .from('suppressed_emails')
    .upsert(
      { email, reason, metadata: null },
      { onConflict: 'email' },
    )
  if (suppressionError) {
    console.error('Failed to upsert suppressed_emails', {
      event_id: eventId,
      code: suppressionError.code,
      message: suppressionError.message,
    })
    throw new Error('suppressed_emails write failed')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: description,
  })
  if (logError) {
    console.error('Failed to insert email_send_log', {
      event_id: eventId,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('email_send_log write failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'bounce',
        'bounced',
        'Email bounced (hard bounce reported by provider)',
      )
    },
    'email.complaint': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'complaint',
        'complained',
        'Recipient marked the email as spam',
      )
    },
    'email.unsubscribed': async (event) => {
      await record(
        event.event_id,
        event.data.recipient,
        'unsubscribe',
        'suppressed',
        'Recipient unsubscribed from emails',
      )
    },
  },
})

Deno.serve((req) => handler(req))
