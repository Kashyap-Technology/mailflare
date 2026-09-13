import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

/** Verify Resend's Svix signature against the unmodified body. */
export function verifyResendWebhook(body: string, headers: Headers, secret: string, now = Date.now()): boolean {
	const id = headers.get("svix-id");
	const timestamp = headers.get("svix-timestamp");
	const signatures = headers.get("svix-signature");
	if (!id || !timestamp || !signatures || !secret.startsWith("whsec_")) return false;
	if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
	const key = Buffer.from(secret.slice(6), "base64");
	if (!key.length) return false;
	const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
	return signatures.split(/\s+/).some((signature) => {
		const [version, encoded] = signature.split(",");
		if (version !== "v1" || !encoded) return false;
		const actual = Buffer.from(encoded, "base64");
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	});
}

export function getResendMessageReference(event: unknown): { localId: string; messageId: string } | null {
	if (!event || typeof event !== "object" || !("type" in event) || event.type !== "email.sent") return null;
	const data = (event as { data?: { message_id?: unknown; tags?: Record<string, unknown> } }).data;
	const localId = data?.tags?.mailflare_message_id;
	const messageId = data?.message_id;
	if (typeof localId !== "string" || !/^msg_[\w-]+$/.test(localId)) return null;
	if (typeof messageId !== "string" || !/^<?[^\s<>]+@[^\s<>]+>?$/.test(messageId)) return null;
	return { localId, messageId };
}
