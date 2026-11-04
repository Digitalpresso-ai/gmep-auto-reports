import { describe, expect, it } from "vitest";
import { headingKey, placementFromHtml, splitSections, textOf } from "./sections";

const HTML =
  `<h1>보고서</h1><h2>1. 기본 정보</h2><table><tr><td>일자</td><td>A &amp; B</td></tr></table>` +
  `<h2>2. 일정 및 수행 내용</h2><table></table><div class="photos" data-photos="shared:a shared:b"></div>` +
  `<h2>3. 세부 교육 내용</h2><h3>세션 1</h3><ul><li>x</li></ul><div class="photos" data-photos="shared:c"></div>` +
  `<h2>4. 참여 사진</h2><div class="photos"></div>`;

describe("splitSections", () => {
  it("h2마다 나누고 첫 h2 앞부분은 제목 없는 섹션으로 둔다", () => {
    const s = splitSections(HTML);
    expect(s.map((x) => x.heading)).toEqual(["", "1. 기본 정보", "2. 일정 및 수행 내용", "3. 세부 교육 내용", "4. 참여 사진"]);
    expect(s.map((x) => x.html).join("")).toBe(HTML);
    expect(textOf(s[1].html)).toBe("1. 기본 정보 일자 A & B");
  });
  it("번호를 뗀 제목으로 같은 섹션을 맞춘다", () => {
    expect(headingKey("3. 세부 교육 내용")).toBe("세부 교육 내용");
    expect(headingKey("붙임")).toBe("붙임");
  });
});

describe("placementFromHtml", () => {
  it("사진 키마다 h2·h3 자리를 돌려준다", () => {
    expect(Object.fromEntries(placementFromHtml(HTML))).toEqual({
      "shared:a": "2. 일정 및 수행 내용",
      "shared:b": "2. 일정 및 수행 내용",
      "shared:c": "3. 세부 교육 내용 > 세션 1",
    });
  });
});
