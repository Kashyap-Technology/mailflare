import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { getResendMessageReference, verifyResendWebhook } from "@/lib/email/resend-webhook";

export async function POST(request: Request) {
	const env = getEnv();
	if (!env.RESEND_WEBHOOK_SECRET) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
	const maxBytes = 64 * 1024;
	if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
		return new Response(null, { status: 413 });
	}
	const body = await request.arrayBuffer();
	if (body.byteLength > maxBytes) return new Response(null, { status: 413 });
	const raw = new TextDecoder().decode(body);
	if (!verifyResendWebhook(raw, request.headers, env.RESEND_WEBHOOK_SECRET)) {
		return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
	}
	let event: unknown;
	try {
		event = JSON.parse(raw);
	} catch {
		return new Response(null, { status: 400 });
	}
	const reference = getResendMessageReference(event);
	if (reference) {
		const db = getDb(env);
		// The local tag survives even if this event races the sending API response.
		// Repeated events are idempotent; established conversation IDs stay intact.
		await db.update(messages).set({
			providerMessageId: reference.messageId,
			threadId: sql`coalesce(${messages.threadId}, ${messages.id})`,
		}).where(and(eq(messages.id, reference.localId), eq(messages.direction, "outbound")));
	}
	return Response.json({ ok: true });
}
