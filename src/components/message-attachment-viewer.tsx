"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, FileWarning } from "lucide-react";
import mammoth from "mammoth";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { authFetch } from "@/lib/auth/client";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessageAttachmentViewerProps } from "./message-attachment-viewer-types";
import {
	getAttachmentFileUrl,
	getAttachmentPreviewKind,
} from "./message-attachment-viewer-utils";

export function MessageAttachmentViewer({
	attachment,
	messageId,
	onOpenChange,
	open,
}: MessageAttachmentViewerProps) {
	const [textContent, setTextContent] = useState("");
	const [textError, setTextError] = useState("");
	const [docxHtml, setDocxHtml] = useState("");
	const [docxError, setDocxError] = useState("");

	const previewKind = attachment ? getAttachmentPreviewKind(attachment) : "unsupported";
	const previewUrl = attachment
		? getAttachmentFileUrl(messageId, attachment.id, "preview")
		: "";
	const downloadUrl = attachment
		? getAttachmentFileUrl(messageId, attachment.id, "download")
		: "";

	useEffect(() => {
		if (!open || !attachment || !["text", "docx"].includes(previewKind)) return;
		let cancelled = false;
		setTextContent("");
		setTextError("");
		setDocxHtml("");
		setDocxError("");

		authFetch(previewUrl)
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load this attachment");
				if (previewKind === "docx") {
					const result = await mammoth.convertToHtml(
						{ arrayBuffer: await response.arrayBuffer() },
						{ convertImage: mammoth.images.dataUri, externalFileAccess: false },
					);
					if (!cancelled) setDocxHtml(result.value);
					return;
				}
				const content = await response.text();
				if (!cancelled) setTextContent(content);
			})
			.catch((error) => {
				if (!cancelled) {
					const message = error instanceof Error ? error.message : "Could not load this attachment";
					if (previewKind === "docx") setDocxError(message);
					else setTextError(message);
				}
			});

		return () => {
			cancelled = true;
		};
		}, [attachment, open, previewKind, previewUrl]);

	if (!attachment) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(88vh,900px)] w-[min(1100px,calc(100vw-32px))] flex-col overflow-hidden">
				<DialogHeader className="shrink-0 pr-10">
					<DialogTitle className="truncate">{attachment.filename}</DialogTitle>
					<DialogDescription>{attachment.type}</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-neutral-100">
					{previewKind === "image" && (
						<img
							src={previewUrl}
							alt={attachment.filename}
							className="max-h-full max-w-full object-contain"
						/>
					)}
					{previewKind === "pdf" && (
						<iframe
							src={previewUrl}
							title={attachment.filename}
							className="h-full w-full border-0 bg-white"
						/>
					)}
					{previewKind === "docx" && (
						docxError ? (
							<div className="px-6 text-center text-sm text-neutral-600">{docxError}</div>
						) : docxHtml ? (
							<iframe
								srcDoc={`<!doctype html><html><head><meta name="color-scheme" content="light"><style>body{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6;color:#262626;max-width:780px;margin:0 auto;padding:32px}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #d4d4d4;padding:6px 10px}a{color:#2563eb}</style></head><body>${docxHtml}</body></html>`}
								title={attachment.filename}
								className="h-full w-full border-0 bg-white"
								sandbox=""
							/>
						) : (
							<div className="h-full w-full space-y-3 bg-white p-5">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-11/12" />
								<Skeleton className="h-4 w-4/5" />
							</div>
						)
					)}
					{previewKind === "audio" && (
						<audio src={previewUrl} controls className="w-[min(560px,90%)]" />
					)}
					{previewKind === "video" && (
						<video src={previewUrl} controls className="max-h-full max-w-full" />
					)}
					{previewKind === "text" && (
						textError || textContent ? (
							<pre className="h-full w-full overflow-auto whitespace-pre-wrap p-5 text-sm text-neutral-800">
								{textError || textContent}
							</pre>
						) : (
							<div className="h-full w-full space-y-3 bg-white p-5">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-11/12" />
								<Skeleton className="h-4 w-4/5" />
							</div>
						)
					)}
					{previewKind === "unsupported" && (
						<div className="flex flex-col items-center gap-3 px-6 text-center">
							<FileWarning className="h-10 w-10 text-neutral-400" />
							<p className="text-sm text-neutral-600">
								This file type cannot be previewed safely in the browser.
							</p>
						</div>
					)}
				</div>

				<div className="flex shrink-0 justify-end">
					<Button asChild>
						<a href={downloadUrl} download={attachment.filename}>
							<ArrowDownToLine className="h-4 w-4" />
							Download
						</a>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
