import { requirePageSession } from "@/lib/auth/page";
import { getStore } from "@/lib/store";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageSession();
  const data = await getStore().readData();
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">AI proposals ani WhatsApp messages hech vachtat.</p>
      </div>
      <SettingsForm initial={data.settings} />
    </>
  );
}
