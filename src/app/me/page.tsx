import LogoutButton from "@/components/LogoutButton";
import { ProfileForm } from "@/components/ProfileModal";
import TabBar from "@/components/TabBar";

export default function MePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-24 pt-10">
      <ProfileForm inline />
      <LogoutButton />
      <TabBar active="/me" />
    </main>
  );
}
