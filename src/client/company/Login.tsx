"use client";
import { useEffect, useState } from "react";
import { formatTime } from "@/lib/time-zone";
import { ApiError, api, errorText } from "../api";

type Option = { id: string; label: string };
type Notice = { programEndDate: string; retentionUntil: string };

const fmtFull = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${y}년 ${m}월 ${day}일`;
};

// L0 로그인 · L1 잠금
export function Login({ onLoggedIn }: { onLoggedIn: (mustChangePassword: boolean) => void }) {
  const [companies, setCompanies] = useState<Option[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Option[]>("/api/companies").then(setCompanies, (e) => setError(errorText(e)));
    api<Notice>("/api/notice").then(setNotice, () => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return setError("회사를 골라 주세요");
    setBusy(true);
    setError("");
    setLockedUntil(null);
    try {
      const r = await api<{ mustChangePassword: boolean }>("/api/auth/login", { body: { companyId, password } });
      onLoggedIn(r.mustChangePassword);
    } catch (err) {
      if (err instanceof ApiError && err.code === "locked") setLockedUntil(String(err.body.lockedUntil));
      else setError(errorText(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="login-logo" src="/brand/logo-digitalpresso-blue.png" alt="디지털프레소" />
      <form className="card" onSubmit={submit}>
        <h1>GMEP 일일 출장보고서 작성기</h1>
        <p className="sub">회사를 고르고 운영 담당자에게 받은 비밀번호를 입력해 주세요.</p>
        <label className="field">
          <span>회사</span>
          <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!companies}>
            <option value="">{companies ? "회사를 고르세요" : "불러오는 중…"}</option>
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {lockedUntil && (
          <div className="msg msg-err">
            비밀번호를 5회 틀려 잠겼습니다. {formatTime(lockedUntil)} 이후 다시 시도해 주세요.
          </div>
        )}
        {error && <div className="msg msg-err">{error}</div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? <span className="spin" /> : null} 로그인
        </button>
        {notice && (
          <p className="notice">
            작성한 보고서와 사진은 프로그램 종료일({fmtFull(notice.programEndDate)})부터 1개월 뒤인 <b>{fmtFull(notice.retentionUntil)}</b>에 모두 삭제됩니다. 필요한 보고서는 그 전에
            Word로 내려받아 보관해 주세요.
          </p>
        )}
      </form>
    </main>
  );
}
