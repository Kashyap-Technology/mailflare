import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { assertResendSender, getResendSendingDomains, isResendSendingDomain, sendResendEmail } from "../src/lib/email/resend.ts";
import { getResendMessageReference, verifyResendWebhook } from "../src/lib/email/resend-webhook.ts";
import { getSendErrorStatus } from "../src/app/api/send/error-utils.ts";

const env = { RESEND_API_KEY: "re_test_key", RESEND_SENDING_DOMAINS: " Example.com, second.example " };
const mail = { from: '"Example" <admin@example.com>', to: ["outside@recipient.test"], subject: "Hello", text: "Hello", messageId: "msg_test" };

test("sender configuration uses exact normalized domains and requires an API key", () => {
	assert.deepEqual(getResendSendingDomains(env), ["example.com", "second.example"]);
	assert.equal(isResendSendingDomain(env, "EXAMPLE.COM"), true);
	assert.equal(isResendSendingDomain(env, "sub.example.com"), false);
	assert.deepEqual(getResendSendingDomains({ RESEND_SENDING_DOMAINS: "example.com" }), []);
	assert.doesNotThrow(() => assertResendSender(env, mail.from));
	assert.throws(() => assertResendSender(env, "admin@unverified.test"), /RESEND_SENDING_DOMAINS/);
});

test("missing configuration fails before any network request or Cloudflare fallback", async (t) => {
	const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Must not fetch"); });
	await assert.rejects(sendResendEmail({}, mail), /RESEND_API_KEY/);
	await assert.rejects(sendResendEmail({ RESEND_API_KEY: "re_test" }, mail), /RESEND_SENDING_DOMAINS/);
	assert.equal(fetch.mock.callCount(), 0);
});

test("Resend receives recipients, binary attachments, inline IDs and reply headers", async (t) => {
	const calls = [];
	t.mock.method(globalThis, "fetch", async (url, init) => {
		calls.push({ url, init });
		return Response.json(calls.length === 1 ? { id: "resend-uuid" } : { message_id: "<wire-id@resend.test>" });
	});
	const result = await sendResendEmail(env, {
		...mail,
		cc: ["cc@recipient.test"], bcc: ["bcc@recipient.test"],
		html: '<img src="cid:logo">',
		headers: { "In-Reply-To": "<parent@test>", References: "<root@test> <parent@test>", "Message-ID": "fake@test", Bcc: "leak@test" },
		attachments: [
			{ filename: "data.bin", type: "application/octet-stream", content: new Uint8Array([0, 128, 255]).buffer },
			{ filename: "logo.png", type: "image/png", disposition: "inline", contentId: "logo", content: new Uint8Array([1, 2]).buffer },
		],
	});
	assert.deepEqual(result, { id: "resend-uuid", messageId: "<wire-id@resend.test>" });
	assert.equal(calls[0].url, "https://api.resend.com/emails");
	assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_key");
	assert.equal(calls[0].init.headers["Idempotency-Key"], "msg_test");
	const body = JSON.parse(calls[0].init.body);
	assert.deepEqual(body.to, mail.to);
	assert.deepEqual(body.cc, ["cc@recipient.test"]);
	assert.deepEqual(body.bcc, ["bcc@recipient.test"]);
	assert.deepEqual(body.headers, { "In-Reply-To": "<parent@test>", References: "<root@test> <parent@test>" });
	assert.deepEqual(body.tags, [{ name: "mailflare_message_id", value: "msg_test" }]);
	assert.equal(body.attachments[0].content, "AID/");
	assert.equal(body.attachments[0].content_type, "application/octet-stream");
	assert.equal(body.attachments[0].content_id, undefined);
	assert.equal(body.attachments[1].content_id, "logo");
	assert.equal(calls[1].url, "https://api.resend.com/emails/resend-uuid");
});

test("provider rejection never retries through Cloudflare", async (t) => {
	const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ message: "Domain is not verified" }, { status: 403 }));
	await assert.rejects(sendResendEmail(env, mail), /Resend rejected.*Domain is not verified/);
	assert.equal(fetch.mock.callCount(), 1);
});

