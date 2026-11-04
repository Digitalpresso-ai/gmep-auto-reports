import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_TOOLS, CONTROL_TOOLS, buildAgentPrompt, buildAgentRevision } from "@/server/domain/agent";
import { BLOCK_TOOLS, numberedForModel, parseBlocks, photosHtml } from "@/server/domain/blocks";
import { EDU_LIMIT, PROPOSAL_LIMIT, buildPrompt, type PromptInput } from "@/server/domain/prompt";
import { GMEP_DAILY, type ReportTemplate } from "@/server/domain/template";

const input = (over: Partial<PromptInput> = {}): PromptInput => ({
  companyName: "테스트랩",
  traveler: "홍길동",
  businessIntro: "건설 현장 안전 관제 SaaS",
  date: "2026. 11. 2.(월)",
  proposalText: "출장 목적: 독일 시장 파트너 발굴",
  scheduleText: "09:30 온보딩\n14:00 시장 진출 세미나",
  scheduleMaterials: [{ filename: "week1.pdf", text: "11/3 피칭 연습" }],
  educationMaterials: [{ filename: "market.pdf", text: "독일 B2B 구매 구조" }],
  notes: "",
  hasScheduleImages: false,
  ...over,
});

const WEEKLY: ReportTemplate = {
  id: "weekly",
  name: "주간 현지 활동 보고",
  titleGuidance: "주간 보고 제목 (예: 11월 1주차 현지 활동 보고)",
  sections: [
    { heading: "이번 주 요약", required: true, numbered: true, guidance: ["핵심 활동 3개를 목록으로."] },
    { heading: "리스크", required: false, numbered: true, guidance: ["리스크가 자료에 있을 때만 grid 표로."] },
    { heading: "참고 자료", required: false, numbered: false, guidance: ["받은 자료 이름 목록."] },
  ],
};

afterEach(() => vi.useRealTimers());

describe("AGENT_TOOLS", () => {
  it("블록 도구 뒤에 plan_outline, finish 순서로 둔다(캐시 prefix 고정)", () => {
    expect(AGENT_TOOLS.map((t) => t.name)).toEqual([...BLOCK_TOOLS.map((t) => t.name), "plan_outline", "finish"]);
    expect(CONTROL_TOOLS.map((t) => t.name)).toEqual(["plan_outline", "finish"]);
  });

  it("모든 도구는 strict이고 모든 객체 스키마가 additionalProperties false·required 전체다", () => {
    const objects = (s: unknown): Record<string, unknown>[] => {
      if (!s || typeof s !== "object") return [];
      const o = s as Record<string, unknown>;
      const self = o.type === "object" ? [o] : [];
      return [...self, ...Object.values(o).flatMap(objects)];
    };
    for (const t of AGENT_TOOLS) {
      expect(t.strict, t.name).toBe(true);
      const objs = objects(t.input_schema);
      expect(objs.length, t.name).toBeGreaterThan(0);
      for (const o of objs) {
        expect(o.additionalProperties, t.name).toBe(false);
        expect([...(o.required as string[])].sort(), t.name).toEqual(Object.keys(o.properties as object).sort());
      }
    }
  });

  it("plan_outline은 sections[{heading, intent}], finish는 note를 받는다", () => {
    const [plan, finish] = CONTROL_TOOLS;
    const sections = (plan.input_schema.properties as unknown as Record<string, { items: { properties: object } }>).sections;
    expect(Object.keys(sections.items.properties).sort()).toEqual(["heading", "intent"]);
    expect(Object.keys(finish.input_schema.properties)).toEqual(["note"]);
  });

  it("SDK의 Tool 배열에 캐스트 없이 들어간다", () => {
    const tools: Anthropic.Tool[] = AGENT_TOOLS;
    expect(tools).toHaveLength(AGENT_TOOLS.length);
  });
});

