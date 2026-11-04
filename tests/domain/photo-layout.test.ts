import { describe, expect, it } from "vitest";
import { assignPhotos, parsePhotoKeys } from "@/lib/photo-layout";

describe("PHOTO-2 사진 자리 배치", () => {
  it("고른 사진은 모두 참여 사진 자리에 선택 순서대로 넣고, 예전에 섹션에 둔 자리는 비운다", () => {
    const boxes = [["s:b", "s:a"], ["s:c"], null];
    expect(assignPhotos(boxes, ["s:a", "s:b", "s:c", "s:d", "c:e"])).toEqual([[], [], ["s:a", "s:b", "s:c", "s:d", "c:e"]]);
  });

  it("참여 사진 자리가 여럿이면 마지막 자리에 넣는다", () => {
    expect(assignPhotos([null, null], ["s:a"])).toEqual([[], ["s:a"]]);
  });

  it("참여 사진 자리가 지워졌으면 마지막 자리에 넣는다", () => {
    expect(assignPhotos([["s:a"]], ["s:a", "s:b"])).toEqual([["s:a", "s:b"]]);
  });

  it("자리가 없으면 넣지 않는다", () => {
    expect(assignPhotos([], ["s:a"])).toEqual([]);
  });

  it("data-photos가 없는 자리는 null로 읽는다", () => {
    expect(parsePhotoKeys(undefined)).toBeNull();
    expect(parsePhotoKeys(" shared:1  company:2 ")).toEqual(["shared:1", "company:2"]);
  });
});
