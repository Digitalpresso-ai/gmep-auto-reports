#!/usr/bin/env python3
"""Regenerate every derived token file from assets/tokens/tokens.json.

Outputs: assets/tokens/tokens.css, tokens.dtcg.json, tailwind.theme.css (v4),
tailwind.preset.cjs (v3) and references/tokens.md.
Usage: python3 scripts/build_tokens.py   (run from anywhere)
"""
import json, os, re
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(S, 'assets'); REF = os.path.join(S, 'references')
TW_NOTE = '/* Tailwind CSS v4 theme for jwdesign.\n   Usage (order matters, keep tokens.css UNLAYERED so its values win):\n     @import "tailwindcss";\n     @import "./tokens.css";\n     @import "./tailwind.theme.css";\n   Utilities: bg-surface, text-text-primary, border-border, bg-accent text-on-accent,\n   p-16 (= --space-16), rounded-md, shadow-md, text-body, font-sans, md:, ease-out …\n   Tailwind\'s default colors are cleared so only jwdesign tokens exist. */'
T=json.load(open(f'{A}/tokens/tokens.json'))
themes=[t['id'] for t in T['color']['themes']]
cmap={t['name']:t for t in T['color']['tokens']}

def val(tok,th):
    v=tok['value']
    if isinstance(v,str): return v
    return v.get(th, v.get(themes[0]))
def resolve(name,th,depth=0):
    v=val(cmap[name],th)
    m=re.fullmatch(r'\{(.+)\}',v)
    return resolve(m.group(1),th,depth+1) if m else v
def css_val(v): return re.sub(r'\{([^}]+)\}', r'var(--\1)', v)

# ---------- tokens.css ----------
fams=[k for k,v in T.items() if isinstance(v,dict) and 'tokens' in v and k not in ('color','shadow')]
def theme_block(th):
    out=[]
    for tok in T['color']['tokens']: out.append(f'  --{tok["name"]}: {css_val(val(tok,th))};')
    for tok in T['shadow']['tokens']: out.append(f'  --{tok["name"]}: {val(tok,th)};')
    out.append(f'  color-scheme: {th};')
    return '\n'.join(out)
L=['/* jwdesign design tokens — generated from tokens.json. Do not edit by hand. */',
   '/* Themes: <html data-theme="light|dark">. Without the attribute, follows prefers-color-scheme. */','']
for f in T['type']['fonts']:
    L.append(f"@font-face {{ font-family: '{f['family']}'; src: url('../fonts/{os.path.basename(f['file'])}') format('woff2'); font-weight: {f['weight']}; font-style: {f.get('style','normal')}; font-display: swap; }}")
L+=['',':root, [data-theme="light"] {',theme_block('light'),'}','','[data-theme="dark"] {',theme_block('dark'),'}','',
    '@media (prefers-color-scheme: dark) {','  :root:not([data-theme="light"]) {',re.sub(r'^','  ',theme_block('dark'),flags=re.M),'  }','}','',':root {']
for fam in fams:
    for tok in T[fam]['tokens']: L.append(f'  --{tok["name"]}: {tok["value"]};')
for k,s in T['type']['families'].items(): L.append(f'  --font-{k}: {s};')
L.append('}'); L.append('')
L.append('/* Type styles: class .type-<name> */')
for g in T['type']['groups']:
    for s in g['styles']:
        fam=s.get('family',g['family'])
        L.append(f".type-{s['name']} {{ font-family: var(--font-{fam}); font-size: {s['fontSize']}; line-height: {s['lineHeight']}; font-weight: {s['fontWeight']}; letter-spacing: {s.get('letterSpacing','normal')}; }}")
open(f'{A}/tokens/tokens.css','w').write('\n'.join(L)+'\n')

# ---------- DTCG ----------
def dt_color(th):
    o={}
    for tok in T['color']['tokens']:
        v=val(tok,th); o[tok['name']]={'$type':'color','$value':v if not v.startswith('{') else '{color.'+th+'.'+v[1:-1]+'}','$description':tok.get('usage','')}
    return o
dtcg={'$description':'jwdesign tokens in W3C DTCG format (for Style Dictionary, Tokens Studio, Figma variables). Source of truth: tokens.json.',
 'color':{'light':dt_color('light'),'dark':dt_color('dark')},
 'shadow':{th:{t['name']:{'$type':'shadow-css','$value':val(t,th),'$description':t.get('usage','')} for t in T['shadow']['tokens']} for th in themes},
 'fontFamily':{k:{'$type':'fontFamily','$value':v} for k,v in T['type']['families'].items()},
 'typography':{s['name']:{'$type':'typography','$value':{'fontFamily':'{fontFamily.'+s.get('family',g['family'])+'}','fontSize':s['fontSize'],'lineHeight':s['lineHeight'],'fontWeight':s['fontWeight'],'letterSpacing':s.get('letterSpacing','0')},'$description':s.get('usage','')} for g in T['type']['groups'] for s in g['styles']}}
