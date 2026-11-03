import { describe, expect, it } from "vitest";
import { assignPhotos, parsePhotoKeys } from "@/lib/photo-layout";

describe("PHOTO-2 사진 자리 배치", () => {
  it("AI가 섹션에 둔 사진은 그 자리에, 나머지 선택 사진은 참여 사진 자리에 선택 순서대로 넣는다", () => {
    const boxes = [["s:b", "s:a"], ["s:c"], null];
    expect(assignPhotos(boxes, ["s:a", "s:b", "s:c", "s:d", "c:e"])).toEqual([["s:a", "s:b"], ["s:c"], ["s:d", "c:e"]]);
  });

  it("생성 뒤 선택에서 뺀 사진은 어느 자리에도 넣지 않는다", () => {
    expect(assignPhotos([["s:a", "s:b"], null], ["s:b"])).toEqual([["s:b"], []]);
  });

  it("같은 사진이 두 자리에 적혀 있어도 한 번만 넣는다", () => {
    expect(assignPhotos([["s:a"], ["s:a"], null], ["s:a"])).toEqual([["s:a"], [], []]);
  });

  it("참여 사진 자리가 지워졌으면 남은 사진을 마지막 자리에 넣는다", () => {
    expect(assignPhotos([["s:a"]], ["s:a", "s:b"])).toEqual([["s:a", "s:b"]]);
  });

  it("data-photos가 없는 자리는 null로 읽는다", () => {
    expect(parsePhotoKeys(undefined)).toBeNull();
    expect(parsePhotoKeys(" shared:1  company:2 ")).toEqual(["shared:1", "company:2"]);
  });
});
