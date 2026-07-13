// 카카오 로그인 플로우에서 라우트들이 공유하는 쿠키 이름과 타입.
// route.ts는 HTTP 메서드 외의 값 export가 금지라 여기에 둔다.

export const KAKAO_STATE_COOKIE = "misu-kakao-state";
export const KAKAO_PENDING_COOKIE = "misu-kakao-pending";

// 카카오 인증은 통과했지만 아직 초대 코드를 안 낸 '가입 대기' 상태
export interface KakaoPending {
  kakaoId: string;
  nickname: string;
  exp: number;
}