for fam in fams:
    typ={'spacing':'dimension','radius':'dimension','size':'dimension','breakpoint':'dimension','duration':'duration','easing':'cubicBezier','zIndex':'number','opacity':'number'}.get(fam,'other')
    dtcg[fam]={t['name']:{'$type':typ,'$value':t['value'],'$description':t.get('usage','')} for t in T[fam]['tokens']}
json.dump(dtcg,open(f'{A}/tokens/tokens.dtcg.json','w'),ensure_ascii=False,indent=2)

# ---------- Tailwind ----------
sem=[t['name'] for t in T['color']['tokens'] if not re.match(r'^(gray|blue|red|orange|green)-',t['name'])]
prim=[t['name'] for t in T['color']['tokens'] if re.match(r'^(gray|blue|red|orange|green)-',t['name'])]
tw4=[TW_NOTE,'@theme inline {','  --color-*: initial;']
for n in sem+prim: tw4.append(f'  --color-{n}: var(--{n});')
for t in T['spacing']['tokens']: tw4.append(f'  --spacing-{t["name"].replace("space-","")}: var(--{t["name"]});')
for t in T['radius']['tokens']: tw4.append(f'  --radius-{t["name"].replace("radius-","")}: var(--{t["name"]});')
for t in T['shadow']['tokens']:
    if t['name'].startswith('shadow-'): tw4.append(f'  --shadow-{t["name"].replace("shadow-","")}: var(--{t["name"]});')
for k in T['type']['families']: tw4.append(f'  --font-{k}: var(--font-{k});')
for g in T['type']['groups']:
    for s in g['styles']:
        tw4.append(f'  --text-{s["name"]}: {s["fontSize"]};'); tw4.append(f'  --text-{s["name"]}--line-height: {s["lineHeight"]};')
        tw4.append(f'  --text-{s["name"]}--font-weight: {s["fontWeight"]};')
        if s.get('letterSpacing'): tw4.append(f'  --text-{s["name"]}--letter-spacing: {s["letterSpacing"]};')
for t in T['breakpoint']['tokens']: tw4.append(f'  --breakpoint-{t["name"].replace("bp-","")}: {t["value"]};')
for t in T['easing']['tokens']: tw4.append(f'  --ease-{t["name"].replace("ease-","")}: var(--{t["name"]});')
tw4.append('}')
open(f'{A}/tokens/tailwind.theme.css','w').write('\n'.join(tw4)+'\n')
tw3={'colors':{n:f'var(--{n})' for n in sem+prim},
 'spacing':{t['name'].replace('space-',''):f'var(--{t["name"]})' for t in T['spacing']['tokens']},
 'borderRadius':{t['name'].replace('radius-',''):f'var(--{t["name"]})' for t in T['radius']['tokens']},
 'boxShadow':{t['name'].replace('shadow-',''):f'var(--{t["name"]})' for t in T['shadow']['tokens'] if t['name'].startswith('shadow-')},
 'fontFamily':{k:[f'var(--font-{k})'] for k in T['type']['families']},
 'fontSize':{s['name']:[s['fontSize'],{'lineHeight':s['lineHeight'],'fontWeight':str(s['fontWeight']),**({'letterSpacing':s['letterSpacing']} if s.get('letterSpacing') else {})}] for g in T['type']['groups'] for s in g['styles']},
 'screens':{t['name'].replace('bp-',''):t['value'] for t in T['breakpoint']['tokens']},
 'transitionTimingFunction':{t['name'].replace('ease-',''):f'var(--{t["name"]})' for t in T['easing']['tokens']},
 'transitionDuration':{t['name'].replace('duration-',''):f'var(--{t["name"]})' for t in T['duration']['tokens']},
 'zIndex':{t['name'].replace('z-',''):t['value'] for t in T['zIndex']['tokens']}}
open(f'{A}/tokens/tailwind.preset.cjs','w').write('/** Tailwind CSS v3 preset. Load tokens.css first; every value is a CSS variable so dark mode follows data-theme. */\nmodule.exports = {\n  darkMode: ["selector", \'[data-theme="dark"]\'],\n  theme: ' + json.dumps(tw3,ensure_ascii=False,indent=2).replace('\n','\n  ') + ',\n};\n')

# ---------- tokens.md ----------
M=['# jwdesign tokens','','Generated from `assets/tokens/tokens.json`. CSS variable = `--<name>`. Light/Dark are resolved hex values.','','## Semantic colors','','| token | light | dark | usage |','|---|---|---|---|']
for n in sem: M.append(f'| `{n}` | `{resolve(n,"light")}` | `{resolve(n,"dark")}` | {cmap[n].get("usage","")} |')
M+=['','## Primitive scales (reference only — never paint UI with these directly)','','| token | value |','|---|---|']
for n in prim: M.append(f'| `{n}` | `{resolve(n,"light")}` |')
M+=['','## Typography','',f'Families: ' + ' · '.join(f'`--font-{k}`: {v}' for k,v in T['type']['families'].items()),'','| style (class `.type-<name>`) | size / line | weight | tracking | usage |','|---|---|---|---|---|']
for g in T['type']['groups']:
    for s in g['styles']: M.append(f'| `{s["name"]}` | {s["fontSize"]} / {s["lineHeight"]} | {s["fontWeight"]} | {s.get("letterSpacing","0")} | {s.get("usage","")} |')
