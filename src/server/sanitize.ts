import "server-only";
import sanitizeHtml from "sanitize-html";

const PHOTO_KEY = /^(shared|company):[0-9a-f-]{36}$/;

// 미리보기에서 직접 고친 HTML은 다시 화면과 Word에 쓰이므로 보고서에 필요한 태그만 남긴다(FUNC-9).
// 사진 자리의 data-photos는 사진 키만 남긴다. 키가 다른 회사 사진을 가리켜도 Word는 그 회사가 고른 사진만 넣는다(AUTH-8).
export function cleanReportHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["h1", "h2", "h3", "p", "ul", "ol", "li", "strong", "b", "em", "i", "u", "br", "table", "thead", "tbody", "tr", "th", "td", "div", "span"],
    allowedAttributes: { table: ["class"], div: ["class", "data-photos"] },
    allowedClasses: { table: ["kv"], div: ["photos"] },
    disallowedTagsMode: "discard",
    transformTags: {
      div: (tagName, attribs) => {
        const keys = (attribs["data-photos"] ?? "").split(/\s+/).filter((k) => PHOTO_KEY.test(k));
        const rest = { ...attribs };
        delete rest["data-photos"];
        return { tagName, attribs: keys.length ? { ...rest, "data-photos": keys.join(" ") } : rest };
      },
    },
  }).replace(/(<div class="photos"[^>]*>)[\s\S]*?<\/div>/g, "$1</div>");
}

export function titleOf(html: string): string {
  const m = html.match(/<h1>([\s\S]*?)<\/h1>/);
  const text = m ? sanitizeHtml(m[1], { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim() : "";
  return (text || "GMEP 일일 출장보고서").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').slice(0, 300);
}
