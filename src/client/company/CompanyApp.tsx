"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { CompanyInfo } from "./CompanyInfo";
import { Login } from "./Login";
import { PasswordForm } from "./PasswordForm";
import type { Profile } from "./types";
import { Workspace } from "./Workspace";

type Me = { mustChangePassword: boolean; company: Profile };
type View = "loading" | "login" | "first-password" | "info" | "work" | "password";

// 회사 화면 흐름: L0 → (P1) → (C1) → H0
export function CompanyApp() {
  const [view, setView] = useState<View>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      const empty = !m.company.traveler && !m.company.proposalFilename && !m.company.businessIntro;
      setView(m.mustChangePassword ? "first-password" : empty ? "info" : "work");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setView("login");
      else setView("login");
    }
  }, []);

  useEffect(() => {
    // 첫 화면 결정은 세션 확인 결과에 따른다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setMe(null);
    setView("login");
  }

  if (view === "loading") return <p className="narrow hint"><span className="spin" /> 불러오는 중…</p>;
  if (view === "login") return <Login onLoggedIn={refresh} />;
  if (view === "first-password") return <PasswordForm first onDone={refresh} />;

  return (
    <>
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-digitalpresso-blue.png" alt="디지털프레소" />
        <span className="app-title">GMEP 일일 출장보고서</span>
        <span className="spacer" />
        <span className="who">{me?.company.label}</span>
        {/* 휴대폰 상단을 한 줄로 유지하려고 계정 기능은 메뉴 하나에 모은다 */}
        <details className="menu" ref={menu}>
          <summary className="btn btn-small" aria-label="메뉴">☰</summary>
          <div className="menu-list" onClick={() => menu.current?.removeAttribute("open")}>
            {view === "work" && (
              <>
                <button type="button" onClick={() => setView("info")}>회사 정보</button>
                <button type="button" onClick={() => setView("password")}>비밀번호 변경</button>
              </>
            )}
            <button type="button" onClick={logout}>로그아웃</button>
          </div>
        </details>
      </header>
      {view === "info" && me && <CompanyInfo profile={me.company} onSaved={refresh} onCancel={me.company.traveler || me.company.proposalFilename ? () => setView("work") : undefined} />}
      {view === "password" && <PasswordForm first={false} onDone={() => setView("work")} onCancel={() => setView("work")} />}
      {view === "work" && me && <Workspace profile={me.company} />}
    </>
  );
}
