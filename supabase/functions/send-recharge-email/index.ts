// Supabase Edge Function: send-recharge-email
// Sends an email via Resend to the "to" address.
// Deploy:
//   supabase functions deploy send-recharge-email
// Set secrets:
//   supabase secrets set RESEND_API_KEY=your_key
//   supabase secrets set EMAIL_FROM="AdBot <onboarding@resend.dev>"   (or your verified domain)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { to, subject, message } = await req.json();

    if (!to || typeof to !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing "to"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM = Deno.env.get('EMAIL_FROM') ?? 'AdBot <onboarding@resend.dev>';

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            'RESEND_API_KEY is not set. Run: supabase secrets set RESEND_API_KEY=... ',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = {
      from: FROM,
      to: [to],
      subject: subject ?? 'AdBot — Notification',
      text:
        message ??
        'Veuillez recharger la batterie de votre robot AdBot R1.\n\nAction requise : branchez le robot au chargeur.',
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: 'Resend error', details: errText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const json = await resp.json();
    return new Response(JSON.stringify({ ok: true, id: json?.id ?? null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
