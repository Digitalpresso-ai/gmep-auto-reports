// 보고서 HTML의 사진 자리(<div class="photos">)에 실제 사진을 나눠 넣는 규칙. 미리보기(브라우저)와 Word(서버)가 같이 쓴다.
// AI가 섹션 옆에 둔 자리에는 data-photos로 사진 키를 적어 둔다. 생성 뒤 사용자가 선택을 바꿀 수 있으므로
// 자리에 적힌 사진도 지금 선택된 것만 넣고, 어느 자리에도 없는 선택 사진은 키가 없는 마지막 자리(참여 사진)에 넣는다.

export const photoKey = (ref: { source: string; id: string }) => `${ref.source}:${ref.id}`;

export function parsePhotoKeys(attr: string | null | undefined): string[] | null {
  if (attr == null) return null;
  return attr.split(/\s+/).filter(Boolean);
}

/** boxes[i]는 i번째 자리의 data-photos 키 목록(없으면 null). 결과는 자리별로 넣을 키를 선택 순서대로 돌려준다. */
export function assignPhotos(boxes: (string[] | null)[], selected: string[]): string[][] {
  const order = new Map(selected.map((k, i) => [k, i]));
  const used = new Set<string>();
  const out = boxes.map((keys) => {
    if (!keys) return [];
    const mine = keys.filter((k) => order.has(k) && !used.has(k)).sort((a, b) => order.get(a)! - order.get(b)!);
    mine.forEach((k) => used.add(k));
    return mine;
  });
  const rest = selected.filter((k) => !used.has(k));
  if (!rest.length || !boxes.length) return out;
  let general = boxes.findLastIndex((b) => b === null);
  if (general < 0) general = boxes.length - 1;
  out[general] = [...out[general], ...rest];
  return out;
}
