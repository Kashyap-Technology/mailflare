import test from "node:test";
import assert from "node:assert/strict";
import { textToHtmlWithLinks } from "../src/components/compose/rich-text-utils.ts";

test("renders plain-text HTTP(S) URLs as safe links while preserving line breaks", () => {
	const html = textToHtmlWithLinks(
		"Padova\nhttps://www.unipd.it/en/corsi-di-laurea/cybersecurity\nThanks",
	);

	assert.equal(
		html,
		'<div>Padova<br><a href="https://www.unipd.it/en/corsi-di-laurea/cybersecurity">https://www.unipd.it/en/corsi-di-laurea/cybersecurity</a><br>Thanks</div>',
	);
});

test("supports markdown-style links and escapes non-link HTML", () => {
	const html = textToHtmlWithLinks("[Course](https://example.com) <script>alert(1)</script>");

	assert.equal(
		html,
		'<div><a href="https://example.com">Course</a> &lt;script&gt;alert(1)&lt;/script&gt;</div>',
	);
});
