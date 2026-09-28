import test from "node:test";
import assert from "node:assert/strict";
import {
	getAttachmentPreviewContentType,
	isPreviewableAttachmentType,
} from "../src/app/api/messages/[messageId]/attachments/[attachmentId]/utils.ts";

test("recognizes PDF attachments from their filename when MIME metadata is generic", () => {
	assert.equal(isPreviewableAttachmentType("application/octet-stream", "verification.pdf"), true);
	assert.equal(getAttachmentPreviewContentType("application/octet-stream", "verification.pdf"), "application/pdf");
});


test("allows office document formats to open inline without changing the original format", () => {
	assert.equal(isPreviewableAttachmentType("application/octet-stream", "offer.docx"), true);
	assert.equal(isPreviewableAttachmentType("application/msword", "offer.doc"), true);
	assert.equal(getAttachmentPreviewContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "offer.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
	assert.equal(getAttachmentPreviewContentType("application/octet-stream", "offer.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});
