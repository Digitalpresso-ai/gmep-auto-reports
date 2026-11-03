import { describe, expect, it } from "vitest";
import { displayName, sortForLogin } from "@/server/domain/company-name";

describe("AUTH-2 로그인 드롭다운 회사명", () => {
  it("앞뒤의 주식회사·(주)를 이름 뒤 (주)로 옮긴다", () => {
    expect(displayName("주식회사 디지털프레소")).toBe("디지털프레소(주)");
    expect(displayName("캠핑이너스 주식회사")).toBe("캠핑이너스(주)");
    expect(displayName("(주)엘앤에스일렉트로닉스")).toBe("엘앤에스일렉트로닉스(주)");
    expect(displayName("㈜월드리싸이클링")).toBe("월드리싸이클링(주)");
  });

  it("법인 표기가 없는 이름은 그대로 둔다", () => {
    expect(displayName("지비오")).toBe("지비오");
    expect(displayName("SafeAI")).toBe("SafeAI");
  });

  it("법인 표기를 뺀 이름의 가나다순으로 정렬한다", () => {
    const sorted = sortForLogin([
      { id: "1", name: "주식회사 오션스마트" },
      { id: "2", name: "공존" },
      { id: "3", name: "(주)엘앤에스일렉트로닉스" },
      { id: "4", name: "캠핑이너스 주식회사" },
    ]);
    expect(sorted.map((c) => c.label)).toEqual(["공존", "엘앤에스일렉트로닉스(주)", "오션스마트(주)", "캠핑이너스(주)"]);
    expect(sorted.map((c) => c.id)).toEqual(["2", "3", "1", "4"]);
  });
});
