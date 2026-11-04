"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { assignPhotos, parsePhotoKeys, photoKey } from "@/lib/photo-layout";
import { formatTime, zonedToday } from "@/lib/time-zone";
import { ApiError, apiStream, api, errorText, fmtDate } from "../api";
import { useDialog } from "../dialog";
import { imageForm, toJpeg } from "../files";
import type { DayView, PhotoRef, Profile, ReportDoc, Revision, Usage } from "./types";

type DraftPatch = { scheduleText?: string; selectedPhotos?: PhotoRef[]; notes?: string };
type Status = { kind: "err" | "ok" | "info" | "warn"; text: string; retry?: boolean } | null;

const AUTO_SELECT_MAX = 4;
const sameRef = (a: PhotoRef, b: PhotoRef) => a.source === b.source && a.id === b.id;

// H0 작성 화면 → E1/E2 입력 → G1 생성 중 / G2 실패 / Q1 한도 소진 → R1 미리보기·편집 / R2 저장 실패 → V1 AI 수정 → W1 Word
// 휴대폰에서 한 화면에 한 가지 일만 하도록 입력 화면과 수정 대화 화면을 나누고, 보고서 본문은 문서 시트를 열어야 보인다.
export function Workspace({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(() => zonedToday());
  const [day, setDay] = useState<DayView | null>(null);
  const [loadError, setLoadError] = useState("");
  const ui = useDialog();
  const [schedule, setSchedule] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<PhotoRef[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [report, setReport] = useState<ReportDoc | null>(null);
  const [generating, setGenerating] = useState(false);
  // 생성 응답을 받는 중이라 문서 시트에 완성된 섹션만 보이는 상태
  const [streaming, setStreaming] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [reviseText, setReviseText] = useState("");
  const [reviseStatus, setReviseStatus] = useState<Status>(null);
  const [pendingRequest, setPendingRequest] = useState("");
  const [stage, setStage] = useState<"input" | "chat">("input");
  const [docOpen, setDocOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const [draftSaving, setDraftSaving] = useState<"" | "saving" | "saved" | "error">("");
  const [reportSave, setReportSave] = useState<{ text: string; err: boolean }>({ text: "", err: false });
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [uploading, setUploading] = useState("");

  const pendingDraft = useRef<{ date: string; patch: DraftPatch } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportDirty = useRef(false);
  // 보내는 중인 저장 요청 수. 끝나기 전에 창을 닫으면 저장이 끊길 수 있어 떠나기 확인을 띄운다.
  const savingCount = useRef(0);
  const reportEl = useRef<HTMLDivElement>(null);

  // ---------- 초안 자동 저장(FUNC-17) ----------
  const flushDraft = useCallback(async () => {
    clearTimeout(draftTimer.current);
    const p = pendingDraft.current;
    if (!p) return true;
    pendingDraft.current = null;
    setDraftSaving("saving");
    try {
      savingCount.current++;
      try {
        await api(`/api/days/${p.date}/draft`, { method: "PUT", body: p.patch });
      } finally {
        savingCount.current--;
      }
      setDraftSaving("saved");
      return true;
    } catch (e) {
      // 실패한 변경은 다음 저장에 다시 싣는다
      const later = pendingDraft.current as { date: string; patch: DraftPatch } | null;
      const laterPatch = later?.date === p.date ? later.patch : {};
      let patch: DraftPatch = { ...p.patch, ...laterPatch };
      let reloaded = false;
      // 화면을 연 뒤 관리자가 사진을 지우면 같은 선택을 다시 보내도 계속 거부된다. 서버가 정리한 선택으로 바꾸고 사진 선택은 다시 보내지 않는다.
      if (e instanceof ApiError && e.status === 400 && p.patch.selectedPhotos && !laterPatch.selectedPhotos) {
        try {
          const v = await api<DayView>(`/api/days/${p.date}`);
          setDay(v);
          setSelected(v.selectedPhotos);
          patch = { ...patch };
          delete patch.selectedPhotos;
          reloaded = true;
        } catch {}
      }
      pendingDraft.current = Object.keys(patch).length ? { date: p.date, patch } : null;
      setDraftSaving("error");
      setStatus({ kind: "err", text: `입력 내용을 저장하지 못했습니다: ${errorText(e)}${reloaded ? "\n사진 선택을 다시 불러왔습니다. 사진을 확인한 뒤 다시 시도해 주세요." : ""}` });
      return false;
    }
  }, []);

  const queueDraft = useCallback(
    (patch: DraftPatch, delay = 800) => {
      const cur = pendingDraft.current;
      pendingDraft.current = { date, patch: { ...(cur?.date === date ? cur.patch : {}), ...patch } };
      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(flushDraft, delay);
    },
    [date, flushDraft],
  );

  // ---------- 보고서 직접 수정 저장(FUNC-9) ----------
  const flushReport = useCallback(async () => {
    clearTimeout(reportTimer.current);
    if (!reportDirty.current || !reportEl.current) return true;
    const clone = reportEl.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".photos").forEach((p) => (p.innerHTML = ""));
    setReportSave({ text: "저장 중…", err: false });
    try {
      savingCount.current++;
      try {
        await api(`/api/days/${date}/report`, { method: "PUT", body: { bodyHtml: clone.innerHTML } });
      } finally {
        savingCount.current--;
      }
      reportDirty.current = false;
      setReportSave({ text: `저장됨 ${formatTime(new Date())}`, err: false });
      return true;
    } catch {
      setReportSave({ text: "저장하지 못했습니다. 고친 내용은 화면에 남아 있습니다", err: true });
      return false;
    }
  }, [date]);

  // ---------- 날짜별 불러오기(H0) ----------
  const load = useCallback(async (d: string) => {
    const v = await api<DayView>(`/api/days/${d}`);
    let sel = v.selectedPhotos;
    if (!v.draftSaved && sel.length === 0 && v.photos.length > 0 && v.photos.length <= AUTO_SELECT_MAX) {
      sel = v.photos.map(({ source, id }) => ({ source, id }));
      await api(`/api/days/${d}/draft`, { method: "PUT", body: { selectedPhotos: sel } });
    }
    const r = v.report ? await api<ReportDoc>(`/api/days/${d}/report`) : null;
    const revs = r ? (await api<{ revisions: Revision[] }>(`/api/days/${d}/report/revisions`)).revisions : [];
    return { v, sel, r, revs };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(date).then(
      ({ v, sel, r, revs }) => {
        if (cancelled) return;
        setRevisions(revs);
        setDay(v);
        setSchedule(v.schedule.text);
        setNotes(v.notes);
        setSelected(sel);
        setUsage(v.usage);
        setReport(r);
        // 다시 접속하거나 날짜를 바꾸면 보고서가 있어도 입력 화면에서 시작한다. 수정 대화는 '수정 대화로 돌아가기'로 연다.
        setStage("input");
        setLoadError("");
      },
      (e) => !cancelled && setLoadError(errorText(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [date, load]);

  async function changeDate(next: string) {
    if (!next || next === date) return;
    await Promise.all([flushDraft(), flushReport()]);
    setDay(null);
    setReport(null);
    setRevisions([]);
    setReviseText("");
    setReviseStatus(null);
    setStatus(null);
    setDocOpen(false);
    setReportSave({ text: "", err: false });
    setDraftSaving("");
    setDate(next);
  }

  // ---------- 미리보기에 보고서·사진 넣기 ----------
  const photoUrl = useCallback((key: string) => day?.photos.find((p) => photoKey(p) === key)?.url ?? "", [day]);

  // 고른 사진은 모두 참여 사진 자리에 한 줄에 한 장씩 넣는다(PHOTO-2). 참여 사진 자리가 비면 그 제목을 숨긴다.
  const fillPhotos = useCallback(() => {
    const boxes = [...(reportEl.current?.querySelectorAll<HTMLElement>(".photos") ?? [])];
    if (!boxes.length) return;
    const assigned = assignPhotos(boxes.map((b) => parsePhotoKeys(b.dataset.photos)), selected.map(photoKey));
    boxes.forEach((box, i) => {
      box.contentEditable = "false";
      box.innerHTML = "";
      for (const key of assigned[i]) {
        const img = document.createElement("img");
        img.src = photoUrl(key);
        img.alt = "";
        box.append(img);
      }
      const general = box.dataset.photos === undefined;
      const heading = box.previousElementSibling;
      if (general && !selected.length) {
        const p = document.createElement("p");
        p.textContent = "(입력 화면에서 고른 사진이 여기에 들어갑니다)";
        box.append(p);
      }
      if (general && heading instanceof HTMLElement && heading.tagName === "H2") heading.hidden = selected.length > 0 && !assigned[i].length;
    });
  }, [selected, photoUrl]);

  useEffect(() => {
    if (!reportEl.current) return;
    reportEl.current.innerHTML = report?.bodyHtml ?? "";
    reportDirty.current = false;
    fillPhotos();
    // 사진 선택이 바뀔 때마다 본문을 다시 넣으면 직접 고친 내용이 사라지므로 보고서가 바뀔 때만 넣는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  useEffect(fillPhotos, [fillPhotos]);

  // 생성과 AI 수정은 서버가 회사별로 하나만 받으므로 둘 중 하나가 도는 동안 입력을 막는다
  const aiBusy = generating || revising;
  // 사진 업로드는 시작할 때의 날짜와 선택으로 끝난 뒤 화면을 다시 그린다. 그동안 날짜 이동·사진 선택·삭제를 막아 다른 날짜 화면에 섞이거나 선택이 덮어써지지 않게 한다.
  const photoBusy = aiBusy || Boolean(uploading);

  useEffect(() => {
    if (!aiBusy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [aiBusy]);

  // 창을 닫기 전에 남은 저장을 보낸다
  useEffect(() => {
    const h = () => {
      flushDraft();
      flushReport();
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [flushDraft, flushReport]);

  // 저장이 남아 있으면 바로 저장을 보내고, 브라우저의 떠나기 확인 창으로 끝날 때까지 기다리게 한다
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!pendingDraft.current && !reportDirty.current && savingCount.current === 0 && !aiBusy) return;
      flushDraft();
      flushReport();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flushDraft, flushReport, aiBusy]);

  // ---------- 사진(FUNC-6, SHARED-3) ----------
  function toggle(ref: PhotoRef) {
    const next = selected.some((s) => sameRef(s, ref)) ? selected.filter((s) => !sameRef(s, ref)) : [...selected, ref];
    setSelected(next);
    queueDraft({ selectedPhotos: next }, 400);
  }

  function selectAll(on: boolean) {
    const next = on ? [...selected, ...(day?.photos ?? []).filter((p) => !selected.some((s) => sameRef(s, p))).map(({ source, id }) => ({ source, id }))] : [];
    setSelected(next);
    queueDraft({ selectedPhotos: next }, 400);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    const added: PhotoRef[] = [];
    const failed: string[] = [];
    for (const [i, f] of list.entries()) {
      setUploading(`사진 올리는 중… (${i + 1}/${list.length})`);
      try {
        const img = await toJpeg(f, 1100);
        const { id } = await api<{ id: string }>(`/api/days/${date}/photos`, { form: imageForm(img, f.name) });
        added.push({ source: "company", id });
      } catch (e) {
        failed.push(`${f.name}: ${errorText(e)}`);
      }
    }
    setUploading("");
    try {
      await flushDraft();
      const v = await api<DayView>(`/api/days/${date}`);
      setDay(v);
      const next = v.photos.length <= AUTO_SELECT_MAX ? [...selected, ...added] : selected;
      if (next !== selected) {
        setSelected(next);
        queueDraft({ selectedPhotos: next }, 0);
      }
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    }
    if (failed.length) setStatus({ kind: "err", text: `올리지 못한 사진:\n${failed.join("\n")}` });
    else if (added.length) setStatus({ kind: "info", text: `사진 ${added.length}장을 추가했습니다. 보고서에 넣을 사진을 눌러서 고르세요.` });
  }

  async function removePhoto(id: string) {
    if (!(await ui.confirm("이 사진을 지울까요?", "삭제"))) return;
    try {
      await flushDraft();
      await api(`/api/days/${date}/photos/${id}`, { method: "DELETE" });
      const v = await api<DayView>(`/api/days/${date}`);
      setDay(v);
      setSelected(v.selectedPhotos);
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
      // 서버가 DB에서 지운 뒤 Storage 삭제에서 실패할 수 있다. 화면에 지워진 사진이 남지 않게 다시 불러온다.
      api<DayView>(`/api/days/${date}`).then(
        (v) => (setDay(v), setSelected(v.selectedPhotos)),
        () => {},
      );
    }
  }

  // ---------- 생성(FUNC-8, FUNC-18, AI-9) ----------
  const limitReached = usage ? usage.generateRemaining <= 0 || usage.tokenLimitReached : false;
  const hasSchedule = Boolean(schedule.trim() || day?.scheduleImages.length || day?.materials.some((m) => m.kind === "schedule"));

  function startGenerate() {
    if (!profile.proposalFilename) return setStatus({ kind: "err", text: "회사 정보에서 사전 출장 기안문을 먼저 올려 주세요." });
    if (!hasSchedule) return setStatus({ kind: "err", text: "운영사 제공 일정을 입력해 주세요." });
    if (report) setConfirmOverwrite(true);
    else generate(false);
  }

  async function generate(overwrite: boolean) {
    setConfirmOverwrite(false);
    if (!(await flushDraft())) return;
    // 생성 중에는 서버가 직접 편집 저장을 409로 거부한다. 다시 만들기가 실패하면 지금 본문으로 돌아와야 하므로 남은 편집을 먼저 저장한다.
    if (!(await flushReport())) return setStatus({ kind: "err", text: "직접 고친 내용을 저장하지 못해 보고서를 다시 만들지 않았습니다. 다시 저장한 뒤 시도해 주세요." });
    // report 상태는 직접 편집을 담지 않으므로, 실패했을 때 되돌릴 본문은 화면에서 뜬다(사진은 되돌린 뒤 다시 채운다)
    let before: string | null = null;
    setGenerating(true);
    setElapsed(0);
    setStatus(null);
    try {
      const got: { done?: { report: ReportDoc; usage: Usage } } = {};
      // 섹션이 끝날 때마다 본문 전체가 온다. report 상태를 바꾸지 않고 DOM만 바꿔야 완료 전 본문이 저장·사진 채우기에 쓰이지 않는다.
      await apiStream(`/api/days/${date}/report`, { overwrite }, (line) => {
        // start는 사전 검사(이미 있음·한도·진행 중)를 통과한 뒤에만 온다. 그때 시트를 열어야 거절될 때 시트가 깜빡이지 않는다.
        if (line.type === "start") {
          before = reportEl.current?.innerHTML ?? null;
          setStreaming(true);
          setDocOpen(true);
          if (reportEl.current) reportEl.current.innerHTML = "";
        } else if (line.type === "partial" && reportEl.current) reportEl.current.innerHTML = String(line.html ?? "");
        else if (line.type === "reset" && reportEl.current) reportEl.current.innerHTML = "";
        else if (line.type === "done") got.done = line as unknown as { report: ReportDoc; usage: Usage };
        else if (line.type === "error") throw new ApiError(502, String(line.code ?? "ai_failed"), String(line.message ?? "보고서를 만들지 못했습니다"));
      });
      const r = got.done;
      if (!r) throw new ApiError(0, "network", "연결이 끊겼습니다. 보고서는 서버에서 계속 만들어지니 잠시 뒤 다시 열어 주세요");
      setUsage(r.usage);
      setReport(r.report);
      setRevisions([]);
      setReviseStatus(null);
      setDay((d) => (d ? { ...d, report: { title: r.report.title, updatedAt: r.report.updatedAt } } : d));
      setReportSave({ text: "저장됨", err: false });
      setStage("chat");
    } catch (e) {
      // 실패하면 서버의 보고서는 그대로다. 그리던 섹션을 지우고 생성 직전 화면(저장한 직접 편집 포함)으로 되돌린다.
      if (before !== null && reportEl.current) {
        reportEl.current.innerHTML = before;
        fillPhotos();
      }
      if (!report) setDocOpen(false);
      if (e instanceof ApiError && e.code === "limit_reached") setUsage((u) => (u ? { ...u, generateRemaining: 0 } : u));
      setStatus({ kind: "err", text: errorText(e), retry: e instanceof ApiError && e.status !== 429 && e.code !== "report_exists" });
    } finally {
      setStreaming(false);
      setGenerating(false);
    }
  }

  // ---------- AI 수정(FUNC-10) ----------
  const reviseLimitReached = usage ? usage.reviseRemaining <= 0 || usage.tokenLimitReached : false;

  async function revise() {
    const request = reviseText.trim();
    if (!request || aiBusy) return;
    // 서버는 저장된 보고서를 고치므로 직접 고친 내용을 먼저 저장한다
    if (!(await flushReport())) return setReviseStatus({ kind: "err", text: "직접 고친 내용을 저장하지 못해 AI 수정을 보내지 않았습니다. 다시 저장한 뒤 시도해 주세요." });
    setRevising(true);
    setElapsed(0);
    setReviseStatus(null);
    setPendingRequest(request);
    setReviseText("");
    try {
      const r = await api<{ report: ReportDoc; usage: Usage; revisions: Revision[] }>(`/api/days/${date}/report/revisions`, { body: { request } });
      setUsage(r.usage);
      setReport(r.report);
      setRevisions(r.revisions);
      setDay((d) => (d ? { ...d, report: { title: r.report.title, updatedAt: r.report.updatedAt } } : d));
      setReportSave({ text: "저장됨", err: false });
    } catch (e) {
      if (e instanceof ApiError && e.code === "limit_reached") setUsage((u) => (u ? { ...u, reviseRemaining: 0 } : u));
      setReviseStatus({ kind: "err", text: errorText(e) });
      setReviseText((t) => t || request);
    } finally {
      setPendingRequest("");
      setRevising(false);
    }
  }

  async function downloadMaterial(id: string) {
    try {
      const { url } = await api<{ url: string }>(`/api/days/${date}/materials/${id}/file`);
      window.location.assign(url);
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    }
  }

  async function downloadWord() {
    if (!(await flushReport())) return;
    // 서버가 첨부 파일로 내려주므로 링크를 눌러 받는다(아이폰 Safari도 저장 창을 띄운다)
    const a = document.createElement("a");
    a.href = `/api/days/${date}/report/docx`;
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  }

  // 문서 시트가 열린 동안 뒤 화면이 같이 스크롤되지 않게 하고 Esc로 닫는다
  useEffect(() => {
    if (!docOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDocOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [docOpen]);

  // 대화 화면에 새 메시지가 붙으면 맨 아래로 내린다
  const chatEnd = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (stage === "chat") chatEnd.current?.scrollIntoView({ block: "end" });
  }, [stage, revisions.length, pendingRequest]);

  const eduMaterials = day?.materials.filter((m) => m.kind === "education") ?? [];
  const schedMaterials = day?.materials.filter((m) => m.kind === "schedule") ?? [];
  const order = (ref: PhotoRef) => selected.findIndex((s) => sameRef(s, ref)) + 1;
  const busy = aiBusy || !day;

  const docCard = report && (
    <button type="button" className="doc-card" onClick={() => setDocOpen(true)} disabled={aiBusy}>
      <span className="doc-icon" aria-hidden>
        DOC
      </span>
      <span className="doc-text">
        <b>{report.title || `${fmtDate(date)} 출장보고서`}</b>
        <span>눌러서 문서 보기 · 직접 고칠 수 있습니다</span>
      </span>
    </button>
  );

  return (
    <div className="ws">
      {stage === "input" ? (
        <section className="ws-input" aria-busy={busy}>
          <div className="ws-head">
            <input className="input ws-date" type="date" value={date} disabled={photoBusy} aria-label="보고 일자" onChange={(e) => changeDate(e.target.value)} />
            {usage && (
              <span className="usage">
                생성 <b>{usage.generateRemaining}/{usage.generateLimit}</b> · 수정 <b>{usage.reviseRemaining}/{usage.reviseLimit}</b>
              </span>
            )}
            {!profile.proposalFilename && <span className="chip">기안문 없음</span>}
          </div>

          {report && !aiBusy && (
            <button type="button" className="resume" onClick={() => setStage("chat")}>
              <span>
                <b>이 날짜 보고서가 있습니다</b>
                <span className="opt">수정 대화로 돌아가기</span>
              </span>
              <span aria-hidden>→</span>
            </button>
          )}

          {loadError && <div className="msg msg-err">{loadError}</div>}
          {!day && !loadError && (
            <p className="hint">
              <span className="spin" /> {fmtDate(date)} 자료를 불러오는 중…
            </p>
          )}

          {day && (
            <>
              {!day.hasShared && <div className="msg msg-warn">이 날짜에는 운영사 공통 자료가 아직 없습니다. 일정을 직접 입력하고 사진을 추가하면 보고서를 만들 수 있습니다.</div>}

              <div className="block">
                <div className="block-title">
                  운영사 제공 일정
                  {day.hasShared && <span className="opt">공통 일정 복사본 · 고쳐도 다른 회사에는 영향 없음</span>}
                </div>
                <textarea
                  className="textarea"
                  rows={5}
                  value={schedule}
                  disabled={generating}
                  aria-label="운영사 제공 일정"
                  placeholder={"카톡·메일로 받은 그날 일정을 붙여 넣으세요.\n예) 09:30 betahaus 온보딩"}
                  onChange={(e) => {
                    setSchedule(e.target.value);
                    queueDraft({ scheduleText: e.target.value });
                  }}
                />
                {(day.scheduleImages.length > 0 || schedMaterials.length > 0) && (
                  <ul className="files">
                    {day.scheduleImages.map((s) => (
                      <li key={s.id}>
                        <a className="fname" href={s.url} target="_blank" rel="noreferrer" title={s.filename}>
                          {s.filename}
                        </a>
                        <span className="meta">일정 이미지 · AI에 함께 전달</span>
                      </li>
                    ))}
                    {schedMaterials.map((m) => (
                      <li key={m.id}>
                        <span className="fname" title={m.filename}>{m.filename}</span>
                        <span className="meta">{m.chars.toLocaleString()}자</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <details className="block fold">
                <summary className="block-title">
                  교육자료 <span className="opt">{eduMaterials.length ? `${eduMaterials.length}개 · 운영사 공통 자료` : "없음 · 일정만으로 간략히 작성"}</span>
                </summary>
                {eduMaterials.length ? (
                  <ul className="files">
                    {eduMaterials.map((m) => (
                      <li key={m.id}>
                        <span className="fname" title={m.filename}>{m.filename}</span>
                        {m.hasOriginal ? (
                          <button type="button" className="btn-link" onClick={() => downloadMaterial(m.id)}>
                            원본 받기
                          </button>
                        ) : (
                          <span className="meta">{m.chars.toLocaleString()}자</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">이 날짜에 등록된 교육자료가 없습니다.</p>
                )}
              </details>

              <div className="block">
                <div className="block-title">
                  참여 사진 <span className="opt">{day.photos.length ? `${selected.length}장 선택 / ${day.photos.length}장` : "없음"}</span>
                  <span className="spacer" />
                  <label className={`btn btn-small add-photo${generating || uploading ? " is-disabled" : ""}`}>
                    {uploading ? <span className="spin" /> : "＋"} 추가
                    <input type="file" accept="image/*" multiple disabled={generating || Boolean(uploading)} onChange={(e) => (addPhotos(e.target.files), (e.target.value = ""))} />
                  </label>
                </div>
                {uploading && <p className="hint">{uploading}</p>}
                {day.photos.length > 0 ? (
                  <>
                    <div className="pbar">
                      <span>{selected.length === 0 ? "넣을 사진을 누르세요. 고른 순서대로 번호가 붙습니다." : "고른 순서대로 보고서에 들어갑니다."}</span>
                      <span className="row">
                        <button type="button" className="btn-link" disabled={photoBusy} onClick={() => selectAll(true)}>
                          모두 선택
                        </button>
                        <button type="button" className="btn-link" disabled={photoBusy} onClick={() => selectAll(false)}>
                          선택 해제
                        </button>
                      </span>
                    </div>
                    <div className="thumbs thumbs-scroll">
                      {day.photos.map((p) => {
                        const no = order(p);
                        return (
                          <div key={`${p.source}:${p.id}`} style={{ position: "relative" }}>
                            <button type="button" className={`thumb${no ? " sel" : ""}`} style={{ width: "100%" }} disabled={photoBusy} onClick={() => toggle(p)} aria-pressed={no > 0} aria-label={`${p.filename} ${no ? `${no}번째로 선택됨` : "선택"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt="" loading="lazy" />
                              {no ? <span className="no">{no}</span> : <span className="chk" />}
                              {p.source === "company" && <span className="own">내 사진</span>}
                            </button>
                            {p.source === "company" && (
                              <button type="button" className="thumb-del" aria-label="사진 지우기" disabled={photoBusy} onClick={() => removePhoto(p.id)}>
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="hint">이 날짜에 등록된 사진이 없습니다. ‘추가’로 직접 올릴 수 있습니다.</p>
                )}
              </div>

              <div className="block">
                <div className="block-title">
                  특이사항 <span className="opt">별도 성과, 별도 미팅 등</span>
                </div>
                <textarea
                  className="textarea"
                  rows={3}
                  maxLength={5000}
                  value={notes}
                  disabled={generating}
                  aria-label="특이사항"
                  placeholder={"예) 점심 네트워킹에서 ○○사 CTO와 PoC 논의, 11/10 후속 미팅 확정"}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    queueDraft({ notes: e.target.value });
                  }}
                />
                <div className="hint">
                  {draftSaving === "saving" ? "입력 내용 저장 중…" : draftSaving === "saved" ? "입력 내용이 자동 저장되었습니다" : draftSaving === "error" ? "입력 내용을 저장하지 못했습니다" : "입력 내용은 자동 저장됩니다"}
                </div>
              </div>

              {limitReached && <div className="msg msg-warn">오늘 생성 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다.</div>}
              {status && (
                <div className={`msg msg-${status.kind}`}>
                  {status.text}
                  {status.retry && (
                    <>
                      {" "}
                      <button type="button" className="btn-link" onClick={() => generate(Boolean(report))}>
                        다시 시도
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="ws-action">
                {generating && (
                  <div className="gen-progress">
                    <div className="bar">
                      <i style={{ width: `${Math.min(95, (elapsed / 150) * 100)}%` }} />
                    </div>
                    교육자료 분량에 따라 1~3분 걸립니다 · {elapsed}초 · 화면을 닫지 마세요
                  </div>
                )}
                <button type="button" className="btn btn-primary btn-block" disabled={photoBusy || limitReached} onClick={startGenerate}>
                  {generating ? <span className="spin" /> : null}
                  {generating ? "보고서 작성 중…" : report ? "다시 만들기" : "보고서 만들기"}
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="ws-chat">
          <div className="chat-head">
            <button type="button" className="btn btn-small" disabled={aiBusy} onClick={() => setStage("input")}>
              ← 입력
            </button>
            <b className="chat-date">{fmtDate(date)}</b>
            <span className="spacer" />
            <button type="button" className="btn btn-small" disabled={!report || aiBusy} onClick={downloadWord}>
              Word
            </button>
          </div>

          <ol className="chat" aria-label="보고서 수정 대화">
            <li className="bubble ai">
              보고서를 만들었습니다. 문서를 열어 확인하고, 고칠 부분은 아래에 적어 보내세요.
              {revisions.length === 0 && docCard}
            </li>
            {revisions.map((r, i) => (
              <Fragment key={i}>
                <li className="bubble me">{r.request}</li>
                <li className="bubble ai">
                  수정 요청을 반영했습니다.
                  {i === revisions.length - 1 && !pendingRequest && docCard}
                </li>
              </Fragment>
            ))}
            {pendingRequest && (
              <>
                <li className="bubble me">{pendingRequest}</li>
                <li className="bubble ai">
                  <span className="spin" /> 수정 요청을 반영하고 있습니다 · {elapsed}초
                </li>
              </>
            )}
            <li ref={chatEnd} aria-hidden className="chat-end" />
          </ol>

          <div className="composer">
            {reviseStatus && <div className={`msg msg-${reviseStatus.kind}`}>{reviseStatus.text}</div>}
            <div className="composer-row">
              <textarea
                className="textarea"
                rows={1}
                maxLength={1000}
                value={reviseText}
                disabled={aiBusy || reviseLimitReached}
                placeholder="예) 시사점을 더 구체적으로"
                aria-label="수정 요청"
                onChange={(e) => setReviseText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    revise();
                  }
                }}
              />
              <button type="button" className="btn btn-primary send" aria-label="수정 요청 보내기" disabled={aiBusy || reviseLimitReached || !reviseText.trim()} onClick={revise}>
                {revising ? <span className="spin" /> : "↑"}
              </button>
            </div>
            <div className="hint">
              {reviseLimitReached ? "오늘 수정 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다." : `요청한 부분만 다시 씁니다(직접 고친 문장도 바뀔 수 있음) · 남은 수정 ${usage?.reviseRemaining ?? 0}/${usage?.reviseLimit ?? 0}회`}
            </div>
          </div>
        </section>
      )}

      {/* 직접 고친 내용과 사진 배치를 유지하려고 본문은 닫혀 있어도 그대로 두고 숨기기만 한다 */}
      <div className="sheet-veil" hidden={!docOpen} onClick={(e) => e.target === e.currentTarget && setDocOpen(false)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label="보고서 문서">
          <div className="sheet-head">
            <button type="button" className="btn btn-small" onClick={() => setDocOpen(false)}>
              닫기
            </button>
            <span className={`savestate${reportSave.err ? " err" : ""}`}>
              {reportSave.text}
              {reportSave.err && (
                <>
                  {" "}
                  <button type="button" className="btn-link" onClick={flushReport}>
                    다시 저장
                  </button>
                </>
              )}
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-small btn-primary" disabled={!report || aiBusy} onClick={downloadWord}>
              Word 다운로드
            </button>
          </div>
          <div className="sheet-body">
            <p className="hint sheet-hint">
              {streaming ? "작성이 끝난 섹션부터 차례로 보입니다. 다 만들어지면 사진이 들어가고 직접 고칠 수 있습니다." : "문장을 눌러 직접 고칠 수 있습니다. 고친 내용 그대로 Word 파일에 들어갑니다."}
            </p>
            <div className="paper">
              <div
                id="report"
                ref={reportEl}
                hidden={!report && !streaming}
                contentEditable={Boolean(report) && !aiBusy}
                suppressContentEditableWarning
                onInput={() => {
                  reportDirty.current = true;
                  setReportSave({ text: "저장 대기…", err: false });
                  clearTimeout(reportTimer.current);
                  reportTimer.current = setTimeout(flushReport, 1500);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {confirmOverwrite && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>보고서를 다시 만들까요?</h3>
            <p style={{ margin: 0 }}>
              {fmtDate(date)} 보고서를 새로 만들면 <b>직접 고친 내용{revisions.length > 0 ? "과 AI 수정 요청 기록이" : "이"} 사라집니다</b>. 오늘 남은 생성 횟수가 1회 줄어듭니다.
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setConfirmOverwrite(false)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={() => generate(true)}>
                다시 만들기
              </button>
            </div>
          </div>
        </div>
      )}
      {ui.dialog}
    </div>
  );
}
