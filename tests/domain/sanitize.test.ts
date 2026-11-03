import { describe, expect, it } from "vitest";
import { cleanReportHtml } from "@/server/sanitize";

const id = "0b6f3c1e-1d2a-4c3b-9e8f-112233445566";

describe("FUNC-9·PHOTO-2 직접 수정한 HTML 정리", () => {
  it("사진 자리의 data-photos는 사진 키 형식만 남기고, 자리 안의 미리보기 사진은 비운다", () => {
    const html = `<h3>강연</h3><div class="photos" data-photos="shared:${id} evil:x company:${id}"><img src="https://x/a.jpg"></div><h2>참여 사진</h2><div class="photos"><img src="b"></div>`;
    expect(cleanReportHtml(html)).toBe(`<h3>강연</h3><div class="photos" data-photos="shared:${id} company:${id}"></div><h2>참여 사진</h2><div class="photos"></div>`);
  });

  it("다른 div 속성과 스크립트는 지운다", () => {
    expect(cleanReportHtml('<div class="photos" data-x="1" onclick="a()"><script>x</script></div>')).toBe('<div class="photos"></div>');
  });
});
