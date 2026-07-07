import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { NotificationsList } from "@/components/notifications/notifications-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session.user) redirect("/login?returnTo=/notifications");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <NotificationsList />
    </div>
  );
}
