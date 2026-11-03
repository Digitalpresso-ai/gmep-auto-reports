import base64
import html
import json
import os
from pathlib import Path
from urllib.parse import quote
from .trace_check import verify_trace


STYLE = '''
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text-primary);font:var(--body-font-size,15px)/1.6 var(--font-sans);height:100vh;display:flex;flex-direction:column;overflow:hidden}
button,input,select{font:inherit;color:inherit}button,a,input,select{outline:none}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{box-shadow:var(--focus-ring)}
header{padding:var(--space-24) var(--space-32);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:var(--space-24)}
h1{font-size:24px;line-height:1.4;margin:0;font-weight:700;letter-spacing:-.5px}h2{font-size:20px;margin:0}h3{font-size:14px;margin:0 0 var(--space-8);color:var(--text-secondary)}p{margin:var(--space-8) 0}.muted{color:var(--text-secondary)}.caption{font-size:12px;color:var(--text-tertiary)}
button,select{border:1px solid var(--border);background:var(--surface);border-radius:var(--radius-md);padding:var(--space-8) var(--space-12);cursor:pointer}a{color:var(--accent);text-underline-offset:3px}input{width:100%;border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-8) var(--space-12);background:var(--surface)}
.layout{display:grid;grid-template-columns:360px minmax(0,1fr);flex:1;min-height:0}aside{border-right:1px solid var(--border);overflow:auto;background:var(--bg-subtle)}.filters{padding:var(--space-16);display:grid;gap:var(--space-8);border-bottom:1px solid var(--border)}.step{display:block;text-align:left;width:100%;padding:var(--space-16) var(--space-24);border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent}.step[aria-current=true]{background:var(--selected)}.step strong{font-size:14px}.step p{font-size:13px;margin:4px 0}.step .head{display:flex;justify-content:space-between;gap:8px}.badge{font-size:12px;color:var(--success-text);white-space:nowrap}.badge.failed{color:var(--danger-text)}main{overflow:auto;padding:var(--space-32);max-width:1100px;width:100%}.meta{display:flex;flex-wrap:wrap;gap:var(--space-16);font-size:12px;color:var(--text-secondary);margin:var(--space-16) 0}.panel{padding:var(--space-24) 0;border-top:1px solid var(--border)}pre{font:13px/1.7 var(--font-mono);padding:var(--space-16);background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-24)}#bindings,#consumers{display:flex;flex-wrap:wrap;gap:8px}#issues{padding:var(--space-16) var(--space-32);background:var(--danger-soft);color:var(--danger-text)}#empty-state{padding:var(--space-24)}[hidden]{display:none!important}@media(max-width:800px){header{padding:var(--space-16);align-items:flex-start}h1{font-size:20px}.layout{grid-template-columns:1fr;height:auto}aside{border-right:0;max-height:420px}main{padding:var(--space-24)}.columns{grid-template-columns:1fr}body{height:auto;overflow:auto}}
'''
SCRIPT = r'''
const data = JSON.parse(document.getElementById('order-flow-data').textContent);
const steps = data.steps; const list = document.getElementById('steps'); const search = document.getElementById('search'); const filter = document.getElementById('status-filter');
let selected = steps.length ? steps[0].id : null;
function text(id,value){document.getElementById(id).textContent=value;}
function json(id,value){text(id,JSON.stringify(value,null,2));}
function drawList(){
 list.replaceChildren(); let count=0;
 for (const step of steps){
  const route=step.state?step.state.before.screen+' '+step.state.after?.screen+' '+step.state.before.feature:'';
  if (!(step.operation+' '+step.description+' '+route).toLowerCase().includes(search.value.toLowerCase()) || (filter.value && step.status!==filter.value)) continue;
  count++; const button=document.createElement('button'); button.className='step'; button.dataset.stepId=step.id; button.setAttribute('aria-current',String(selected===step.id));
  const head=document.createElement('div');head.className='head';const title=document.createElement('strong');title.textContent=String(step.index+1).padStart(2,'0')+'  '+step.operation;
  const state=document.createElement('span');state.className='badge '+step.status;state.textContent=step.status==='completed'?'완료':step.status==='failed'?'실패':'미완료';head.append(title,state);
  const description=document.createElement('p');description.textContent=step.description; const time=document.createElement('span');time.className='caption';time.textContent=(step.duration_ms??'—')+' ms · context v'+step.context_version;
  button.append(head,description,time);button.onclick=()=>select(step.id);list.append(button);
 }
 document.getElementById('empty-state').hidden=count!==0;text('step-count',count+' / '+steps.length+' 단계');
}
function select(id){
 const step=steps.find(s=>s.id===id);if(!step)return;selected=id;document.getElementById('detail').hidden=false;document.getElementById('detail').dataset.selectedStep=id;
 text('step-title',step.operation);text('step-description',step.description);text('context-version','컨텍스트 v'+step.context_version);text('step-time',new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(step.started_at))+' · '+(step.duration_ms??'—')+' ms');text('step-state',step.status==='completed'?'실행 완료':step.status==='failed'?'실행 실패':'실행 미완료');
 json('input-data',step.inputs);json('context-data',step.context);json('output-data',step.output);json('error-data',step.error);document.getElementById('error-panel').hidden=!step.error;
 const observed=step.state;document.getElementById('state-panel').hidden=!observed;
 text('state-route',observed?observed.before.screen+' → '+(observed.after?.screen??'관측 미완료')+' · 기능 '+observed.before.feature+' → '+(observed.after?.feature??'미완료'):'');
 json('state-before',observed?.before??null);json('state-after',observed?.after??null);json('state-delta',observed?.delta??null);
 json('ui-mapping',step.ui);text('code-location',step.code?step.code.file+':'+step.code.line:'기록된 코드 위치 없음');
 const bindings=document.getElementById('bindings');bindings.replaceChildren();
 for(const binding of step.bindings){
  const button=document.createElement('button');
  if(binding.source==='step'){const source=steps.find(s=>s.id===binding.step_id);button.dataset.sourceStep=binding.step_id;button.textContent=(source?String(source.index+1).padStart(2,'0')+' '+source.operation:'알 수 없는 단계')+(binding.path||' /')+' → '+binding.input;button.onclick=()=>{search.value='';filter.value='';select(binding.step_id);};}
  else {button.textContent='context v'+binding.context_version+(binding.path||' /')+' → '+binding.input;button.onclick=()=>document.getElementById('context-data').scrollIntoView({block:'nearest'});}
  bindings.append(button);
 }
 const consumers=document.getElementById('consumers');consumers.replaceChildren();
 for(const target of steps){for(const binding of target.bindings){
  if(binding.source!=='step'||binding.step_id!==id)continue;
  const button=document.createElement('button');button.dataset.targetStep=target.id;
  button.textContent=String(target.index+1).padStart(2,'0')+' '+target.operation+' · '+(binding.path||'/')+' → '+binding.input;
  button.onclick=()=>{search.value='';filter.value='';select(target.id);};consumers.append(button);
 }}
 if(!consumers.children.length){const note=document.createElement('span');note.className='muted';note.textContent='이 결과를 참조하는 다음 단계가 없어요.';consumers.append(note);}
 if(!step.bindings.length){const note=document.createElement('span');note.className='muted';note.textContent='참조 연결 없음 · 직접 입력한 값';bindings.append(note);}
 drawList();
}
text('flow-name',data.name||'실행 기록');text('flow-status',data.valid?'기대 흐름 검증 통과':'검증 실패 또는 미완료');
const issues=document.getElementById('issues');issues.hidden=!data.issues.length;issues.textContent=data.issues.join(' · ');
search.oninput=drawList;filter.onchange=drawList;document.getElementById('theme-toggle').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
if(selected)select(selected);else{document.getElementById('detail').hidden=true;drawList();}
'''


