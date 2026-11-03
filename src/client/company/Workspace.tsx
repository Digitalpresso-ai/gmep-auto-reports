"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { assignPhotos, parsePhotoKeys, photoKey } from "@/lib/photo-layout";
import { ApiError, api, errorText, fmtDate, kstToday } from "../api";
import { useDialog } from "../dialog";
import { imageForm, toJpeg } from "../files";
import type { DayView, PhotoRef, Profile, ReportDoc, Usage } from "./types";

type DraftPatch = { scheduleText?: string; selectedPhotos?: PhotoRef[]; notes?: string };
type Status = { kind: "err" | "ok" | "info" | "warn"; text: string; retry?: boolean } | null;

const AUTO_SELECT_MAX = 4;
const sameRef = (a: PhotoRef, b: PhotoRef) => a.source === b.source && a.id === b.id;

// H0 작성 화면 → E1/E2 입력 → G1 생성 중 / G2 실패 / Q1 한도 소진 → R1 미리보기·편집 / R2 저장 실패 → W1 Word
export function Workspace({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(kstToday);
  const [day, setDay] = useState<DayView | null>(null);
  const [loadError, setLoadError] = useState("");
  const ui = useDialog();
  const [schedule, setSchedule] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<PhotoRef[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [report, setReport] = useState<ReportDoc | null>(null);
  const [generating, setGenerating] = useState(false);
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
  const reportEl = useRef<HTMLDivElement>(null);

  // ---------- 초안 자동 저장(FUNC-17) ----------
  const flushDraft = useCallback(async () => {
    clearTimeout(draftTimer.current);
    const p = pendingDraft.current;
    if (!p) return true;
    pendingDraft.current = null;
    setDraftSaving("saving");
    try {
      await api(`/api/days/${p.date}/draft`, { method: "PUT", body: p.patch });
      setDraftSaving("saved");
      return true;
    } catch (e) {
      // 실패한 변경은 다음 저장에 다시 싣는다
      const later = pendingDraft.current as { date: string; patch: DraftPatch } | null;
      pendingDraft.current = { date: p.date, patch: { ...p.patch, ...(later?.date === p.date ? later.patch : {}) } };
      setDraftSaving("error");
      setStatus({ kind: "err", text: `입력 내용을 저장하지 못했습니다: ${errorText(e)}` });
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
      await api(`/api/days/${date}/report`, { method: "PUT", body: { bodyHtml: clone.innerHTML } });
      reportDirty.current = false;
      setReportSave({ text: `저장됨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`, err: false });
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
    return { v, sel, r };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(date).then(
      ({ v, sel, r }) => {
        if (cancelled) return;
        setDay(v);
        setSchedule(v.schedule.text);
        setNotes(v.notes);
        setSelected(sel);
        setUsage(v.usage);
        setReport(r);
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
    setStatus(null);
    setReportSave({ text: "", err: false });
    setDraftSaving("");
    setDate(next);
  }

  // ---------- 미리보기에 보고서·사진 넣기 ----------
  const photoUrl = useCallback((key: string) => day?.photos.find((p) => photoKey(p) === key)?.url ?? "", [day]);

  // AI가 섹션 옆에 둔 사진은 그 자리에, 나머지는 참여 사진 자리에 넣는다(PHOTO-2). 참여 사진 자리가 비면 그 제목을 숨긴다.
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
        p.textContent = "(왼쪽 4번에서 고른 사진이 여기에 들어갑니다)";
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

  useEffect(() => {
    if (!generating) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [generating]);

  // 창을 닫기 전에 남은 저장을 보낸다
  useEffect(() => {
    const h = () => {
      flushDraft();
      flushReport();
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [flushDraft, flushReport]);

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
    setGenerating(true);
    setElapsed(0);
    setStatus(null);
    try {
      const r = await api<{ report: ReportDoc; usage: Usage }>(`/api/days/${date}/report`, { body: { overwrite } });
      setUsage(r.usage);
      setReport(r.report);
      setDay((d) => (d ? { ...d, report: { title: r.report.title, updatedAt: r.report.updatedAt } } : d));
      setReportSave({ text: "저장됨", err: false });
      setStatus({ kind: "ok", text: "보고서를 만들어 저장했습니다. 문장을 눌러 고친 뒤 Word로 받으세요." });
    } catch (e) {
      if (e instanceof ApiError && e.code === "limit_reached") setUsage((u) => (u ? { ...u, generateRemaining: 0 } : u));
      setStatus({ kind: "err", text: errorText(e), retry: e instanceof ApiError && e.status !== 429 && e.code !== "report_exists" });
    } finally {
      setGenerating(false);
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

  const eduMaterials = day?.materials.filter((m) => m.kind === "education") ?? [];
  const schedMaterials = day?.materials.filter((m) => m.kind === "schedule") ?? [];
  const order = (ref: PhotoRef) => selected.findIndex((s) => sameRef(s, ref)) + 1;
  const busy = generating || !day;

  return (
    <div className="page">
      <div className="work">
        <section className="card steps" aria-busy={busy}>
          <div className="step">
            <h2>
              <span className="num">1</span>보고 일자
            </h2>
            <input className="input" type="date" value={date} disabled={generating} onChange={(e) => changeDate(e.target.value)} />
            <div className="usage" style={{ marginTop: 10 }}>
              {usage && (
                <>
                  오늘 남은 생성{" "}
                  <b>
                    {usage.generateRemaining}/{usage.generateLimit}회
                  </b>
                </>
              )}
              <span className="spacer" />
              <span className="chip chip-muted">{profile.label}</span>
              {!profile.proposalFilename && <span className="chip">기안문 없음</span>}
            </div>
          </div>

          {loadError && <div className="msg msg-err">{loadError}</div>}
          {!day && !loadError && (
            <p className="hint">
              <span className="spin" /> {fmtDate(date)} 자료를 불러오는 중…
            </p>
          )}

          {day && (
            <>
              {!day.hasShared && (
                <div className="msg msg-warn">이 날짜에는 운영사 공통 자료가 아직 없습니다. 일정을 직접 입력하고 사진을 추가하면 보고서를 만들 수 있습니다.</div>
              )}
              <div className="step">
                <h2>
                  <span className="num">2</span>운영사 제공 일정
                  {day.hasShared && <span className="opt">· 공통 일정을 복사해 둔 것입니다. 고쳐도 다른 회사에는 영향이 없습니다</span>}
                </h2>
                <textarea
                  className="textarea"
                  rows={7}
                  value={schedule}
                  disabled={generating}
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
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.filename}
                        </a>
                        <span className="meta">일정 이미지 · AI에 함께 전달</span>
                      </li>
                    ))}
                    {schedMaterials.map((m) => (
                      <li key={m.id}>
                        <span>{m.filename}</span>
                        <span className="meta">{m.chars.toLocaleString()}자</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="step">
                <h2>
                  <span className="num">3</span>교육자료 <span className="opt">· 운영사 공통 자료</span>
                </h2>
                {eduMaterials.length ? (
                  <ul className="files">
                    {eduMaterials.map((m) => (
                      <li key={m.id}>
                        <span>{m.filename}</span>
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
                  <p className="hint">이 날짜에 등록된 교육자료가 없습니다. 일정만으로 간략히 작성합니다.</p>
                )}
              </div>

              <div className="step">
                <h2>
                  <span className="num">4</span>참여 사진
                </h2>
                <label className="drop">
                  {uploading || "사진 추가 (여러 장 선택 가능)"}
                  <input type="file" accept="image/*" multiple disabled={generating || Boolean(uploading)} onChange={(e) => (addPhotos(e.target.files), (e.target.value = ""))} />
                </label>
                {day.photos.length > 0 && (
                  <>
                    <div className="pbar">
                      <span>
                        보고서에 넣을 사진 {selected.length}장 / 전체 {day.photos.length}장
                      </span>
                      <span className="row">
                        <button type="button" className="btn-link" onClick={() => selectAll(true)}>
                          모두 선택
                        </button>
                        <button type="button" className="btn-link" onClick={() => selectAll(false)}>
                          선택 해제
                        </button>
                      </span>
                    </div>
                    {selected.length === 0 && <div className="msg msg-info">보고서에 넣을 사진을 눌러서 고르세요. 고른 순서대로 번호가 붙습니다.</div>}
                    <div className="thumbs">
                      {day.photos.map((p) => {
                        const no = order(p);
                        return (
                          <div key={`${p.source}:${p.id}`} style={{ position: "relative" }}>
                            <button type="button" className={`thumb${no ? " sel" : ""}`} style={{ width: "100%" }} onClick={() => toggle(p)} aria-pressed={no > 0} aria-label={`${p.filename} ${no ? `${no}번째로 선택됨` : "선택"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt="" loading="lazy" />
                              {no ? <span className="no">{no}</span> : <span className="chk" />}
                              {p.source === "company" && <span className="own">내 사진</span>}
                            </button>
                            {p.source === "company" && (
                              <button type="button" className="thumb-del" aria-label="사진 지우기" onClick={() => removePhoto(p.id)}>
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="step">
                <h2>
                  <span className="num">5</span>특이사항 <span className="opt">· 별도 성과, 별도 미팅 등</span>
                </h2>
                <textarea
                  className="textarea"
                  rows={4}
                  maxLength={5000}
                  value={notes}
                  disabled={generating}
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

              <button type="button" className="btn btn-primary btn-block" disabled={generating || limitReached} onClick={startGenerate}>
                {generating ? <span className="spin" /> : null}
                {generating ? "보고서 작성 중…" : report ? "다시 만들기" : "보고서 만들기"}
              </button>
              {limitReached && <div className="msg msg-warn">오늘 사용 한도를 다 쓰셨습니다. 직접 편집과 Word 다운로드는 계속 쓸 수 있습니다.</div>}
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
            </>
          )}
        </section>

        <section>
          <div className="toolbar">
            <button type="button" className="btn btn-primary" disabled={!report || generating} onClick={downloadWord}>
              Word(.docx) 다운로드
            </button>
            <span className="spacer" />
            {report && (
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
            )}
          </div>
          {report && !generating && <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>미리보기의 문장을 눌러 직접 고칠 수 있습니다. 고친 내용 그대로 Word 파일에 들어갑니다.</p>}
          <div className="paper">
            {generating && (
              <div className="progress">
                <b style={{ color: "var(--text-strong)" }}>보고서를 작성하고 있습니다</b>
                <div className="bar">
                  <i style={{ width: `${Math.min(95, (elapsed / 150) * 100)}%` }} />
                </div>
                교육자료 분량에 따라 1~3분 걸립니다 · {elapsed}초 경과
                <br />
                화면을 닫지 말고 기다려 주세요.
              </div>
            )}
            {!report && !generating && (
              <div className="empty">
                <b>왼쪽 내용을 채우고 &lsquo;보고서 만들기&rsquo;를 누르세요</b>
                기안문과 일정만 있어도 만들 수 있고, 교육자료가 있으면 세부 교육 내용이 풍부해집니다.
              </div>
            )}
            <div
              id="report"
              ref={reportEl}
              hidden={!report || generating}
              contentEditable={Boolean(report) && !generating}
              suppressContentEditableWarning
              onInput={() => {
                reportDirty.current = true;
                setReportSave({ text: "저장 대기…", err: false });
                clearTimeout(reportTimer.current);
                reportTimer.current = setTimeout(flushReport, 1500);
              }}
            />
          </div>
        </section>
      </div>

      {confirmOverwrite && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>보고서를 다시 만들까요?</h3>
            <p style={{ margin: 0 }}>
              {fmtDate(date)} 보고서를 새로 만들면 <b>직접 고친 내용이 사라집니다</b>. 오늘 남은 생성 횟수가 1회 줄어듭니다.
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
