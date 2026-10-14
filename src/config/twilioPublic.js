/**
 * Configuration Twilio côté client.
 * Les identifiants sont lus depuis les variables d'environnement.
 *
 * Attention : ne pas appeler directement l'API Twilio
 * avec un Auth Token depuis une application cliente.
 */

const fromEnv = (key) =>
  typeof process !== 'undefined' && process.env
    ? String(process.env[key] || '').trim()
    : '';

export const TWILIO_ACCOUNT_SID =
  fromEnv('EXPO_PUBLIC_TWILIO_ACCOUNT_SID');

export const TWILIO_AUTH_TOKEN =
  fromEnv('EXPO_PUBLIC_TWILIO_AUTH_TOKEN');

export const TWILIO_PHONE_FROM =
  fromEnv('EXPO_PUBLIC_TWILIO_PHONE_NUMBER');

export const INTERVENTION_SMS_TO =
  fromEnv('EXPO_PUBLIC_INTERVENTION_SMS_TO');

export function isTwilioConfigured() {
  return Boolean(
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_PHONE_FROM &&
    INTERVENTION_SMS_TO
  );
}