"use client";
import { useState } from "react";
import { api, errorText } from "../api";
import { extractText, uploadOriginal } from "../files";
import type { Profile } from "./types";

const MAX_INTRO = 5000;

// C1 회사 정보 등록(FUNC-1). 회사명은 관리자가 정하므로 읽기 전용이다.
export function CompanyInfo({ profile, onSaved, onCancel }: { profile: Profile; onSaved: () => void; onCancel?: () => void }) {
  const [traveler, setTraveler] = useState(profile.traveler);
  const [intro, setIntro] = useState(profile.businessIntro);
  const [proposal, setProposal] = useState({ filename: profile.proposalFilename, chars: profile.proposalChars, original: profile.proposalHasOriginal });
  const [proposalText, setProposalText] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "err" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "info", text: `${file.name} 읽는 중…` });
    try {
      const text = await extractText(file);
      // 원본 보관이 실패해도 AI에 쓰는 텍스트는 저장한다
      let storagePath: string | null = null;
      let warning = "";
      try {
        const u = await api<{ storagePath: string; uploadUrl: string }>("/api/company/proposal/upload-url", { body: { filename: file.name, size: file.size } });
        await uploadOriginal(u.uploadUrl, file);
        storagePath = u.storagePath;
      } catch (e) {
        warning = `${errorText(e)} 텍스트는 저장했으므로 보고서는 만들 수 있습니다.`;
      }
      await api("/api/company/proposal", { method: "PUT", body: { filename: file.name, text, storagePath } });
      setProposal({ filename: file.name, chars: text.length, original: storagePath !== null });
      setProposalText(text);
      setStatus(warning ? { kind: "err", text: warning } : null);
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    }
  }

  async function loadProposal(open: boolean) {
    if (!open || proposalText !== null) return;
    try {
      setProposalText((await api<{ text: string }>("/api/company/proposal")).text);
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    }
  }

  async function downloadOriginal() {
    try {
      const { url } = await api<{ url: string }>("/api/company/proposal/file");
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setStatus({ kind: "err", text: errorText(e) });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/company", { method: "PUT", body: { traveler, businessIntro: intro } });
      onSaved();
    } catch (err) {
      setStatus({ kind: "err", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow" style={{ maxWidth: 640 }}>
      <form className="card" onSubmit={save}>
        <h1>회사 정보</h1>
        <p className="sub">처음 한 번만 등록하면 다음부터 자동으로 불러옵니다. 보고서의 시사점을 쓸 때 회사 소개를 참고합니다.</p>
        <label className="field">
          <span>회사명</span>
          <input className="input" value={profile.name} readOnly />
          <div className="hint">회사명이 틀렸으면 운영 담당자에게 알려 주세요.</div>
        </label>
        <label className="field">
          <span>출장자 (이름·직위)</span>
          <input className="input" value={traveler} maxLength={300} placeholder="예: 홍길동(대표이사), 김철수(팀장)" onChange={(e) => setTraveler(e.target.value)} />
        </label>
        <label className="field">
          <span>회사 소개 (주력 제품·사업·고객)</span>
          <textarea
            className="textarea"
            rows={7}
            maxLength={MAX_INTRO}
            value={intro}
            placeholder="예: 건설 현장 사진 기반 문서 자동화 SaaS — 국내 종합건설사 POC 진행 중"
            onChange={(e) => setIntro(e.target.value)}
          />
          <div className="count">
            {intro.length.toLocaleString()} / {MAX_INTRO.toLocaleString()}자
          </div>
        </label>
        <div className="field">
          <span>사전 출장 기안문</span>
          <label className="drop">
            출장 신청 기안문·계획서(PDF·DOCX)를 골라 주세요
            <input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
          </label>
          {proposal.filename ? (
            <>
              <div className="msg msg-ok">
                {proposal.filename} · {proposal.chars.toLocaleString()}자 읽음 · 저장됨
              </div>
              {proposal.original && (
                <button type="button" className="btn-link" style={{ marginTop: 8 }} onClick={downloadOriginal}>
                  원본 파일 내려받기
                </button>
              )}
              <details className="pv" onToggle={(e) => loadProposal((e.target as HTMLDetailsElement).open)}>
                <summary>기안문 내용 보기</summary>
                <pre>{proposalText ?? "불러오는 중…"}</pre>
              </details>
            </>
          ) : (
            <div className="msg msg-warn">아직 기안문이 없습니다. 보고서의 &lsquo;계획 대비&rsquo; 항목에 필요합니다.</div>
          )}
        </div>
        {status && <div className={`msg ${status.kind === "err" ? "msg-err" : "msg-info"}`}>{status.text}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel}>
              닫기
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? <span className="spin" /> : null} 저장하고 보고서 작성으로
          </button>
        </div>
      </form>
    </main>
  );
}
