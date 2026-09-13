import { Buffer } from "node:buffer";
import type { AttachmentContent } from "./attachment-types";

type ResendEnv = { RESEND_API_KEY?: string; RESEND_SENDING_DOMAINS?: string };

export function getResendSendingDomains(env: ResendEnv): string[] {
	if (!env.RESEND_API_KEY?.trim()) return [];
	return (env.RESEND_SENDING_DOMAINS ?? "").split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean);
}

export function isResendSendingDomain(env: ResendEnv, hostname: string): boolean {
	return getResendSendingDomains(env).includes(hostname.trim().toLowerCase());
}

export function assertResendSender(env: ResendEnv, from: string): void {
	if (!env.RESEND_API_KEY?.trim()) {
		throw new Error("Outbound email is not configured. Add the RESEND_API_KEY Worker secret.");
	}
	const address = from.match(/<([^<>]+)>\s*$/)?.[1] ?? from.trim();
	const hostname = address.slice(address.lastIndexOf("@") + 1);
	if (!isResendSendingDomain(env, hostname)) {
		throw new Error("Outbound email is not configured for this sender. Verify its domain in Resend and add it to RESEND_SENDING_DOMAINS.");
	}
}

type ResendMail = {
	from: string;
	to: string | string[];
	cc?: string[];
	bcc?: string[];
	subject: string;
	text?: string;
	html?: string;
	headers?: Record<string, string>;
	attachments?: AttachmentContent[];
	/** Stable local ID used for retries and webhook correlation. */
	messageId?: string;
};

export async function sendResendEmail(env: ResendEnv, input: ResendMail): Promise<{ id: string; messageId: string | null }> {
	assertResendSender(env, input.from);
	const authorization = `Bearer ${env.RESEND_API_KEY!.trim()}`;
	const headers = Object.fromEntries(Object.entries(input.headers ?? {}).filter(([name]) =>
		!["message-id", "from", "to", "cc", "bcc", "subject", "content-type", "mime-version"].includes(name.toLowerCase()),
	));
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: authorization,
			"Content-Type": "application/json",
			"Idempotency-Key": input.messageId ?? crypto.randomUUID(),
		},
		body: JSON.stringify({
			from: input.from,
			to: typeof input.to === "string" ? [input.to] : input.to,
			cc: input.cc?.length ? input.cc : undefined,
			bcc: input.bcc?.length ? input.bcc : undefined,
			subject: input.subject,
			text: input.text,
			html: input.html,
			headers,
			tags: input.messageId ? [{ name: "mailflare_message_id", value: input.messageId }] : undefined,
			attachments: input.attachments?.map((attachment) => ({
				filename: attachment.filename,
				content: Buffer.from(attachment.content).toString("base64"),
				content_type: attachment.type,
				content_id: attachment.disposition === "inline" ? attachment.contentId ?? undefined : undefined,
			})),
		}),
		signal: AbortSignal.timeout(30_000),
	});
	const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
	if (!response.ok) {
		if (response.status === 429) throw new Error("Resend rate limit reached. Please try again later.");
		throw new Error(`Resend rejected the email (${response.status}): ${result?.message ?? "Check the API key and sending-domain verification in Resend."}`);
	}
	if (!result?.id) throw new Error("Resend returned an invalid sending response.");

	// Resend's API UUID is not an RFC Message-ID. A failed lookup must never
	// turn an already accepted email into a failed send. The signed webhook
	// can fill in the Message-ID later, including with a sending-only API key.
	let messageId: string | null = null;
	if (input.messageId) {
		try {
			const detail = await fetch(`https://api.resend.com/emails/${encodeURIComponent(result.id)}`, {
				headers: { Authorization: authorization },
				signal: AbortSignal.timeout(5_000),
			});
			if (detail.ok) {
				const email = await detail.json() as { message_id?: string };
				if (typeof email.message_id === "string" && email.message_id.includes("@")) messageId = email.message_id;
			}
		} catch {
			// Delivery was already accepted; webhook reconciliation is independent.
		}
	}
	return { id: result.id, messageId };
}
