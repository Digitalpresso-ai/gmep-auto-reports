// 평가가 바꿔 끼우는 생성기. 입력(자료·사진 키)은 같고 "프롬프트 → 모델 호출 → 보고서 HTML"만 방식마다 다르다.
// EVAL_MODE로 고른다. 지금 운영 방식은 "json"이고, 블록 편집 tool 방식은 "blocks"로 추가할 자리다.
import { callModel, type ModelRequest } from "@/server/ai";
import { buildPrompt, buildRevisionFollowUp, htmlWithPhotoNumbers, type PromptInput } from "@/server/domain/prompt";
import { REPORT_JSON_SCHEMA, normalizeReport, parseModelJson, renderReportHtml, type Report } from "@/server/domain/report";
import { buildAgentPrompt, buildAgentRevision } from "@/server/domain/agent";
import { numberedForModel, parseBlocks, type BlockDoc } from "@/server/domain/blocks";
import { GMEP_DAILY } from "@/server/domain/template";
import { runReportAgent, type AgentEvent } from "@/server/report-agent";
import { addUsage, costUsd, type Usage } from "./summary";

export type Mode = "json" | "blocks";

export type GenerateInput = {
  model: string;
  promptInput: PromptInput;
  scheduleImages: ModelRequest["images"];
  /** photoKeys[i]가 프롬프트의 [사진 i+1]이다. */
  photoKeys: string[];
};
export type ReviseInput = GenerateInput & { currentHtml: string; previousRequests: string[]; request: string };

export type GenMeta = Usage & {
  mode: Mode;
  model: string;
  stopReason: string | null;
  /** 요청부터 마지막 응답까지(재시도 포함) 사용자가 기다린 시간 */
  latencyMs: number;
  costUsd: number;
  attempts: number;
  parseOk: boolean;
  /** 첫 블록이 미리보기에 그려질 때까지의 시간. 한 번에 받는 json 방식은 null이다. */
  firstBlockMs: number | null;
  /** 모델 호출 턴 수(tool 왕복). json 방식은 null이다. */
  turns: number | null;
  attemptsDetail: (Usage & { latencyMs: number; stopReason: string | null; parseOk: boolean })[];
};

/**
 * html은 저장 형식(body_html)과 같은 HTML 부분집합이다. 파싱에 실패하면 "".
 * files는 실행 폴더에 그대로 쓸 산출물이다. judge.eval.ts가 prompt.txt의 "[회사 정보]"~"[출력]" 구간을 입력 자료로 읽는다.
 */
export type GenOutput = { html: string; report: Report | null; meta: GenMeta; files: Record<string, string> };

export type Generator = { mode: Mode; generate: (i: GenerateInput) => Promise<GenOutput>; revise: (i: ReviseInput) => Promise<GenOutput> };

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

// src/server/generate.ts callForReport와 같은 흐름: 1시간 캐시, 구조화 출력, 파싱 실패 시 1회 재시도(AI-5).
async function callJson(req: ModelRequest, photoKeys: string[]): Promise<GenOutput> {
  const started = Date.now();
  const detail: GenMeta["attemptsDetail"] = [];
  let last: Awaited<ReturnType<typeof callModel>> | undefined;
  let report: Report | null = null;
  const responses: string[] = [];
  for (let attempt = 0; attempt < 2 && !report; attempt++) {
    const t = Date.now();
    last = await callModel(req);
    const parsed = parseModelJson(last.text);
    report = parsed ? normalizeReport(parsed) : null;
    responses.push(last.text);
    detail.push({
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      cacheReadTokens: last.cacheReadTokens,
      cacheWriteTokens: last.cacheWriteTokens,
      latencyMs: Date.now() - t,
      stopReason: last.stopReason,
      parseOk: report !== null,
    });
  }
  const usage = detail.reduce<Usage>((u, d) => addUsage(u, d), ZERO);
  const files: Record<string, string> = {
    "prompt.txt": req.prompt + (req.followUp ?? ""),
    "response.txt": responses.join("\n\n----- 재시도 -----\n\n"),
  };
  if (report) files["report.json"] = JSON.stringify(report, null, 1);
  return {
    html: report ? renderReportHtml(report, photoKeys) : "",
    report,
    files,
    meta: {
      mode: "json",
      model: last!.model,
      stopReason: last!.stopReason,
      ...usage,
      latencyMs: Date.now() - started,
      costUsd: costUsd(usage),
      attempts: detail.length,
      parseOk: report !== null,
      firstBlockMs: null,
      turns: null,
      attemptsDetail: detail,
    },
  };
}

