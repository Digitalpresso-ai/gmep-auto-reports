"use client";
import { useCallback, useEffect, useState } from "react";
import { classifyFile, extOf, type FileKind } from "@/lib/classify";
import { api, errorText, fmtDate } from "../api";
import { extractText, imageForm, toJpeg, unzip, uploadOriginal } from "../files";

type SharedDay = {
  date: string;
  scheduleText: string;
  files: { id: string; kind: "photo" | "schedule_image"; filename: string; url: string }[];
  materials: { id: string; kind: "schedule" | "education"; filename: string; chars: number; hasOriginal: boolean }[];
};
type Progress = { done: number; total: number; current: string };
type Result = { counts: Record<Exclude<FileKind, "ignore">, number>; failed: string[]; skipped: string[] };

const KIND_LABEL: Record<Exclude<FileKind, "ignore">, string> = { photo: "사진", schedule_image: "일정 이미지", schedule: "일정 문서", education: "교육자료" };

// A2 공통 자료 편집 · A3 처리 중 · A4 일부 실패
export function DayEditor({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [day, setDay] = useState<SharedDay | null>(null);
  const [schedule, setSchedule] = useState("");
  const [savedSchedule, setSavedSchedule] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const d = await api<SharedDay>(`/api/admin/days/${date}`);
    setDay(d);
    return d;
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    api<SharedDay>(`/api/admin/days/${date}`).then(
      (d) => {
        if (cancelled) return;
        setDay(d);
        setSchedule(d.scheduleText);
        setSavedSchedule(d.scheduleText);
        setResult(null);
        setError("");
      },
      (e) => !cancelled && setError(errorText(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function saveSchedule() {
    try {
      await api(`/api/admin/days/${date}`, { method: "PUT", body: { scheduleText: schedule } });
      setSavedSchedule(schedule);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  // 문서는 텍스트를 저장하고 원본도 Storage에 보관한다. 원본 보관만 실패하면 경고를 돌려준다.
  async function processOne(f: File, kind: Exclude<FileKind, "ignore">): Promise<string | null> {
    if (kind === "photo" || kind === "schedule_image") {
      const img = await toJpeg(f, kind === "photo" ? 1100 : 1600);
      await api(`/api/admin/days/${date}/files`, { form: imageForm(img, f.name, { kind }) });
      return null;
    }
    const text = await extractText(f);
    let storagePath: string | null = null;
    let warning: string | null = null;
    try {
      const u = await api<{ storagePath: string; uploadUrl: string }>(`/api/admin/days/${date}/materials/upload-url`, { body: { filename: f.name, size: f.size } });
      await uploadOriginal(u.uploadUrl, f);
      storagePath = u.storagePath;
    } catch (e) {
      warning = `${f.name}: 텍스트는 저장했지만 원본은 보관하지 못했습니다(${errorText(e)})`;
    }
    await api(`/api/admin/days/${date}/materials`, { body: { kind, filename: f.name, text, storagePath } });
    return warning;
  }

  // forced가 있으면 그 칸에 넣고, 없으면 FUNC-3 규칙으로 나눈다. ZIP은 브라우저에서 푼다.
  async function addFiles(list: FileList | null, forced?: Exclude<FileKind, "ignore">) {
    if (!list?.length) return;
    setError("");
    const r: Result = { counts: { photo: 0, schedule_image: 0, schedule: 0, education: 0 }, failed: [], skipped: [] };
    const files: File[] = [];
    for (const f of list) {
      if (extOf(f.name) === "zip") {
        setProgress({ done: 0, total: 0, current: `${f.name} 푸는 중…` });
        try {
          files.push(...(await unzip(f)));
        } catch {
          r.failed.push(`${f.name}: ZIP 파일을 풀지 못했습니다`);
        }
      } else files.push(f);
    }
    for (const [i, f] of files.entries()) {
      const auto = classifyFile(f.name);
      const kind = forced && forced !== "photo" && forced !== "schedule_image" && (auto === "photo" || auto === "schedule_image") ? "schedule_image" : (forced ?? auto);
      setProgress({ done: i, total: files.length, current: f.name });
      if (kind === "ignore") {
        r.skipped.push(f.name);
        continue;
      }
      try {
        const warning = await processOne(f, kind);
        r.counts[kind]++;
        if (warning) r.failed.push(warning);
      } catch (e) {
        r.failed.push(`${f.name}: ${errorText(e)}`);
      }
    }
    setProgress(null);
    setResult(r);
    await reload().catch(() => {});
    onChanged();
  }

  async function download(id: string) {
    try {
      const { url } = await api<{ url: string }>(`/api/admin/days/${date}/materials/${id}/file`);
      window.location.assign(url);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove(path: string) {
    if (!confirm("지울까요? 이미 고른 회사 보고서에서는 빠지지 않습니다.")) return;
    try {
      await api(path, { method: "DELETE" });
      await reload();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const busy = progress !== null;
  const photos = day?.files.filter((f) => f.kind === "photo") ?? [];
  const schedImages = day?.files.filter((f) => f.kind === "schedule_image") ?? [];
  const drop = (label: string, accept: string, forced?: Exclude<FileKind, "ignore">) => (
    <label className="drop">
      {label}
      <input type="file" multiple accept={accept} disabled={busy} onChange={(e) => (addFiles(e.target.files, forced), (e.target.value = ""))} />
    </label>
  );

  return (
    <div className="card">
      <h2>{fmtDate(date)} 공통 자료</h2>
      <p className="sub">여기 등록한 일정·교육자료·사진은 모든 회사가 같은 날짜를 고르면 함께 씁니다.</p>
      {drop("구글 드라이브 그날 폴더 ZIP 또는 여러 파일을 한 번에 넣기 (사진·일정·교육자료 자동 분류, 동영상 제외)", ".zip,.pdf,.pptx,.docx,.txt,.md,image/*")}
      {progress && (
        <div className="msg msg-info">
          <span className="spin" /> {progress.total ? `${progress.done + 1}/${progress.total} 처리 중 · ${progress.current}` : progress.current}
        </div>
      )}
      {result && (
        <div className={`msg ${result.failed.length ? "msg-warn" : "msg-ok"}`}>
          {(() => {
            const saved = Object.entries(result.counts)
              .filter(([, n]) => n)
              .map(([k, n]) => `${KIND_LABEL[k as keyof typeof KIND_LABEL]} ${n}개`)
              .join(" · ");
            return saved ? `저장했습니다: ${saved}` : "저장한 파일이 없습니다";
          })()}
          {result.skipped.length > 0 && `\n제외한 파일(동영상 등): ${result.skipped.slice(0, 8).join(", ")}${result.skipped.length > 8 ? " 외" : ""}`}
          {result.failed.length > 0 && `\n읽지 못한 파일 — 나머지는 저장했습니다:\n${result.failed.join("\n")}`}
        </div>
      )}
      {error && <div className="msg msg-err">{error}</div>}

      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <label className="field">
            <span>그날 일정 (텍스트)</span>
            <textarea className="textarea" rows={9} value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="카톡·메일로 받은 일정을 붙여 넣으세요" />
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary btn-small" disabled={schedule === savedSchedule} onClick={saveSchedule}>
              일정 저장
            </button>
            {schedule !== savedSchedule && <span className="hint">저장하지 않은 변경이 있습니다</span>}
          </div>
          <div className="field">
            <span>일정 이미지·PDF</span>
            {drop("일정표 이미지·PDF 추가", ".pdf,.docx,.pptx,.txt,image/*", "schedule")}
            <ul className="files">
              {schedImages.map((f) => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.filename}</a>
                  <button type="button" className="btn-link btn-danger" onClick={() => remove(`/api/admin/days/${date}/files/${f.id}`)}>삭제</button>
                </li>
              ))}
              {day?.materials.filter((m) => m.kind === "schedule").map((m) => (
                <li key={m.id}>
                  <span>{m.filename} <span className="meta">{m.chars.toLocaleString()}자</span></span>
                  <span className="row">
                    {m.hasOriginal && <button type="button" className="btn-link" onClick={() => download(m.id)}>원본</button>}
                    <button type="button" className="btn-link btn-danger" onClick={() => remove(`/api/admin/days/${date}/materials/${m.id}`)}>삭제</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="field">
            <span>교육자료 (AI에는 추출 텍스트를 보내고 원본은 보관)</span>
            {drop("PDF·PPTX·DOCX 추가", ".pdf,.pptx,.docx,.txt,.md", "education")}
            <ul className="files">
              {day?.materials.filter((m) => m.kind === "education").map((m) => (
                <li key={m.id}>
                  <span>{m.filename} <span className="meta">{m.chars.toLocaleString()}자</span></span>
                  <span className="row">
                    {m.hasOriginal && <button type="button" className="btn-link" onClick={() => download(m.id)}>원본</button>}
                    <button type="button" className="btn-link btn-danger" onClick={() => remove(`/api/admin/days/${date}/materials/${m.id}`)}>삭제</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <div className="field">
            <span>공통 사진 {photos.length}장</span>
            {drop("사진 추가", "image/*", "photo")}
            <div className="thumbs">
              {photos.map((f) => (
                <div key={f.id} className="thumb" style={{ cursor: "default" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.filename} loading="lazy" />
                  <button type="button" className="thumb-del" aria-label="사진 지우기" onClick={() => remove(`/api/admin/days/${date}/files/${f.id}`)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