describe("buildAgentPrompt", () => {
  it("같은 입력이면 시각이 달라도 바이트가 같다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    const a = buildAgentPrompt(input(), GMEP_DAILY);
    vi.setSystemTime(new Date("2026-11-05T18:30:00Z"));
    const b = buildAgentPrompt(structuredClone(input()), structuredClone(GMEP_DAILY));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toBe(a);
  });

  it("수정 요청·현재 문서는 prefix에 없고 수정 지시는 prefix 뒤에 붙는다", () => {
    const prompt = buildAgentPrompt(input(), GMEP_DAILY);
    const doc = numberedForModel(parseBlocks("<h1>보고서</h1><h2>1. 기본 정보</h2>"));
    const revision = buildAgentRevision({ numberedDoc: doc, previousRequests: ["성과를 줄여 줘"], request: "제목을 바꿔 줘" });
    expect(prompt).not.toContain("[b1]");
    expect(prompt).not.toContain("제목을 바꿔 줘");
    expect(prompt).not.toContain("[AI 수정]");
    expect(revision).toContain("[AI 수정]");
  });

  it("양식의 제목 지침과 섹션별 지침을 모두 담고 JSON 키 이름은 쓰지 않는다", () => {
    const prompt = buildAgentPrompt(input(), GMEP_DAILY);
    expect(prompt).toContain(GMEP_DAILY.titleGuidance);
    for (const s of GMEP_DAILY.sections) {
      expect(prompt).toContain(s.heading);
      for (const g of s.guidance) expect(prompt).toContain(g);
    }
    expect(prompt).not.toMatch(/\b(basic|schedule|education|achievements|special|insights|plans|attachments)\b/);
    expect(prompt).not.toContain("JSON");
  });

  it("공통 규칙(개조식 종결, 자료에 없는 사실 금지, 80자, 날짜 표기)을 담는다", () => {
    const prompt = buildAgentPrompt(input(), GMEP_DAILY);
    for (const s of ["개조식", "~해야 함", "지어내지 말 것", "80자 이내", '"2026. 11. 2.(월)" 형식']) expect(prompt).toContain(s);
  });

  it("자료 블록은 buildPrompt와 같은 내용·자르기 규칙이다", () => {
    const i = input({ educationMaterials: [{ filename: "a.pdf", text: "가".repeat(EDU_LIMIT + 100) }], proposalText: "나".repeat(PROPOSAL_LIMIT + 50), notes: "현지 VC 미팅" });
    const legacy = buildPrompt(i);
    const materials = legacy.slice(legacy.indexOf("[회사 정보]"), legacy.indexOf("[출력]"));
    expect(materials).toContain("…(이하 생략)");
    expect(buildAgentPrompt(i, GMEP_DAILY)).toContain(materials);
    expect(buildAgentPrompt(i, GMEP_DAILY)).not.toContain("[사진");
  });

  it("작업 방식: 계획 → 섹션별 병렬 블록 호출 → 결과 보고 교체 → finish, 본문 텍스트 출력 금지", () => {
    const prompt = buildAgentPrompt(input(), GMEP_DAILY);
    const order = ["plan_outline", "한 응답", "replace_", "finish"].map((s) => prompt.indexOf(s, prompt.indexOf("[작업 방식")));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(prompt).toContain("본문 텍스트");
    expect(prompt).not.toContain("add_photos");
    expect(prompt).toMatch(/참여 사진[^\n]*블록을 추가하지 않/);
  });

  it("섹션 구성이 다른 양식에서도 그 양식의 섹션·순서·번호 규칙만 안내한다", () => {
    const prompt = buildAgentPrompt(input(), WEEKLY);
    expect(prompt).toContain(WEEKLY.titleGuidance);
    const at = WEEKLY.sections.map((s) => prompt.indexOf(s.heading));
    expect(at.every((n) => n > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const g of WEEKLY.sections.flatMap((s) => s.guidance)) expect(prompt).toContain(g);
    for (const s of GMEP_DAILY.sections) expect(prompt).not.toContain(s.heading);
    expect(prompt).toMatch(/참고 자료[^\n]*번호 없음/);
    expect(prompt).toMatch(/이번 주 요약[^\n]*필수/);
  });
});

describe("buildAgentRevision", () => {
  const doc = numberedForModel(parseBlocks(`<h1>보고서</h1><h2>1. 기본 정보</h2><ul><li>확인</li></ul>${photosHtml([])}`));

  it("현재 문서 번호 목록, 지난 요청(번호), 이번 요청을 그대로 담는다", () => {
    const text = buildAgentRevision({ numberedDoc: doc, previousRequests: ["성과를 줄여 줘", "사진을 위로"], request: "아까 줄인 성과를 하나 더 줄여 줘" });
    expect(text).toContain(doc);
    expect(text).toContain("1. 성과를 줄여 줘\n2. 사진을 위로");
    expect(text).toContain("아까 줄인 성과를 하나 더 줄여 줘");
    expect(buildAgentRevision({ numberedDoc: doc, previousRequests: [], request: "x" })).toContain("(없음)");
  });

  it("바꿀 블록 계획 → 해당 블록만 replace/delete/add(after) → finish, 손대지 않은 블록·지난 수정 유지", () => {
    const text = buildAgentRevision({ numberedDoc: doc, previousRequests: [], request: "x" });
    for (const s of ["plan_outline", "블록 id", "replace_", "delete_block", "after", "finish", "다시 쓰지 않", "되돌리지", "아까"]) expect(text).toContain(s);
    expect(text).not.toContain("JSON");
  });

  // 2026-11-04 사용자 결정: 요청이 가리키는 블록은 회사가 직접 고친 문장이 있어도 AI가 덮어쓴다
  it("직접 고친 문장을 보존하라고 지시하지 않고, 요청한 블록은 직접 고친 문장까지 덮어써도 된다고 지시한다", () => {
    const text = buildAgentRevision({ numberedDoc: doc, previousRequests: [], request: "x" });
    expect(text).not.toMatch(/직접 고친 문장은[^\n]*바꾸지 말/);
    expect(text).toMatch(/직접 고친 문장[^\n]*덮어/);
  });
});
