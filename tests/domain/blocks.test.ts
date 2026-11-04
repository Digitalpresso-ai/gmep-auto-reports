import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { BLOCK_TOOLS, applyOp, headingsOf, numberedForModel, parseBlocks, renderDoc, type BlockDoc, type BlockOp } from "@/server/domain/blocks";
import { normalizeReport, renderReportHtml } from "@/server/domain/report";
import { cleanReportHtml } from "@/server/sanitize";

const k1 = "shared:0b6f3c1e-1d2a-4c3b-9e8f-112233445566";
const k2 = "company:1c7f4d2f-2e3b-4d4c-8f9a-223344556677";
const k3 = "shared:2d8a5e3a-3f4c-4e5d-9a0b-334455667788";
const keys = [k1, k2, k3];

function apply(doc: BlockDoc, op: BlockOp): BlockDoc {
  const r = applyOp(doc, op, keys);
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}

describe("블록 문서: HTML ↔ 블록", () => {
  it("회사가 직접 고친 HTML을 parse→render하면 바이트가 같다", () => {
    const html =
      `\n<h1>제목 &amp; 부제</h1>\n<h2>1.  기본 정보</h2><table class="kv"><tbody><tr><td>일자</td><td>x &lt; y</td></tr></tbody></table>` +
      `직접 쓴 글 <b>굵게</b><br><span>덧붙임</span>  <p>문단<p>닫지 않은 문단 <ul><li>항목</ul>\n` +
      `<div class="photos" data-photos="${k1}"></div><!-- 메모 --><ol><li>번호</li></ol><h3>소제목</h3>\n`;
    const doc = parseBlocks(html);
    expect(renderDoc(doc)).toBe(html);
    expect(doc.blocks.map((b) => b.id)).toEqual(doc.blocks.map((_, i) => `b${i + 1}`));
    // h1, h2, table, (텍스트·b·br·span 묶음), p, p, ul, div.photos, ol, h3
    expect(doc.blocks).toHaveLength(10);
    expect(doc.blocks[3].html).toBe("직접 쓴 글 <b>굵게</b><br><span>덧붙임</span>  ");
  });

  it("지금 renderReportHtml이 만든 보고서를 읽으면 모든 섹션 h2가 블록으로 나온다", () => {
    const report = normalizeReport({
      title: "GMEP 일일 출장보고서 — Day 1",
      basic: [["일자", "2026. 11. 2.(월)"]],
      schedule: [["09:30", "온보딩", "참석"]],
      education: [{ title: "3-1. 시장 진입", items: [{ t: "규제", sub: ["인증"] }], table: { head: ["분야", "전문가"], rows: [["법률", "A"]] } }],
      achievements: [{ t: "네트워크", sub: [] }],
      special: [{ t: "미팅", sub: ["후속"] }],
      insights: [{ t: "현지화", sub: ["근거", "적용"] }],
      plans: ["11. 3.(화) 대비"],
      attachments: ["교육자료"],
      photos: [{ no: 1, place: "schedule" }, { no: 2, place: "edu:1" }],
    });
    const html = renderReportHtml(report, keys);
    const doc = parseBlocks(html);
    expect(renderDoc(doc)).toBe(html);
    expect(headingsOf(doc).filter((h) => h.level === 2).map((h) => h.text)).toEqual([
      "1. 기본 정보",
      "2. 일정 및 수행 내용",
      "3. 세부 교육 내용",
      "4. 주요 성과",
      "5. 특이사항 (별도 성과·미팅)",
      "6. 시사점 및 향후 계획",
      "7. 참여 사진",
      "붙임",
    ]);
  });
});

