import webpush from "web-push";
import { deletePushSubscription, getPushSubscriptions } from "./db";

webpush.setVapidDetails(
  "mailto:ghlim0215@gmail.com",
  process.env.VAPID_PUBLIC_KEY ?? "",
  process.env.VAPID_PRIVATE_KEY ?? ""
);

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // 알림 탭 시 열 경로 (예: /chat/seoyul)
}

// 등록된 모든 기기로 발송. 만료된 구독(410/404)은 정리한다.
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  const subs = await getPushSubscriptions();
  let sent = 0;
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(
          JSON.parse(row.subscription),
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deletePushSubscription(row.endpoint);
        } else {
          console.error("push failed:", status, err);
        }
      }
    })
  );
  return sent;
}
