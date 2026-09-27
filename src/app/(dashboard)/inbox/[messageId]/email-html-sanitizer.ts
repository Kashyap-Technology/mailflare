const ALLOWED_TAGS = new Set([
	"a",
	"abbr",
	"address",
	"b",
	"blockquote",
	"br",
	"caption",
	"code",
	"col",
	"colgroup",
	"dd",
	"del",
	"div",
	"dl",
	"dt",
	"em",
	"figcaption",
	"figure",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"img",
	"ins",
	"kbd",
	"li",
	"ol",
	"p",
	"pre",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"u",
	"ul",
]);

const DROP_CONTENT_TAGS = new Set([
	"base",
	"button",
	"embed",
	"form",
	"iframe",
	"input",
	"link",
	"math",
	"meta",
	"object",
	"option",
	"script",
	"select",
	"style",
	"svg",
	"textarea",
]);

const GLOBAL_ATTRIBUTES = new Set(["dir", "lang", "style", "title"]);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
	a: new Set(["href"]),
	blockquote: new Set(["cite"]),
	col: new Set(["span", "width"]),
	img: new Set(["alt", "height", "src", "width"]),
	li: new Set(["value"]),
	ol: new Set(["start", "type"]),
	table: new Set(["border", "cellpadding", "cellspacing", "width"]),
	td: new Set(["align", "colspan", "rowspan", "valign", "width"]),
	th: new Set(["align", "colspan", "rowspan", "scope", "valign", "width"]),
};

const ALLOWED_STYLE_PROPERTIES = new Set([
	"background",
	"background-color",
	"border",
	"border-bottom",
	"border-color",
	"border-left",
	"border-radius",
	"border-right",
	"border-style",
	"border-top",
	"border-width",
	"color",
	"display",
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"height",
	"letter-spacing",
	"line-height",
	"margin",
	"margin-bottom",
	"margin-left",
	"margin-right",
	"margin-top",
	"max-width",
	"min-width",
	"padding",
	"padding-bottom",
	"padding-left",
	"padding-right",
	"padding-top",
	"text-align",
	"text-decoration",
	"text-indent",
	"text-transform",
	"vertical-align",
	"white-space",
	"width",
	"word-break",
	"word-wrap",
]);
const APP_FONT_FALLBACK = "var(--font-geist-sans), system-ui, sans-serif";

function isSafeLinkUrl(value: string): boolean {
	try {
		const url = new URL(value, window.location.origin);
		return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
	} catch {
		return false;
	}
}

function isSafeImageUrl(value: string): boolean {
	if (value.startsWith("/api/messages/")) return true;
	if (/^data:image\/(?:gif|jpeg|png|webp);base64,/i.test(value)) return true;
	try {
		const url = new URL(value, window.location.origin);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function sanitizeStyle(element: HTMLElement): void {
	const safeDeclarations: string[] = [];
	for (const property of Array.from(element.style)) {
		if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
		const value = element.style.getPropertyValue(property);
		if (/url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i.test(value)) continue;
		const safeValue = property === "font-family"
			? `${value}, ${APP_FONT_FALLBACK}`
			: value;
		safeDeclarations.push(`${property}: ${safeValue}`);
	}
	if (safeDeclarations.length) {
		element.setAttribute("style", safeDeclarations.join("; "));
	} else {
		element.removeAttribute("style");
	}
}

function getSafeStyleDeclarations(document: Document, declarations: string): string | null {
	const probe = document.createElement("span");
	probe.setAttribute("style", declarations);
	sanitizeStyle(probe);
	return probe.getAttribute("style");
}

function applyEmbeddedStyles(document: Document): void {
	for (const styleElement of Array.from(document.querySelectorAll("style"))) {
		const css = styleElement.textContent ?? "";
		for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const selectors = match[1]
				.split(",")
				.map((selector) => selector.trim())
				.filter((selector) => selector && !selector.startsWith("@"));
			const safeDeclarations = getSafeStyleDeclarations(document, match[2]);
			if (!safeDeclarations || selectors.length === 0) continue;

			for (const selector of selectors) {
				let elements: Element[];
				try {
					elements = Array.from(document.body.querySelectorAll(selector));
				} catch {
					continue;
				}
				for (const element of elements) {
					const existing = element.getAttribute("style");
					element.setAttribute("style", existing ? `${safeDeclarations}; ${existing}` : safeDeclarations);
				}
			}
		}
		styleElement.remove();
	}
}

function hasButtonMarker(element: Element): boolean {
	for (let current: Element | null = element; current; current = current.parentElement) {
		const className = current.getAttribute("class") ?? "";
		if (/(^|[\s_-])(button|btn|cta)(?:$|[\s_-])/i.test(className)) return true;
		if (current.getAttribute("role")?.toLowerCase() === "button") return true;
	}
	return false;
}

function applyButtonFallback(element: Element): void {
	const fallback = "display: inline-block; background-color: #2563eb; border-radius: 0.375rem; padding: 0.625rem 1rem; color: #ffffff; font-weight: 600; text-decoration: none";
	const existing = element.getAttribute("style");
	element.setAttribute("style", existing ? `${fallback}; ${existing}` : fallback);
}

function sanitizeElement(element: Element): void {
	const tag = element.tagName.toLowerCase();
	const buttonLike = tag === "a" && hasButtonMarker(element);
	if (!ALLOWED_TAGS.has(tag)) {
		if (DROP_CONTENT_TAGS.has(tag)) {
			element.remove();
			return;
		}
		element.replaceWith(...Array.from(element.childNodes));
		return;
	}

	for (const attribute of Array.from(element.attributes)) {
		const name = attribute.name.toLowerCase();
		const allowed = GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[tag]?.has(name);
		if (!allowed || name.startsWith("on")) element.removeAttribute(attribute.name);
	}

	if (element instanceof HTMLElement) sanitizeStyle(element);

	if (tag === "a") {
		if (buttonLike) applyButtonFallback(element);
		const href = element.getAttribute("href");
		if (!href || !isSafeLinkUrl(href)) {
			element.removeAttribute("href");
		} else {
			element.setAttribute("target", "_blank");
			element.setAttribute("rel", "noopener noreferrer");
		}
	}

	if (tag === "img") {
		const src = element.getAttribute("src");
		if (!src || !isSafeImageUrl(src)) {
			element.remove();
			return;
		}
		element.setAttribute("loading", "lazy");
		element.setAttribute("referrerpolicy", "no-referrer");
	}
}

export function sanitizeEmailHtml(html: string | null): string | null {
	if (!html) return null;
	const document = new DOMParser().parseFromString(html, "text/html");
	applyEmbeddedStyles(document);
	for (const element of Array.from(document.body.querySelectorAll("*"))) {
		sanitizeElement(element);
	}
	return document.body.innerHTML;
}
