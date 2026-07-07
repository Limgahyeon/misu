// 모델이 시각 메타데이터([7. 8. 23:14] 등)를 따라 출력한 경우 제거.
// 시각(HH:MM)이 포함된 대괄호 덩어리만 지우므로 일반 대사에는 영향 없음.
export function stripTimeMeta(text: string): string {
  return text.replace(/\[[^\]\n]*\d{1,2}:\d{2}[^\]\n]*\]\s*/g, "");
}
