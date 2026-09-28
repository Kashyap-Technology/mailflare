"use client";

import Link from "next/link";
import { useState } from "react";
import { Info, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { TurnstileField } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./utils";

export function ForgotPasswordClient() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);
	const [turnstileReset, setTurnstileReset] = useState(0);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const result = await requestPasswordReset(new FormData(event.currentTarget));
			if (!result.ok) {
				setError(result.error ?? "Something went wrong. Please try again.");
				setTurnstileReset((value) => value + 1);
				return;
			}
			setSent(true);
		} catch {
			setError("Unable to reach the server. Please try again.");
			setTurnstileReset((value) => value + 1);
		} finally {
			setLoading(false);
		}
	}

	return (
		<AuthShell
			icon={KeyRound}
			title="Reset your password"
			description={
				sent
					? "If that account has a recovery email, a reset link is on its way. It works for 30 minutes."
					: "Enter the address you sign in with. We will send a reset link to the recovery email on the account."
			}
			footer={
				<Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-800">
					Back to sign in
				</Link>
			}
		>
			{sent ? (
				<div className="space-y-4">
					<div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-900">
						<Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
						<div className="space-y-1 leading-6">
							<p className="font-medium">Check your recovery inbox</p>
							<p>The link is sent to the Recovery email saved under Settings → Account, not to your Mailflare mailbox. Check spam or junk too.</p>
							<p>If nothing arrives after a few minutes, ask an administrator to check the Resend sending setup.</p>
						</div>
					</div>
					<p className="text-sm leading-6 text-neutral-500">
						Can&apos;t access that email? Ask a workspace administrator to reset your password from Admin → Accounts.
					</p>
				</div>
			) : (
				<form onSubmit={onSubmit} className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
					</div>
					{error && (
						<p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
					)}
					<TurnstileField resetSignal={turnstileReset} />
					<Button type="submit" className="h-11 w-full rounded-full px-6 active:scale-[0.98]" disabled={loading}>
						{loading ? "Sending..." : "Send reset link"}
					</Button>
				</form>
			)}
		</AuthShell>
	);
}
