import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Turn http(s) links in chat text into blue underlined links that open in a new tab. */
export function linkifiedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const index = match.index;
    if (index > last) nodes.push(text.slice(last, index));
    const href = raw.replace(/[),.;!?]+$/, "");
    const trailing = raw.slice(href.length);
    nodes.push(
      <a
        key={`${index}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline"
        style={{ color: "#1d4ed8" }}
      >
        {href}
      </a>
    );
    if (trailing) nodes.push(trailing);
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}
