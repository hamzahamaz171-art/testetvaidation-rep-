import { Buffer } from 'buffer';
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_FROM,
  INTERVENTION_SMS_TO,
  isTwilioConfigured,
} from '../config/twilioPublic';

function basicAuthHeader(accountSid, authToken) {
  const raw = `${accountSid}:${authToken}`;
  if (typeof globalThis.btoa === 'function') {
    return `Basic ${globalThis.btoa(raw)}`;
  }
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

/**
 * Envoie un SMS via l’API REST Twilio (depuis l’app, sans backend).
 * @returns {{ ok: true, sid?: string } | { ok: false, error: string, details?: string }}
 */
export async function sendInterventionSmsClient({
  robotName,
  location,
  contactPhone,
  temperatureC,
  alertTitle,
}) {
  if (!isTwilioConfigured()) {
    return {
      ok: false,
      error:
        'Twilio non configuré. Renseigne src/config/twilioPublic.js ou les variables EXPO_PUBLIC_TWILIO_* dans .env',
    };
  }

  const tempPart =
    temperatureC != null && Number.isFinite(Number(temperatureC))
      ? `Temp: ${Math.round(Number(temperatureC))}°C. `
      : '';
  const titlePart = alertTitle?.trim() ? `${alertTitle.trim()}. ` : '';

  const bodyText =
    `[AdBot] Intervention sur place\n` +
    `${titlePart}${tempPart}` +
    `Robot: ${robotName || 'Robot'}\n` +
    `Lieu: ${location}\n` +
    `N° contact: ${contactPhone}`.slice(0, 1500);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams();
  form.set('From', TWILIO_PHONE_FROM);
  form.set('To', INTERVENTION_SMS_TO);
  form.set('Body', bodyText);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const text = await resp.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: json?.message || `Twilio HTTP ${resp.status}`,
        details: text?.slice(0, 500),
      };
    }

    return { ok: true, sid: json?.sid ?? null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