test("rate limits and invalid responses become clear errors", async (t) => {
	t.mock.method(globalThis, "fetch", async () => new Response("rate limited", { status: 429 }));
	await assert.rejects(sendResendEmail(env, mail), /Resend rate limit/);
	t.mock.restoreAll();
	t.mock.method(globalThis, "fetch", async () => Response.json({}));
	await assert.rejects(sendResendEmail(env, mail), /invalid sending response/);
});

test("an accepted email stays successful when Message-ID lookup fails", async (t) => {
	for (const lookup of [() => new Response(null, { status: 403 }), () => { throw new Error("network down"); }, () => Response.json({ message_id: null })]) {
		let calls = 0;
		t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({ id: "resend-uuid" }) : lookup());
		assert.deepEqual(await sendResendEmail(env, mail), { id: "resend-uuid", messageId: null });
		assert.equal(calls, 2);
		t.mock.restoreAll();
	}
});

test("system mail normalizes a single recipient and skips the Message-ID lookup", async (t) => {
	const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ id: "system-id" }));
	await sendResendEmail(env, { ...mail, to: "reset@recipient.test", messageId: undefined });
	assert.equal(fetch.mock.callCount(), 1);
	const body = JSON.parse(fetch.mock.calls[0].arguments[1].body);
	assert.deepEqual(body.to, ["reset@recipient.test"]);
	assert.equal(body.tags, undefined);
});

test("send endpoints distinguish configuration, rate-limit and provider failures", () => {
	assert.equal(getSendErrorStatus("Outbound email is not configured. Add RESEND_API_KEY."), 503);
	assert.equal(getSendErrorStatus("Resend rate limit reached."), 429);
	assert.equal(getSendErrorStatus("Resend rejected the email (403)"), 502);
	assert.equal(getSendErrorStatus("Mailbox not found"), 403);
});

test("Svix published signature vector verifies", () => {
	const body = '{"event_type":"ping","data":{"success":true}}';
	const headers = new Headers({ "svix-id": "msg_loFOjxBNrRLzqYUf", "svix-timestamp": "1731705121", "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=" });
	assert.equal(verifyResendWebhook(body, headers, "whsec_plJ3nmyCDGBKInavdOK15jsl", 1731705121000), true);
});

test("webhook verification rejects altered bodies, timestamps, missing secrets and forged signatures", () => {
	const secret = "whsec_" + Buffer.from("test-signing-secret").toString("base64");
	const now = 1_800_000_000_000;
	const body = '{"type":"email.sent"}';
	const signature = createHmac("sha256", Buffer.from("test-signing-secret")).update(`event-id.${now / 1000}.${body}`).digest("base64");
	const headers = new Headers({ "svix-id": "event-id", "svix-timestamp": String(now / 1000), "svix-signature": `v1,invalid v1,${signature}` });
	assert.equal(verifyResendWebhook(body, headers, secret, now), true);
	assert.equal(verifyResendWebhook(body + " ", headers, secret, now), false);
	assert.equal(verifyResendWebhook(body, headers, secret, now + 301_000), false);
	assert.equal(verifyResendWebhook(body, headers, secret, now - 301_000), false);
	assert.equal(verifyResendWebhook(body, headers, "", now), false);
	assert.equal(verifyResendWebhook(body, new Headers(), secret, now), false);
	headers.set("svix-signature", "v1,forged");
	assert.equal(verifyResendWebhook(body, headers, secret, now), false);
});

test("webhook references use RFC Message-IDs, ignore system mail and unrelated events", () => {
	const event = { type: "email.sent", data: { email_id: "resend-uuid", message_id: "<wire-id@test>", tags: { mailflare_message_id: "msg_local" } } };
	assert.deepEqual(getResendMessageReference(event), { localId: "msg_local", messageId: "<wire-id@test>" });
	assert.equal(getResendMessageReference({ ...event, type: "email.received" }), null);
	assert.equal(getResendMessageReference({ ...event, data: { ...event.data, tags: {} } }), null);
	assert.equal(getResendMessageReference({ ...event, data: { ...event.data, message_id: "resend-uuid" } }), null);
	assert.equal(getResendMessageReference(null), null);
});
