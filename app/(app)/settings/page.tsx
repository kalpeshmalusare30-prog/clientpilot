import { requirePageSession } from "@/lib/auth/page";
import { getStore } from "@/lib/store";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageSession();
  const data = await getStore().readData();
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <SettingsForm initial={data.settings} />
    </>
  );
}
