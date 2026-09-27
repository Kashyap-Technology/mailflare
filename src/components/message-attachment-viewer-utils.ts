import type { MessageAttachment } from "@/app/(dashboard)/inbox/[messageId]/types";
import type { AttachmentPreviewKind } from "./message-attachment-viewer-types";

export function getAttachmentFileUrl(
	messageId: string,
	attachmentId: string,
	mode: "download" | "preview" = "download",
): string {
	const suffix = mode === "preview" ? "?preview=1" : "?download=1";
	return `/api/messages/${messageId}/attachments/${attachmentId}${suffix}`;
}

export function getAttachmentPreviewKind(
	attachment: Pick<MessageAttachment, "filename" | "type">,
): AttachmentPreviewKind {
	const type = attachment.type.toLowerCase();
	const filename = attachment.filename.toLowerCase();
	if (type === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
	if (type.startsWith("audio/")) return "audio";
	if (type.startsWith("video/")) return "video";
	if (type.startsWith("image/") && type !== "image/svg+xml") return "image";
	if (
		type.includes("msword") ||
		type.includes("wordprocessingml") ||
		type.includes("opendocument.text") ||
		type === "application/rtf" ||
		/\.(doc|docx|odt|rtf)$/.test(filename)
	) {
		return "document";
	}
	if (
		type.startsWith("text/plain") ||
		type === "application/json" ||
		type === "application/xml" ||
		type === "text/csv"
	) {
		return "text";
	}
	return "unsupported";
}