function baseRequest(i: GenerateInput): ModelRequest {
  return { model: i.model, prompt: buildPrompt(i.promptInput), images: i.scheduleImages, cacheTtl: "1h", jsonSchema: REPORT_JSON_SCHEMA };
}

export const jsonGenerator: Generator = {
  mode: "json",
  generate: (i) => callJson(baseRequest(i), i.photoKeys),
  // src/server/generate.ts reviseReport와 같다: 생성 프롬프트(캐시 대상) 뒤에 수정 지시를 붙인다(FUNC-10, AI-13)
  revise: (i) =>
    callJson(
      {
        ...baseRequest(i),
        followUp: buildRevisionFollowUp({ currentHtml: htmlWithPhotoNumbers(i.currentHtml, i.photoKeys), previousRequests: i.previousRequests, request: i.request }),
      },
      i.photoKeys,
    ),
};

// src/server/report-agent.ts의 ReAct 루프를 그대로 돌린다. 이벤트마다 시작 기준 ms를 남겨 화면에 블록이 보이는 시점을 잰다.
// 이후 턴의 5분 캐시 쓰기도 costUsd에서는 1시간 단가로 계산되므로 비용은 실제보다 조금 크게 나온다.
async function callBlocks(i: GenerateInput, doc: BlockDoc, followUp?: string): Promise<GenOutput> {
  const started = Date.now();
  const prompt = buildAgentPrompt(i.promptInput, GMEP_DAILY);
  const events: (AgentEvent & { ms: number })[] = [];
  const r = await runReportAgent({
    model: i.model,
    prompt,
    followUp,
    images: i.scheduleImages,
    template: GMEP_DAILY,
    photoKeys: i.photoKeys,
    doc,
    onEvent: (e) => events.push({ ...e, ms: Date.now() - started }),
  });
  const detail: GenMeta["attemptsDetail"] = r.usages.map((u) => ({
    inputTokens: u.input,
    outputTokens: u.output,
    cacheReadTokens: u.cacheRead,
    cacheWriteTokens: u.cacheWrite,
    latencyMs: u.latencyMs,
    stopReason: null,
    parseOk: true,
  }));
  const usage = detail.reduce<Usage>((u, d) => addUsage(u, d), ZERO);
  const firstBlock = events.find((e) => e.type === "block");
  return {
    html: r.ok ? r.html : "",
    report: null,
    files: {
      "prompt.txt": prompt + (followUp ?? ""),
      "events.ndjson": events.map((e) => JSON.stringify(e)).join("\n"),
      "result.json": JSON.stringify(r.ok ? { ...r, html: undefined } : r, null, 1),
    },
    meta: {
      mode: "blocks",
      model: r.usages.at(-1)?.model ?? i.model,
      stopReason: r.ok ? "finish" : r.reason,
      ...usage,
      latencyMs: Date.now() - started,
      costUsd: costUsd(usage),
      attempts: 1,
      parseOk: r.ok,
      firstBlockMs: firstBlock?.ms ?? null,
      turns: r.usages.length,
      attemptsDetail: detail,
    },
  };
}

export const blocksGenerator: Generator = {
  mode: "blocks",
  generate: (i) => callBlocks(i, { blocks: [] }),
  revise: (i) => {
    const doc = parseBlocks(i.currentHtml);
    return callBlocks(i, doc, buildAgentRevision({ numberedDoc: numberedForModel(doc, i.photoKeys), previousRequests: i.previousRequests, request: i.request }));
  },
};

export function pickGenerator(mode = process.env.EVAL_MODE ?? "json"): Generator {
  if (mode === "json") return jsonGenerator;
  if (mode === "blocks") return blocksGenerator;
  throw new Error(`EVAL_MODE=${mode} 생성기가 없다(json, blocks)`);
}
