"use client";
import { useRef, useState } from "react";

type Ask = { text: string; ok: string; input?: string };

// 앱 내장 브라우저 등은 window.confirm·prompt를 띄우지 않고 바로 취소로 돌려준다. 확인·입력은 페이지 안 창으로 받는다.
export function useDialog() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState("");
  const resolve = useRef<(v: string | null) => void>(() => {});

  function open(a: Ask) {
    resolve.current(null);
    setValue(a.input ?? "");
    setAsk(a);
    return new Promise<string | null>((r) => (resolve.current = r));
  }
  function close(v: string | null) {
    setAsk(null);
    resolve.current(v);
    resolve.current = () => {};
  }

  const confirm = (text: string, ok = "확인") => open({ text, ok }).then((v) => v !== null);
  const prompt = (text: string, initial: string, ok = "저장") => open({ text, ok, input: initial });

  const dialog = ask && (
    <div className="modal-veil" role="dialog" aria-modal="true">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          close(ask.input === undefined ? "" : value);
        }}
      >
        <p style={{ margin: 0 }}>{ask.text}</p>
        {ask.input !== undefined && <input className="input" style={{ marginTop: 12 }} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />}
        <div className="actions">
          <button type="button" className="btn" onClick={() => close(null)}>취소</button>
          <button className="btn btn-primary">{ask.ok}</button>
        </div>
      </form>
    </div>
  );

  return { confirm, prompt, dialog };
}
