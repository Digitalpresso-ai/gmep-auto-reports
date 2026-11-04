// 보고서 생성·수정 ReAct 루프(Plan → Act → Observe → Finish). 루프 제어는 LangGraph StateGraph, 모델 호출은 ai.ts streamModel이 한다.
// 생성은 빈 문서, 수정은 parseBlocks(body_html)에서 시작한다. 부분 문서는 저장하지 않는다. 저장·사용량 기록은 호출한 쪽이 결과로 한다.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { Annotation, END, GraphRecursionError, START, StateGraph } from "@langchain/langgraph";
import { ModelStreamError, streamModel, type ModelRequest, type StreamUsage, type ToolUseEvent } from "./ai";
import { applyOp, renderDoc, type BlockDoc } from "./domain/blocks";
import { checkBlock, finalChecks, planIssues } from "./domain/observe";
import { withRestPhotos, type ReportTemplate } from "./domain/template";

export type PlanSection = { heading: string; intent: string };
export type TurnUsage = StreamUsage & { model: string; latencyMs: number; firstToolMs: number | null };

export type AgentEvent =
  | { type: "plan"; sections: PlanSection[] }
  | { type: "block"; op: string; id: string; html: string }
  /** fallback으로 이 턴의 앞선 블록이 무효가 됐다. html은 되돌린 문서 전체다. */
  | { type: "reset"; html: string }
  | { type: "turn"; n: number; usage: TurnUsage }
  | { type: "issues"; list: string[] };

export type AgentFailure = "turn_limit" | "deadline" | "refused" | "max_tokens" | "ai_failed";

export type AgentResult =
  | { ok: true; html: string; turns: number; usages: TurnUsage[]; latencyMs: number; firstBlockMs: number | null; issues: string[] }
  /** 실패해도 쓴 토큰은 기록해야 하므로 usages를 돌려준다(AI-12). */
  | { ok: false; reason: AgentFailure; usages: TurnUsage[] };

export type AgentOptions = {
  model: string;
  prompt: string;
  followUp?: string;
  images: ModelRequest["images"];
  template: ReportTemplate;
  photoKeys: string[];
  doc: BlockDoc;
  limits?: { maxTurns?: number; deadlineMs?: number };
  onEvent: (e: AgentEvent) => void;
  signal?: AbortSignal;
};

const MAX_TURNS = 8;
// Vercel 함수 300초 안에서 저장·응답까지 끝낼 여유를 둔다
const DEADLINE_MS = 240_000;

/** 한 턴에 받은 tool 호출과 그 처리 결과. tool_result는 턴이 끝난 뒤 이 목록에서 만든다. */
type Call =
  | { id: string; name: string; kind: "invalid"; error: string }
  | { id: string; name: string; kind: "block"; ok: true; html: string; blockId: string }
  | { id: string; name: string; kind: "block"; ok: false; error: string }
  | { id: string; name: string; kind: "plan"; sections: PlanSection[] }
  | { id: string; name: "finish"; kind: "finish" };

type Outcome = { ok: true; issues: string[] } | { ok: false; reason: AgentFailure };

const replace = <T>(initial: () => T) => Annotation<T>({ reducer: (_prev, next) => next, default: initial });
const append = <T>() => Annotation<T[]>({ reducer: (prev, next) => prev.concat(next), default: () => [] });

const AgentState = Annotation.Root({
  /** 첫 user 메시지 뒤의 대화. 턴마다 assistant와 tool_result user 메시지를 덧붙인다. */
  turns: append<Anthropic.Beta.BetaMessageParam>(),
  usages: append<TurnUsage>(),
  doc: replace<BlockDoc>(() => ({ blocks: [] })),
  /** 마친 모델 턴 수. */
  n: replace(() => 0),
  /** 최종 검사에서 문제가 나온 횟수. 2회째면 문제를 남긴 채 끝낸다. */
  failedChecks: replace(() => 0),
  calls: replace<Call[]>(() => []),
  stopReason: replace<string | null>(() => null),
  firstBlockMs: replace<number | null>(() => null),
  outcome: replace<Outcome | null>(() => null),
});
type State = typeof AgentState.State;

