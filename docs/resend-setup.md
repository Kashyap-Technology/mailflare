# Resend outbound mail

Mailflare sends outbound mail through Resend's HTTPS API. Cloudflare Email Routing
still handles incoming mail. No Cloudflare Email Sending entitlement or verified
Cloudflare destination address is needed for outbound mail.

## Configure your account

1. Add the domain used in your mailbox's **From** address to Resend. For example,
   `admin@kashyapadvisors.com` needs `kashyapadvisors.com` verified, regardless of
   whether the app is hosted at `mail.kashyapadvisors.com`.
2. Add Resend's sending DNS records and wait for verification. Keep Cloudflare's
   incoming-mail MX records. Do not enable Resend receiving for the same domain.
3. Create a Resend API key and add it as the deployed Worker's `RESEND_API_KEY`
   secret. A sending-only key works; a full-access key also permits the immediate
   Message-ID lookup. Never commit the key or paste it into a PR.
4. Set the Worker variable `RESEND_SENDING_DOMAINS` to a comma-separated list of
   exact domains you have verified, such as `kashyapadvisors.com`. Subdomains are
   separate entries. This is the app's configured sender allowlist, not an
   automatic DNS verification check; Resend still validates every send.
5. In Resend, register `https://mail.kashyapadvisors.com/api/resend/webhook` for
   `email.sent`. Add its signing secret as `RESEND_WEBHOOK_SECRET` in the Worker.
   Use your actual app hostname if it differs. This lets inbound replies find
   their original Sent message even when the immediate Message-ID lookup is
   unavailable. System notifications without a stored Sent copy are ignored.
6. Deploy the branch with `npm run deploy:worker` (or `npm run deploy` if database
   migrations are needed), then send to an inbox you control to check delivery.

The secrets can also be entered securely with `npx wrangler secret put
RESEND_API_KEY` and `npx wrangler secret put RESEND_WEBHOOK_SECRET`. Use the
Cloudflare dashboard for the non-secret `RESEND_SENDING_DOMAINS` variable. For
local development, copy the placeholders from `.dev.vars.example` into
`.dev.vars` and replace them locally.

## Behavior

- Normal sends, API sends, scheduled sends, automatic replies, and password resets
  use Resend. Sending never falls back to Cloudflare.
- D1 message storage, mailbox permissions, Sent history, R2 attachments, contact
  updates, and audit logs remain in place.
- Attachments are base64-encoded for Resend; inline Content-IDs and reply headers
  are preserved. Resend's limits and attachment restrictions still apply.
- Scheduled messages stay in Mailflare's existing queue. Each stored message ID
  is also the Resend idempotency key, protecting retries within Resend's 24-hour
  idempotency window.
- An accepted API request marks the message sent, as before; this does not claim
  final inbox delivery. Check the Resend dashboard for bounces and delivery status.
- Without a configured key/domain, `/api/send` returns an actionable 503. The
  domain dashboard reports sending as configured only for allowlisted domains.
- Domain setup and DNS checks do not invoke Cloudflare's paid Sending API.

References: [sending API](https://resend.com/docs/api-reference/emails/send-email),
[domain verification](https://resend.com/docs/dashboard/domains/introduction),
[Message-IDs](https://resend.com/changelog/message-id-for-sent-emails), and
[webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).
