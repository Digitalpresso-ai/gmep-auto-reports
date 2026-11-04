// 보고서 HTML의 사진 자리(<div class="photos">)에 실제 사진을 넣는 규칙. 미리보기(브라우저)와 Word(서버)가 같이 쓴다.
// 고른 사진은 모두 선택 순서대로 키 없는 마지막 자리(참여 사진)에 넣는다(2026-11-04 사용자 요청: 사진 분류 없이 뒤에 모아서).
// 예전 생성 결과에는 AI가 섹션 옆에 둔 자리(data-photos)가 남아 있을 수 있어, 그 자리는 비워 둔다.

export const photoKey = (ref: { source: string; id: string }) => `${ref.source}:${ref.id}`;

export function parsePhotoKeys(attr: string | null | undefined): string[] | null {
  if (attr == null) return null;
  return attr.split(/\s+/).filter(Boolean);
}

/** boxes[i]는 i번째 자리의 data-photos 키 목록(없으면 null). 결과는 자리별로 넣을 키다. 참여 사진 자리가 없으면 마지막 자리에 넣는다. */
export function assignPhotos(boxes: (string[] | null)[], selected: string[]): string[][] {
  const out = boxes.map((): string[] => []);
  if (!boxes.length) return out;
  let general = boxes.findLastIndex((b) => b === null);
  if (general < 0) general = boxes.length - 1;
  out[general] = [...new Set(selected)];
  return out;
}