describe("블록 문서: tool 연산", () => {
  const base = () => parseBlocks("<h1>제목</h1><h2>1. 기본 정보</h2><p>회사가 고친 <em>문장</em></p><h2>2. 성과</h2><ul><li>a</li></ul>");

  it("빈 문서에 블록을 차례로 추가하면 끝에 붙고 id가 이어진다", () => {
    let doc = parseBlocks("");
    const r1 = applyOp(doc, { name: "add_heading", input: { level: 1, text: "제목 <A&B>", after: null } }, keys);
    expect(r1).toMatchObject({ ok: true, id: "b1" });
    doc = apply(doc, { name: "add_heading", input: { level: 1, text: "제목 <A&B>", after: null } });
    doc = apply(doc, { name: "add_paragraph", input: { text: '따옴표 "x"', after: null } });
    expect(renderDoc(doc)).toBe('<h1>제목 &lt;A&amp;B&gt;</h1><p>따옴표 "x"</p>');
    expect(doc.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("목록은 sub가 있는 상위 항목만 strong으로 감싸고, 표는 grid·kv 형식을 따른다", () => {
    let doc = parseBlocks("");
    doc = apply(doc, { name: "add_list", input: { items: [{ text: "결론", sub: ["근거", "적용"] }, { text: "단독", sub: [] }], after: null } });
    doc = apply(doc, { name: "add_table", input: { style: "grid", head: ["시간", "프로그램"], rows: [["09:30", "온보딩"]], after: null } });
    doc = apply(doc, { name: "add_table", input: { style: "kv", head: ["무시"], rows: [["일자", "11. 2."]], after: null } });
    expect(renderDoc(doc)).toBe(
      "<ul><li><strong>결론</strong><ul><li>근거</li><li>적용</li></ul></li><li>단독</li></ul>" +
        "<table><tr><th>시간</th><th>프로그램</th></tr><tr><td>09:30</td><td>온보딩</td></tr></table>" +
        '<table class="kv"><tr><td>일자</td><td>11. 2.</td></tr></table>',
    );
  });

  it("사진 번호를 사진 키로 바꾸고 없는 번호와 중복은 버린다", () => {
    const doc = apply(parseBlocks(""), { name: "add_photos", input: { photos: [2, 9, 1, 2, 0], after: null } });
    expect(renderDoc(doc)).toBe(`<div class="photos" data-photos="${k2} ${k1}"></div>`);
    const r = applyOp(parseBlocks(""), { name: "add_photos", input: { photos: [7], after: null } }, keys);
    expect(r.ok).toBe(false);
  });

  it("after로 위치를 정하고, start는 맨 앞이다", () => {
    let doc = base();
    doc = apply(doc, { name: "add_paragraph", input: { text: "중간", after: "b2" } });
    doc = apply(doc, { name: "add_paragraph", input: { text: "처음", after: "start" } });
    expect(doc.blocks.map((b) => b.id)).toEqual(["b7", "b1", "b2", "b6", "b3", "b4", "b5"]);
  });

  it("교체·삭제 뒤에도 손대지 않은 블록은 바이트 그대로이고 id도 유지된다", () => {
    const html = "<h1>제목</h1>\n<h2>1. 기본 정보</h2>\n<p>회사가 고친 <em>문장</em>&nbsp;</p>\n<h2>2. 성과</h2><ul><li>a</li></ul>";
    const before = parseBlocks(html);
    let doc = apply(before, { name: "replace_list", input: { id: "b5", items: [{ text: "새 성과", sub: [] }] } });
    doc = apply(doc, { name: "replace_heading", input: { id: "b4", level: 2, text: "2. 주요 성과" } });
    doc = apply(doc, { name: "delete_block", input: { id: "b1" } });
    expect(doc.blocks.map((b) => b.id)).toEqual(["b2", "b3", "b4", "b5"]);
    expect(doc.blocks[0]).toEqual(before.blocks[1]);
    expect(doc.blocks[1]).toEqual(before.blocks[2]);
    expect(renderDoc(doc)).toBe("<h2>1. 기본 정보</h2>\n<p>회사가 고친 <em>문장</em>&nbsp;</p>\n<h2>2. 주요 성과</h2><ul><li>새 성과</li></ul>");
  });

  it("없는 id, 모르는 도구, 잘못된 입력은 예외 대신 오류 문구를 돌려준다", () => {
    const doc = base();
    const bad: BlockOp[] = [
      { name: "replace_paragraph", input: { id: "b99", text: "x" } },
      { name: "delete_block", input: { id: "b99" } },
      { name: "add_paragraph", input: { text: "x", after: "b99" } },
      { name: "add_heading", input: { level: 4, text: "x", after: null } },
      { name: "add_paragraph", input: { text: "", after: null } },
      { name: "add_list", input: { items: "a", after: null } },
      { name: "add_table", input: { style: "wide", head: [], rows: [["a"]], after: null } },
      { name: "rewrite_all", input: {} },
      { name: "add_paragraph", input: null },
    ];
    for (const op of bad) {
      const r = applyOp(doc, op, keys);
      expect(r.ok, op.name).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
    expect(applyOp(doc, bad[0], keys)).toEqual({ ok: false, error: expect.stringContaining("b99") });
  });

  it("도구로 만든 HTML은 cleanReportHtml을 통과해도 바뀌지 않는다", () => {
    let doc = parseBlocks("");
    const t = `기호 & < > " '   끝`;
    doc = apply(doc, { name: "add_heading", input: { level: 1, text: t, after: null } });
    doc = apply(doc, { name: "add_heading", input: { level: 3, text: t, after: null } });
    doc = apply(doc, { name: "add_paragraph", input: { text: t, after: null } });
    doc = apply(doc, { name: "add_list", input: { items: [{ text: t, sub: [t] }, { text: t, sub: [] }], after: null } });
    doc = apply(doc, { name: "add_table", input: { style: "grid", head: [t], rows: [[t]], after: null } });
    doc = apply(doc, { name: "add_table", input: { style: "grid", head: [], rows: [[t, t]], after: null } });
    doc = apply(doc, { name: "add_table", input: { style: "kv", head: [], rows: [[t, t]], after: null } });
    doc = apply(doc, { name: "add_photos", input: { photos: [1, 3], after: null } });
    const html = renderDoc(doc);
    expect(cleanReportHtml(html)).toBe(html);
  });
});

describe("블록 문서: 수정 프롬프트용 번호", () => {
  it("블록마다 [bN]을 붙이고 사진 자리는 [사진 N]으로 바꾼다", () => {
    const doc = parseBlocks(`<h2>2. 일정</h2>\n<div class="photos" data-photos="${k3} ${k1}"></div><h2>7. 참여 사진</h2><div class="photos"></div>`);
    expect(numberedForModel(doc, keys)).toBe(
      ["[b1] <h2>2. 일정</h2>", "[b2] <p>[사진 3] [사진 1]</p>", "[b3] <h2>7. 참여 사진</h2>", "[b4] <p>(나머지 사진 자리)</p>"].join("\n"),
    );
  });
});

describe("블록 도구 정의", () => {
  const tools: Anthropic.Tool[] = BLOCK_TOOLS;

  it("추가·교체·삭제 도구를 모두 갖는다", () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_heading", "add_paragraph", "add_list", "add_table", "add_photos",
        "replace_heading", "replace_paragraph", "replace_list", "replace_table", "replace_photos",
        "delete_block",
      ].sort(),
    );
  });

  it("strict 규칙을 지킨다: 모든 object에 additionalProperties false, required에 모든 속성, 재귀·숫자 제약 없음", () => {
    const walk = (s: unknown, path: string) => {
      if (!s || typeof s !== "object") return;
      const o = s as Record<string, unknown>;
      expect(o.$ref, path).toBeUndefined();
      for (const k of ["minimum", "maximum", "minLength", "maxLength", "oneOf"]) expect(o[k], `${path}.${k}`).toBeUndefined();
      const types = ([] as unknown[]).concat(o.type ?? []);
      if (types.includes("object")) {
        expect(o.additionalProperties, path).toBe(false);
        expect([...((o.required as string[]) ?? [])].sort(), path).toEqual(Object.keys(o.properties as object).sort());
      }
      for (const [k, v] of Object.entries(o)) {
        if (k === "properties") for (const [pk, pv] of Object.entries(v as object)) walk(pv, `${path}.${pk}`);
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${k}[${i}]`));
        else if (typeof v === "object") walk(v, `${path}.${k}`);
      }
    };
    for (const t of tools) {
      expect(t.strict, t.name).toBe(true);
      expect(t.description?.length, t.name).toBeGreaterThan(0);
      expect(t.input_schema.type).toBe("object");
      walk(t.input_schema, t.name);
    }
    expect(JSON.stringify(tools)).not.toMatch(/참여 사진|기본 정보|시사점|주요 성과/);
  });
});
