import LoginForm from "./LoginForm";

// 서버 컴포넌트 래퍼 — 카카오 키가 설정된 경우에만 버튼을 노출한다
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <LoginForm
      kakaoEnabled={!!process.env.KAKAO_REST_API_KEY}
      kakaoError={error === "kakao"}
    />
  );
}
