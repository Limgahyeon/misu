// 비용 안전장치 — 유저별 하루 메시지 한도와 유료 모델 접근 등급.
// 운영자(유저 1)는 무제한 + 전 모델, 나머지(친구 계정)는 하루 한도 + haiku 고정.

export const OWNER_USER_ID = 1;

// 친구 계정의 하루 대화 한도 (유저 메시지 기준). haiku 150건 ≈ 캐싱 적용 시 하루 수백 원 수준.
export const DAILY_MESSAGE_LIMIT = 150;

// KST 기준 '오늘 0시'를 DB의 UTC 시각 형식("YYYY-MM-DD HH:MM:SS")으로
export function kstDayStartUtc(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const dayStartMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    9 * 3600_000;
  return new Date(dayStartMs).toISOString().slice(0, 19).replace("T", " ");
}
