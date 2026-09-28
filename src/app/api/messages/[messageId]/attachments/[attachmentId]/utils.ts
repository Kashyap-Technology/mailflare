export function getAttachmentContentDisposition(filename: string, inline: boolean): string {
	const safeFilename = filename.replace(/["\\\r\n]/g, "_");
	return `${inline ? "inline" : "attachment"}; filename="${safeFilename}"`;
}

export function isPreviewableAttachmentType(contentType: string, filename = ""): boolean {
	const type = contentType.toLowerCase();
	const name = filename.toLowerCase();
	return (
		isPdfAttachment(type, name) ||
		type.startsWith("audio/") ||
		type.startsWith("video/") ||
		(type.startsWith("image/") && type !== "image/svg+xml") ||
		isDocumentAttachment(type, name) ||
		type.startsWith("text/plain") ||
		type === "application/json" ||
		type === "application/xml" ||
		type === "text/csv"
	);
}

export function getAttachmentPreviewContentType(contentType: string, filename: string): string {
	const type = contentType.toLowerCase();
	const name = filename.toLowerCase();
	if (isPdfAttachment(type, name)) return "application/pdf";
	if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	}
	if (name.endsWith(".doc") || type.includes("msword")) return "application/msword";
	if (name.endsWith(".odt") || type.includes("opendocument.text")) return "application/vnd.oasis.opendocument.text";
	if (name.endsWith(".rtf") || type === "application/rtf") return "application/rtf";
	return contentType;
}

function isPdfAttachment(contentType: string, filename: string): boolean {
	return contentType === "application/pdf" || filename.endsWith(".pdf");
}

function isDocumentAttachment(contentType: string, filename: string): boolean {
	return (
		contentType.includes("msword") ||
		contentType.includes("wordprocessingml") ||
		contentType.includes("opendocument.text") ||
		contentType === "application/rtf" ||
		/\.(doc|docx|odt|rtf)$/.test(filename)
	);
}