function planSections(input: unknown): PlanSection[] | null {
  const s = (input as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(s)) return null;
  const ok = s.every((x) => x && typeof x === "object" && typeof (x as PlanSection).heading === "string");
  return ok ? s.map((x: PlanSection) => ({ heading: x.heading, intent: typeof x.intent === "string" ? x.intent : "" })) : null;
}

const result = (id: string, content: string, isError = false): Anthropic.Beta.BetaToolResultBlockParam => ({
  type: "tool_result",
  tool_use_id: id,
  content,
  ...(isError ? { is_error: true } : {}),
});

const issueText = (list: string[]) => `다음 문제를 고친 뒤 finish를 다시 호출하세요.\n${list.map((x) => `- ${x}`).join("\n")}`;

export async function runReportAgent(o: AgentOptions): Promise<AgentResult> {
  const started = Date.now();
  const maxTurns = o.limits?.maxTurns ?? MAX_TURNS;
  const deadline = started + (o.limits?.deadlineMs ?? DEADLINE_MS);
  // 그래프가 예외로 끝나도 쓴 토큰은 돌려줘야 하므로 상태와 별도로 모은다
  const spent: TurnUsage[] = [];

  const model = async (s: State): Promise<Partial<State>> => {
    if (s.n >= maxTurns) return { outcome: { ok: false, reason: "turn_limit" } };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { outcome: { ok: false, reason: "deadline" } };

    const timeout = AbortSignal.timeout(remaining);
    const signal = o.signal ? AbortSignal.any([o.signal, timeout]) : timeout;
    const turnStart = s.doc;
    let doc = s.doc;
    let calls: Call[] = [];
    let firstBlockMs = s.firstBlockMs;

    // 블록은 tool_use 하나가 끝날 때마다 바로 적용하고 이벤트로 보낸다. 턴 끝까지 기다리면 한 응답에 블록 여러 개를 낼 때
    // 미리보기가 응답 전체(수십 초)를 기다린다. tool_result는 모든 호출에 하나씩이어야 하므로 턴이 끝난 뒤 calls에서 만든다.
    const onToolUse = (t: ToolUseEvent) => {
      if (t.error !== undefined || t.input === null) {
        calls.push({ id: t.id, name: t.name, kind: "invalid", error: t.error ?? "입력을 읽지 못했습니다." });
        return;
      }
      if (t.name === "plan_outline") {
        const sections = planSections(t.input);
        if (!sections) return void calls.push({ id: t.id, name: t.name, kind: "invalid", error: "sections는 {heading, intent} 배열이어야 합니다." });
        calls.push({ id: t.id, name: t.name, kind: "plan", sections });
        o.onEvent({ type: "plan", sections });
        return;
      }
      if (t.name === "finish") return void calls.push({ id: t.id, name: "finish", kind: "finish" });
      const r = applyOp(doc, { name: t.name, input: t.input }, o.photoKeys);
      if (!r.ok) return void calls.push({ id: t.id, name: t.name, kind: "block", ok: false, error: r.error });
      doc = r.doc;
      const html = doc.blocks.find((b) => b.id === r.id)?.html ?? "";
      calls.push({ id: t.id, name: t.name, kind: "block", ok: true, html, blockId: r.id });
      firstBlockMs ??= Date.now() - started;
      o.onEvent({ type: "block", op: t.name, id: r.id, html });
    };
    // 이어받는 모델은 앞의 tool_use를 보지 못하므로(streamModel이 content에서도 뺀다) 이 턴의 적용을 되돌린다
    const onFallback = () => {
      doc = turnStart;
      calls = [];
      o.onEvent({ type: "reset", html: renderDoc(doc) });
    };

    let res;
    try {
      res = await streamModel({ model: o.model, prompt: o.prompt, images: o.images, followUp: o.followUp, turns: s.turns, onFallback, signal }, onToolUse);
    } catch (err) {
      const partial = err instanceof ModelStreamError && err.usage ? [{ ...err.usage, model: err.model ?? o.model, latencyMs: Date.now() - started, firstToolMs: null }] : [];
      spent.push(...partial);
      return { usages: partial, outcome: { ok: false, reason: timeout.aborted ? "deadline" : "ai_failed" } };
    }
    const usage: TurnUsage = { ...res.usage, model: res.model, latencyMs: res.latencyMs, firstToolMs: res.firstToolMs };
    spent.push(usage);
    o.onEvent({ type: "turn", n: s.n + 1, usage });

    // 잘렸거나 거절된 턴의 tool 입력은 믿을 수 없다. 이 턴에 적용한 블록은 결과에 쓰지 않고 실패로 끝낸다.
    if (res.stopReason === "max_tokens") return { usages: [usage], n: s.n + 1, outcome: { ok: false, reason: "max_tokens" } };
    if (res.stopReason === "refusal") return { usages: [usage], n: s.n + 1, outcome: { ok: false, reason: "refused" } };

    return { usages: [usage], n: s.n + 1, turns: [{ role: "assistant", content: res.content }], doc, calls, stopReason: res.stopReason, firstBlockMs };
  };

  const tools = async (s: State): Promise<Partial<State>> => {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    let issues: string[] | null = null;
    const check = () => {
      const list = finalChecks(o.template, s.doc, o.photoKeys);
      if (list.length) o.onEvent({ type: "issues", list });
      return list;
    };
    for (const c of s.calls) {
      if (c.kind === "invalid") blocks.push(result(c.id, c.error, true));
      else if (c.kind === "plan") {
        const list = planIssues(o.template, c.sections);
        blocks.push(result(c.id, list.length ? `계획에 문제가 있습니다.\n${list.map((x) => `- ${x}`).join("\n")}` : "ok"));
      } else if (c.kind === "finish") {
        issues = check();
        blocks.push(result(c.id, issues.length ? issueText(issues) : "ok"));
      } else if (!c.ok) blocks.push(result(c.id, c.error, true));
      else {
        const v = c.name === "delete_block" ? [] : checkBlock(c.html);
        blocks.push(result(c.id, v.length ? `ok id=${c.blockId}\n고칠 점:\n${v.map((x) => `- ${x}`).join("\n")}` : `ok id=${c.blockId}`));
      }
    }
    // finish 없이 말로 끝낸 턴도 같은 최종 검사를 거친다
    if (issues === null && s.stopReason === "end_turn") {
      issues = check();
      if (issues.length) blocks.push({ type: "text", text: issueText(issues) });
    }
    const failedChecks = s.failedChecks + (issues?.length ? 1 : 0);
    if (issues !== null && (!issues.length || failedChecks >= 2)) return { failedChecks, calls: [], outcome: { ok: true, issues } };
    if (!blocks.length) blocks.push({ type: "text", text: "작업을 이어서 하고, 다 쓰면 finish를 호출하세요." });
    return { failedChecks, calls: [], turns: [{ role: "user", content: blocks }] };
  };

  const graph = new StateGraph(AgentState)
    .addNode("model", model)
    .addNode("tools", tools)
    .addEdge(START, "model")
    .addConditionalEdges("model", (s: State) => (s.outcome ? END : "tools"))
    .addConditionalEdges("tools", (s: State) => (s.outcome ? END : "model"))
    .compile();

  let final: State;
  try {
    // 턴마다 model·tools 두 단계이고, 한도 판정을 위해 model 단계가 한 번 더 돈다
    final = await graph.invoke({ doc: o.doc }, { recursionLimit: maxTurns * 2 + 2 });
  } catch (err) {
    if (err instanceof GraphRecursionError) return { ok: false, reason: "turn_limit", usages: spent };
    return { ok: false, reason: "ai_failed", usages: spent };
  }
  const out = final.outcome;
  if (!out || !out.ok) return { ok: false, reason: out?.reason ?? "ai_failed", usages: final.usages };
  // 나머지 사진 자리는 빈 문서에서 만든 생성 결과에만 붙인다. 수정은 회사가 지운 "참여 사진" 섹션을 요청 없이 되살리면 안 되므로 그대로 둔다.
  const doc = o.doc.blocks.length === 0 ? withRestPhotos(o.template, final.doc) : final.doc;
  return {
    ok: true,
    html: renderDoc(doc),
    turns: final.n,
    usages: final.usages,
    latencyMs: Date.now() - started,
    firstBlockMs: final.firstBlockMs,
    issues: out.issues,
  };
}
