# send-recharge-email (Supabase Edge Function)

Cette fonction envoie un email **automatiquement** au compte connecté (ex: hamzahacker616@gmail.com).

## 1) Pré-requis
- Installer Supabase CLI
- Avoir un provider d'envoi email (ex: **Resend**)

## 2) Secrets
Dans un terminal (à la racine du projet):

```bash
supabase secrets set RESEND_API_KEY=YOUR_RESEND_KEY
supabase secrets set EMAIL_FROM="AdBot <onboarding@resend.dev>"
```

> IMPORTANT: pour envoyer vers Gmail, Resend doit avoir un `from` valide.
> Le domaine doit être vérifié si vous utilisez votre propre domaine.

## 3) Déployer

```bash
supabase functions deploy send-recharge-email
```

## 4) Test
Quand vous cliquez **RECHARGER** dans l'app, la fonction est appelée:
- elle récupère l'email du user connecté via `supabase.auth.getUser()`
- elle envoie le mail via Resend