def write_trace_view(trace_path, output_path, expected=None):
    trace_path, output_path = Path(trace_path).resolve(), Path(output_path).resolve()
    data = verify_trace(trace_path, expected)
    assets = Path(__file__).parent / 'assets'
    css = (assets / 'tokens.css').read_text()
    for font in ['PretendardVariable.woff2', 'JetBrainsMono-latin-wght.woff2']:
        encoded = base64.b64encode((assets / font).read_bytes()).decode()
        css = css.replace('../fonts/' + font, 'data:font/woff2;base64,' + encoded)
    payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    source = quote(os.path.relpath(trace_path, output_path.parent), safe='/')
    document = '''<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proofstill · 실행 흐름</title><style>__CSS__</style></head><body>
<header><div><div class="caption">PROOFSTILL / WORKFLOW TRACE</div><h1 id="flow-name"></h1><p class="muted"><span id="flow-status"></span> · <span id="step-count"></span></p></div><div><a href="__SOURCE__">원본 JSONL</a> <button id="theme-toggle" type="button">테마 바꾸기</button></div></header>
<div id="issues" role="status" hidden></div><div class="layout"><aside aria-label="실행 단계"><div class="filters"><label for="search" class="caption">작업이나 설명으로 찾기</label><input id="search" placeholder="조회, orders.lookup…" type="search"><label for="status-filter" class="caption">실행 상태</label><select id="status-filter"><option value="">모든 상태</option><option value="completed">완료</option><option value="failed">실패</option><option value="incomplete">미완료</option></select></div><div id="steps"></div><div id="empty-state" class="muted" hidden>조건에 맞는 단계가 없어요.</div></aside>
<main id="detail" data-selected-step=""><h2 id="step-title"></h2><p id="step-description" class="muted"></p><div class="meta"><span id="step-state"></span><span id="context-version"></span><span id="step-time"></span></div>
<section class="panel" id="state-panel" hidden><h3>기능·화면과 상태 수명</h3><p id="state-route"></p><div class="columns"><div><h3>작업 전 실제 상태</h3><pre id="state-before"></pre></div><div><h3>작업 후 실제 상태</h3><pre id="state-after"></pre></div></div><h3>필드 변화 · 생성 / 유지 / 변경 / 제거</h3><pre id="state-delta"></pre><p class="caption">앱이 노출한 상태의 최상위 data 필드를 비교해요. retained는 값이 같은 필드, changed는 내부 값이 바뀐 필드예요.</p></section>
<section class="panel"><h3>데이터가 온 곳</h3><div id="bindings"></div></section><section class="panel"><h3>이 결과를 사용하는 다음 단계</h3><div id="consumers"></div></section><div class="columns"><section class="panel"><h3>이 단계에 전달한 입력</h3><pre id="input-data"></pre></section><section class="panel"><h3>실행 당시 컨텍스트</h3><pre id="context-data"></pre></section></div><section class="panel"><h3>실제 실행 결과</h3><pre id="output-data"></pre></section><section class="panel" id="error-panel" hidden><h3>실패 원인</h3><pre id="error-data"></pre></section><section class="panel"><h3>UI 연결 정보 · 선언한 매핑</h3><pre id="ui-mapping"></pre><p class="caption">화면·행동 연결 정보예요. 제품 UI 클릭의 실행 증거를 뜻하지 않아요.</p></section><section class="panel"><h3>실행한 코드 위치</h3><p id="code-location" class="caption"></p></section></main></div>
<script id="order-flow-data" type="application/json">__DATA__</script><script>__SCRIPT__</script></body></html>'''
    document = document.replace('__CSS__', css + STYLE).replace('__SOURCE__', html.escape(source, quote=True)).replace('__SCRIPT__', SCRIPT).replace('__DATA__', payload)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(document)
    return output_path
