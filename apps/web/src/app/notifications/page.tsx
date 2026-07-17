import type { Metadata } from "next";

import { getSession, requireViewer } from "@/lib/session";
import { NotificationsList } from "@/components/notifications/notifications-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  requireViewer(await getSession(), "/notifications");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <NotificationsList />
    </div>
  );
}
