"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, errorText, kstToday } from "../api";
import { Companies } from "./Companies";
import { DayEditor } from "./DayEditor";

// A0 관리자 로그인 → A2 날짜를 골라 공통 자료 편집 / A5 회사 관리
export function AdminApp() {
  const [view, setView] = useState<"loading" | "login" | "days" | "companies">("loading");
  // 사전 렌더에서 현재 시각을 읽지 않도록 오늘 날짜는 세션 확인 뒤에 정한다
  const [date, setDate] = useState("");

  const checkSession = useCallback(async () => {
    try {
      await api("/api/admin/days");
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setView("login");
      return false;
    }
  }, []);

  useEffect(() => {
    // 첫 화면은 관리자 세션 확인 결과로 정한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession().then((ok) => ok && (setDate(kstToday()), setView("days")));
  }, [checkSession]);

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    setView("login");
  }

  if (view === "loading") return <p className="narrow hint"><span className="spin" /> 불러오는 중…</p>;
  if (view === "login") return <AdminLogin onDone={() => checkSession().then((ok) => ok && (setDate(kstToday()), setView("days")))} />;

  return (
    <>
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-digitalpresso-blue.png" alt="디지털프레소" />
        <span className="app-title">GMEP 보고서 작성기 관리</span>
        <span className="spacer" />
        <button type="button" className="btn btn-small" onClick={logout}>로그아웃</button>
      </header>
      <div className="page">
        <div className="tabs">
          <button type="button" className={`tab${view === "days" ? " on" : ""}`} onClick={() => setView("days")}>날짜별 공통 자료</button>
          <button type="button" className={`tab${view === "companies" ? " on" : ""}`} onClick={() => setView("companies")}>회사 관리</button>
        </div>
        {view === "companies" && <Companies />}
        {view === "days" && (
          <>
            <label className="field date-pick">
              <span>보고 일자</span>
              <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
            <DayEditor key={date} date={date} />
          </>
        )}
      </div>
    </>
  );
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { body: { password } });
      onDone();
    } catch (err) {
      setError(errorText(err));
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
        <h1>관리자 로그인</h1>
        <p className="sub">운영 담당자 전용 화면입니다.</p>
        <label className="field">
          <span>관리자 비밀번호</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="msg msg-err">{error}</div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy || !password}>
          {busy ? <span className="spin" /> : null} 로그인
        </button>
      </form>
    </main>
  );
}
