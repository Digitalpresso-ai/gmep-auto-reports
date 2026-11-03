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
  const [bulk, setBulk] = useState<{ name: string; label: string; password: string }[] | null>(null);
  // 앱 내장 브라우저 등 window.confirm을 바로 취소로 돌려주는 환경이 있어 확인은 페이지 안 창으로 받는다
  const [ask, setAsk] = useState<{ text: string; run: () => void } | null>(null);

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

  function issue(r: Row) {
    if (r.hasPassword) setAsk({ text: `${r.label}의 비밀번호를 새로 발급할까요? 지금 쓰는 비밀번호와 로그인이 모두 끊어집니다.`, run: () => doIssue(r) });
    else doIssue(r);
  }

  async function doIssue(r: Row) {
    try {
      const { password } = await api<{ password: string }>(`/api/admin/companies/${r.id}/password`, { method: "POST" });
      setIssued({ label: r.label, password });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function issueMissing() {
    setError("");
    try {
      const res = await api<{ issued: { name: string; label: string; password: string }[] }>("/api/admin/companies/passwords", { method: "POST" });
      setBulk(res.issued);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const bulkText = (list: NonNullable<typeof bulk>) => list.map((b) => `${b.label}\t${b.password}`).join("\n");

  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. 파일은 브라우저에서만 만든다.
  function downloadCsv(list: NonNullable<typeof bulk>) {
    const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const csv = ["로그인 표시명,등록 이름,초기 비밀번호", ...list.map((b) => [b.label, b.name, b.password].map(quote).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "초기비밀번호.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const missing = rows?.filter((r) => !r.hasPassword).length ?? 0;

  const state = (r: Row) =>
    r.lockedUntil ? <span className="chip" style={{ color: "var(--dp-danger)" }}>잠김</span> : !r.hasPassword ? <span className="chip chip-muted">비밀번호 미발급</span> : r.mustChangePassword ? <span className="chip">최초 변경 전</span> : <span className="chip" style={{ color: "var(--dp-success)" }}>사용 중</span>;

  return (
    <div className="card">
      <h2>회사 관리 {rows && <span className="opt">· {rows.length}개사</span>}</h2>
      <form className="row" onSubmit={add}>
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="추가할 회사명 (예: 주식회사 ○○○)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()}>회사 추가</button>
      </form>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-small" disabled={!missing} onClick={() => setAsk({ text: `비밀번호가 없는 ${missing}개사에 초기 비밀번호를 발급할까요? 이미 비밀번호가 있는 회사는 그대로 둡니다.`, run: issueMissing })}>
          비밀번호 미발급 {missing}개사 일괄 발급
        </button>
      </div>
      {error && <div className="msg msg-err">{error}</div>}
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table table-stack">
          <thead>
            <tr><th>로그인 표시명</th><th>등록 이름</th><th>상태</th><th /></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td data-label="로그인 표시명"><b>{r.label}</b></td>
                <td data-label="등록 이름">{r.name}</td>
                <td data-label="상태">{state(r)}</td>
                <td className="actions-cell">
                  <div className="row row-end">
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
      {ask && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>확인</h3>
            <p style={{ margin: 0 }}>{ask.text}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAsk(null)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={() => (ask.run(), setAsk(null))}>발급</button>
            </div>
          </div>
        </div>
      )}
      {bulk && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>초기 비밀번호 {bulk.length}개사</h3>
            <p style={{ margin: "0 0 12px" }}>이 창을 닫으면 다시 볼 수 없습니다. 복사하거나 내려받아 각 회사에 전달해 주세요.</p>
            {bulk.length ? (
              <ul className="files issued-list">
                {bulk.map((b) => (
                  <li key={b.label}>
                    <b>{b.label}</b>
                    <span className="secret">{b.password}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">발급할 회사가 없습니다.</p>
            )}
            <div className="actions">
              {bulk.length > 0 && <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(bulkText(bulk))}>전체 복사</button>}
              {bulk.length > 0 && <button type="button" className="btn" onClick={() => downloadCsv(bulk)}>CSV 내려받기</button>}
              <button type="button" className="btn btn-primary" onClick={() => setBulk(null)}>전달했습니다</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
