import { Fragment, type ReactNode } from "react";

/** Shows the small amount of formatting AI answers use (bold, inline code, code blocks, bullet and numbered lists)
 *  without any HTML from the answer ever being inserted into the page. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**")
      ? <strong key={`${key}-${i++}`} className="font-semibold">{tok.slice(2, -2)}</strong>
      : <code key={`${key}-${i++}`} className="rounded bg-track px-1 py-0.5 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const parts = text.split(/```[a-zA-Z0-9+-]*\n?/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {   // inside a code fence
      blocks.push(<pre key={`c${pi}`} className="my-2 overflow-x-auto rounded-lg bg-inverse p-3 font-mono text-sm text-white"><code>{part.replace(/\n$/, "")}</code></pre>);
      return;
    }
    let list: { ordered: boolean; items: string[] } | null = null;
    const flush = (k: string) => {
      if (!list) return;
      const Tag = list.ordered ? "ol" : "ul";
      blocks.push(<Tag key={k} className={`my-1.5 space-y-1 pl-6 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}
      </Tag>);
      list = null;
    };
    part.split("\n").forEach((raw, li) => {
      const line = raw.replace(/^#{1,6}\s+/, "").trimEnd();
      const b = line.match(/^\s*[-*•]\s+(.*)$/), n = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (b || n) {
        const ordered = !!n;
        if (list && list.ordered !== ordered) flush(`l${pi}-${li}`);
        list ??= { ordered, items: [] };
        list.items.push((b ?? n)![1]);
        return;
      }
      flush(`l${pi}-${li}`);
      if (line.trim()) blocks.push(<p key={`p${pi}-${li}`} className="my-1.5">{inline(line, `p${pi}-${li}`)}</p>);
    });
    flush(`l${pi}-end`);
  });
  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