M+=['','## Shadows','','| token | light | dark | usage |','|---|---|---|---|']
for t in T['shadow']['tokens']: M.append(f'| `{t["name"]}` | `{val(t,"light")}` | `{val(t,"dark")}` | {t.get("usage","")} |')
for fam in fams:
    M+=['',f'## {fam}','']
    if T[fam].get('note'): M+=[T[fam]['note'],'']
    M+=['| token | value | usage |','|---|---|---|']
    for t in T[fam]['tokens']: M.append(f'| `{t["name"]}` | `{t["value"]}` | {t.get("usage","")} |')
open(f'{REF}/tokens.md','w').write('\n'.join(M)+'\n')

print('tokens rebuilt')

# ---------- prefixed variant (--jw-*) for Tailwind v4 projects ----------
# Tailwind v4 owns the --color-*, --radius-*, --shadow-*, --font-*, --ease-* namespaces. The
# unprefixed tokens.css reuses some of those names (radius-md, shadow-md, font-sans…), which
# works only while tokens.css stays unlayered. The prefixed pair below never collides.
def pfx(v): return re.sub(r'var\(--([A-Za-z0-9_.-]+)\)', r'var(--jw-\1)', css_val(v))
def pblock(th):
    out=[]
    for tok in T['color']['tokens']: out.append(f'  --jw-{tok["name"]}: {pfx(val(tok,th))};')
    for tok in T['shadow']['tokens']: out.append(f'  --jw-{tok["name"]}: {val(tok,th)};')
    return '\n'.join(out)
PL=['/* jwdesign tokens, prefixed --jw-* — generated from tokens.json. Do not edit by hand.',
    '   Light by default; dark with class="dark" or data-theme="dark" on any ancestor.',
    '   Pair with tailwind.theme.jw.css in Tailwind v4 projects. */','']
for f in T['type']['fonts']:
    PL.append(f"@font-face {{ font-family: '{f['family']}'; src: url('../fonts/{os.path.basename(f['file'])}') format('woff2'); font-weight: {f['weight']}; font-style: {f.get('style','normal')}; font-display: swap; }}")
PL+=['',':root, .light, [data-theme="light"] {',pblock('light'),'  color-scheme: light;','}','','.dark, [data-theme="dark"] {',pblock('dark'),'  color-scheme: dark;','}','',':root {']
for fam in fams:
    for tok in T[fam]['tokens']: PL.append(f'  --jw-{tok["name"]}: {tok["value"]};')
for k,s in T['type']['families'].items(): PL.append(f'  --jw-font-{k}: {s};')
PL.append('}')
open(f'{A}/tokens/tokens.jw.css','w').write('\n'.join(PL)+'\n')
TJ=['/* Tailwind CSS v4 theme over the prefixed tokens (no namespace collisions, safe in any layer).',
    '     @import "tailwindcss";',
    '     @import "./tokens.jw.css";',
    '     @import "./tailwind.theme.jw.css";',
    '   Utilities: bg-surface text-text-primary border-border bg-accent text-on-accent rounded-md shadow-md',
    '   p-16 (= space-16) text-body font-sans … Tailwind default colors are kept; add `--color-*: initial;`',
    '   inside @theme if you want only jwdesign colors. */','@theme inline {']
for n in sem+prim: TJ.append(f'  --color-{n}: var(--jw-{n});')
for t in T['spacing']['tokens']: TJ.append(f'  --spacing-{t["name"].replace("space-","")}: var(--jw-{t["name"]});')
for t in T['radius']['tokens']: TJ.append(f'  --radius-{t["name"].replace("radius-","")}: var(--jw-{t["name"]});')
for t in T['shadow']['tokens']:
    if t['name'].startswith('shadow-'): TJ.append(f'  --shadow-{t["name"].replace("shadow-","")}: var(--jw-{t["name"]});')
for k in T['type']['families']: TJ.append(f'  --font-{k}: var(--jw-font-{k});')
for g in T['type']['groups']:
    for s in g['styles']:
        TJ.append(f'  --text-{s["name"]}: {s["fontSize"]};'); TJ.append(f'  --text-{s["name"]}--line-height: {s["lineHeight"]};')
        TJ.append(f'  --text-{s["name"]}--font-weight: {s["fontWeight"]};')
        if s.get('letterSpacing'): TJ.append(f'  --text-{s["name"]}--letter-spacing: {s["letterSpacing"]};')
for t in T['breakpoint']['tokens']: TJ.append(f'  --breakpoint-{t["name"].replace("bp-","")}: {t["value"]};')
for t in T['easing']['tokens']: TJ.append(f'  --ease-{t["name"].replace("ease-","")}: var(--jw-{t["name"]});')
TJ.append('}')
TJ+=['','@utility focus-ring {','  box-shadow: var(--jw-focus-ring);','}']
open(f'{A}/tokens/tailwind.theme.jw.css','w').write('\n'.join(TJ)+'\n')
print('prefixed tokens rebuilt')
