"use client";
import { useState } from "react";
import { api, errorText } from "../api";

// P1 최초 비밀번호 변경(현재 비밀번호 생략) · AUTH-11 로그인 후 변경(현재 비밀번호 확인)
export function PasswordForm({ first, onDone, onCancel }: { first: boolean; onDone: () => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setError("새 비밀번호는 8자 이상 입력해 주세요");
    if (next !== confirm) return setError("새 비밀번호 확인이 일치하지 않습니다");
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/password", { body: first ? { newPassword: next } : { currentPassword: current, newPassword: next } });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <form className="card" onSubmit={submit}>
        <h1>{first ? "새 비밀번호 정하기" : "비밀번호 변경"}</h1>
        <p className="sub">{first ? "처음 로그인하셨습니다. 앞으로 쓸 비밀번호를 8자 이상으로 정해 주세요." : "현재 비밀번호를 확인한 뒤 바꿉니다. 다른 기기의 로그인은 끊어집니다."}</p>
        {!first && (
          <label className="field">
            <span>현재 비밀번호</span>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>새 비밀번호 (8자 이상)</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="field">
          <span>새 비밀번호 확인</span>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <div className="msg msg-err">{error}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
            {busy ? <span className="spin" /> : null} 비밀번호 저장
          </button>
        </div>
      </form>
    </main>
  );
}
