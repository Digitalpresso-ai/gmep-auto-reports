import { describe, expect, it } from "vitest";
import { classifyFile } from "@/lib/classify";

describe("FUNC-3 공통 자료 자동 분류", () => {
  it("이미지는 사진, 일정 이름의 이미지는 일정 이미지로 분류한다", () => {
    expect(classifyFile("IMG_1624.jpeg")).toBe("photo");
    expect(classifyFile("20261102_102831.jpg")).toBe("photo");
    expect(classifyFile("일정표.png")).toBe("schedule_image");
    expect(classifyFile("Agenda_Day1.HEIC")).toBe("schedule_image");
  });

  it("이름에 일정·schedule·agenda가 있는 문서는 일정, 나머지 문서는 교육자료다", () => {
    expect(classifyFile("GMEP 2026_Landing Day_Berlin_Schedule.pdf")).toBe("schedule");
    expect(classifyFile("11월 2일 일정.docx")).toBe("schedule");
    expect(classifyFile("Doing_Business_in_Germany.pdf")).toBe("education");
    expect(classifyFile("Expand! to Europe.pptx")).toBe("education");
    expect(classifyFile("메모.txt")).toBe("education");
  });

  it("동영상·압축 내부 숨김 파일·모르는 형식은 무시한다", () => {
    expect(classifyFile("IMG_1639.MOV")).toBe("ignore");
    expect(classifyFile("clip.mp4")).toBe("ignore");
    expect(classifyFile(".DS_Store")).toBe("ignore");
    expect(classifyFile("data.xlsx")).toBe("ignore");
  });
});
