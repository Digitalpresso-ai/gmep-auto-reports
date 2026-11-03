import "server-only";
import sanitizeHtml from "sanitize-html";

// 미리보기에서 직접 고친 HTML은 다시 화면과 Word에 쓰이므로 보고서에 필요한 태그만 남긴다(FUNC-9)
export function cleanReportHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h1", "h2", "h3", "p", "ul", "ol", "li", "strong", "b", "em", "i", "u", "br", "table", "thead", "tbody", "tr", "th", "td", "div", "span"],
    allowedAttributes: { table: ["class"], div: ["class"] },
    allowedClasses: { table: ["kv"], div: ["photos"] },
    disallowedTagsMode: "discard",
  }).replace(/<div class="photos">[\s\S]*?<\/div>/, '<div class="photos"></div>');
}

export function titleOf(html: string): string {
  const m = html.match(/<h1>([\s\S]*?)<\/h1>/);
  const text = m ? sanitizeHtml(m[1], { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim() : "";
  return (text || "GMEP 일일 출장보고서").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').slice(0, 300);
}
