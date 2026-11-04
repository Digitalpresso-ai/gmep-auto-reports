"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useDialog } from "../dialog";

type Row = {
  id: string;
  name: string;
  label: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  generateLimit: number;
  reviseLimit: number;
  generateUsed: number;
  reviseUsed: number;
};
// 한도를 정할 대상. row가 없으면 모든 회사에 적용한다.
type LimitEdit = { row: Row | null; generate: string; revise: string };

// A5 회사 관리(AUTH-9 1차: 추가·이름 수정·초기 비밀번호 발급). 보고서 내용은 보여 주지 않는다(AUTH-10).
export function Companies() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ label: string; password: string } | null>(null);
  const [bulk, setBulk] = useState<{ name: string; label: string; password: string }[] | null>(null);
  const [limitEdit, setLimitEdit] = useState<LimitEdit | null>(null);
  const [limitError, setLimitError] = useState("");
  const ui = useDialog();

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
    const next = (await ui.prompt("새 회사명(운영사 명단과 같게)", r.name))?.trim();
    if (!next || next === r.name) return;
    try {
      await api(`/api/admin/companies/${r.id}`, { method: "PATCH", body: { name: next } });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function issue(r: Row) {
    if (r.hasPassword && !(await ui.confirm(`${r.label}의 비밀번호를 새로 발급할까요? 지금 쓰는 비밀번호와 로그인이 모두 끊어집니다.`, "발급"))) return;
    try {
      const { password } = await api<{ password: string }>(`/api/admin/companies/${r.id}/password`, { method: "POST" });
      setIssued({ label: r.label, password });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function issueMissing() {
    if (!(await ui.confirm(`비밀번호가 없는 ${missing}개사에 초기 비밀번호를 발급할까요? 이미 비밀번호가 있는 회사는 그대로 둡니다.`, "발급"))) return;
    setError("");
    try {
      const res = await api<{ issued: { name: string; label: string; password: string }[] }>("/api/admin/companies/passwords", { method: "POST" });
      setBulk(res.issued);
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function openLimits(row: Row | null) {
    const base = row ?? rows?.[0];
    setLimitError("");
    setLimitEdit({ row, generate: String(base?.generateLimit ?? 5), revise: String(base?.reviseLimit ?? 15) });
  }

  async function saveLimits() {
    if (!limitEdit) return;
    const g = Number(limitEdit.generate);
    const r = Number(limitEdit.revise);
    const valid = (n: number) => limitEdit.generate !== "" && Number.isInteger(n) && n >= 0 && n <= 100;
    if (!valid(g) || !valid(r) || limitEdit.revise === "") return setLimitError("0~100 사이 정수로 입력해 주세요");
    if (!limitEdit.row && !(await ui.confirm(`모든 회사(${rows?.length ?? 0}개사)의 하루 횟수를 생성 ${g}회 · 수정 ${r}회로 바꿀까요?`, "적용"))) return;
    try {
      const body = { dailyGenerateLimit: g, dailyReviseLimit: r };
      if (limitEdit.row) await api(`/api/admin/companies/${limitEdit.row.id}/limits`, { method: "PUT", body });
      else await api("/api/admin/companies/limits", { method: "PUT", body });
      setLimitEdit(null);
      await reload();
    } catch (err) {
      setLimitError(errorText(err));
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
        <button type="button" className="btn btn-small" disabled={!missing} onClick={issueMissing}>
          비밀번호 미발급 {missing}개사 일괄 발급
        </button>
        <button type="button" className="btn btn-small" disabled={!rows?.length} onClick={() => openLimits(null)}>
          전체 하루 횟수 설정
        </button>
      </div>
      {error && <div className="msg msg-err">{error}</div>}
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table table-stack">
          <thead>
            <tr><th>로그인 표시명</th><th>등록 이름</th><th>상태</th><th>오늘 사용 / 하루 횟수</th><th /></tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id}>
                <td data-label="로그인 표시명"><b>{r.label}</b></td>
                <td data-label="등록 이름">{r.name}</td>
                <td data-label="상태">{state(r)}</td>
                <td data-label="오늘 사용 / 하루 횟수">
                  생성 {r.generateUsed}/{r.generateLimit} · 수정 {r.reviseUsed}/{r.reviseLimit}
                </td>
                <td className="actions-cell">
                  <div className="row row-end">
                    <button type="button" className="btn btn-small" onClick={() => rename(r)}>이름 수정</button>
                    <button type="button" className="btn btn-small" onClick={() => openLimits(r)}>횟수 설정</button>
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
      {limitEdit && (
        <div className="modal-veil" role="dialog" aria-modal="true">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              saveLimits();
            }}
          >
            <h3>{limitEdit.row ? `${limitEdit.row.label} 하루 횟수` : "모든 회사 하루 횟수"}</h3>
            <p style={{ margin: "0 0 12px" }}>
              오늘 이미 쓴 횟수는 그대로 두고 남은 횟수만 새 한도로 다시 계산합니다. 횟수는 한국 시간 자정에 다시 시작합니다.
            </p>
            <div className="row">
              <label style={{ flex: 1 }}>
                <span className="hint">보고서 생성</span>
                <input className="input" type="number" min={0} max={100} step={1} inputMode="numeric" value={limitEdit.generate} onChange={(e) => setLimitEdit({ ...limitEdit, generate: e.target.value })} />
              </label>
              <label style={{ flex: 1 }}>
                <span className="hint">AI 수정</span>
                <input className="input" type="number" min={0} max={100} step={1} inputMode="numeric" value={limitEdit.revise} onChange={(e) => setLimitEdit({ ...limitEdit, revise: e.target.value })} />
              </label>
            </div>
            {limitError && <div className="msg msg-err">{limitError}</div>}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setLimitEdit(null)}>
                취소
              </button>
              <button className="btn btn-primary">저장</button>
            </div>
          </form>
        </div>
      )}
      {ui.dialog}
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
