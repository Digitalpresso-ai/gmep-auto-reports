"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api";

type Row = { id: string; name: string; label: string; hasPassword: boolean; mustChangePassword: boolean; lockedUntil: string | null };

// A5 회사 관리(AUTH-9 1차: 추가·이름 수정·초기 비밀번호 발급). 보고서 내용은 보여 주지 않는다(AUTH-10).
export function Companies() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ label: string; password: string } | null>(null);

  const reload = useCallback(() => api<Row[]>("/api/admin/companies").then(setRows, (e) => setError(errorText(e))), []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/admin/companies", { body: { name: name.trim() } });
      setName("");
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function rename(r: Row) {
    const next = prompt("새 회사명(운영사 명단과 같게)", r.name)?.trim();
    if (!next || next === r.name) return;
    try {
      await api(`/api/admin/companies/${r.id}`, { method: "PATCH", body: { name: next } });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function issue(r: Row) {
    if (r.hasPassword && !confirm(`${r.label}의 비밀번호를 새로 발급할까요? 지금 쓰는 비밀번호와 로그인이 모두 끊어집니다.`)) return;
    try {
      const { password } = await api<{ password: string }>(`/api/admin/companies/${r.id}/password`, { method: "POST" });
      setIssued({ label: r.label, password });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const state = (r: Row) =>
    r.lockedUntil ? <span className="chip" style={{ color: "var(--dp-danger)" }}>잠김</span> : !r.hasPassword ? <span className="chip chip-muted">비밀번호 미발급</span> : r.mustChangePassword ? <span className="chip">최초 변경 전</span> : <span className="chip" style={{ color: "var(--dp-success)" }}>사용 중</span>;

  return (
    <div className="card">
      <h2>회사 관리 {rows && <span className="opt">· {rows.length}개사</span>}</h2>
      <form className="row" onSubmit={add}>
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="추가할 회사명 (예: 주식회사 ○○○)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()}>회사 추가</button>
      </form>
      {error && <div className="msg msg-err">{error}</div>}
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr><th>로그인 표시명</th><th>등록 이름</th><th>상태</th><th /></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td><b>{r.label}</b></td>
                <td>{r.name}</td>
                <td>{state(r)}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-small" onClick={() => rename(r)}>이름 수정</button>
                    <button type="button" className="btn btn-small" onClick={() => issue(r)}>{r.hasPassword ? "비밀번호 재발급" : "초기 비밀번호 발급"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issued && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>{issued.label} 초기 비밀번호</h3>
            <p style={{ margin: "0 0 12px" }}>이 창을 닫으면 다시 볼 수 없습니다. 회사에 직접 전달해 주세요. 회사는 처음 로그인할 때 새 비밀번호로 바꿉니다.</p>
            <span className="secret">{issued.password}</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(issued.password)}>복사</button>
              <button type="button" className="btn btn-primary" onClick={() => setIssued(null)}>전달했습니다</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
