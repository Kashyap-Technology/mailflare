export function getSendErrorStatus(message: string): number {
	if (message.startsWith("Outbound email is not configured")) return 503;
	if (message.startsWith("Resend rate limit")) return 429;
	if (message.startsWith("Resend ")) return 502;
	if (message === "Mailbox is required") return 400;
	if (
		message === "Mailbox not found" ||
		message === "Sender account not found" ||
		message === "You do not have permission to send from this mailbox" ||
		message === "Sender address does not match the selected mailbox"
	) {
		return 403;
	}
	return 500;
}
