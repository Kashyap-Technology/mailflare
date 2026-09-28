import type { AttachmentContent } from "@/lib/email/attachment-types";
import { MAX_ATTACHMENT_COUNT } from "@/lib/email/attachment-limits";
import { readFormDataBody, readJsonBody } from "@/lib/http/request";
import type { SendRequestPayload } from "./types";

const MAX_SEND_REQUEST_SIZE = 30 * 1024 * 1024;

function getOptionalFormValue(form: FormData, key: string): string | undefined {
	const value = form.get(key);
	return typeof value === "string" && value ? value : undefined;
}

export class TooManyAttachmentsError extends Error {
	constructor() {
		super(`A message can include at most ${MAX_ATTACHMENT_COUNT} attachments`);
		this.name = "TooManyAttachmentsError";
	}
}

export async function parseSendRequest(request: Request): Promise<SendRequestPayload> {
	if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
		return readJsonBody<SendRequestPayload>(request, MAX_SEND_REQUEST_SIZE);
	}

	const form = await readFormDataBody(request, MAX_SEND_REQUEST_SIZE);
	const attachments: AttachmentContent[] = [];
	const fileValues = form.getAll("attachments").filter((value): value is File => value instanceof File);
	if (fileValues.length > MAX_ATTACHMENT_COUNT) throw new TooManyAttachmentsError();
	for (const value of fileValues) {
		if (value.size === 0) continue;
		attachments.push({
			filename: value.name,
			type: value.type || "application/octet-stream",
			content: await value.arrayBuffer(),
			disposition: "attachment",
		});
	}

	return {
		from: String(form.get("from") ?? ""),
		to: String(form.get("to") ?? ""),
		cc: getOptionalFormValue(form, "cc"),
		bcc: getOptionalFormValue(form, "bcc"),
		inReplyTo: getOptionalFormValue(form, "inReplyTo"),
		references: getOptionalFormValue(form, "references"),
		threadId: getOptionalFormValue(form, "threadId"),
		draftId: getOptionalFormValue(form, "draftId"),
		scheduledAt: getOptionalFormValue(form, "scheduledAt"),
		subject: String(form.get("subject") ?? ""),
		text: getOptionalFormValue(form, "text"),
		html: getOptionalFormValue(form, "html"),
		mailboxId: getOptionalFormValue(form, "mailboxId"),
		attachments,
	};
}
