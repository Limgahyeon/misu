"use client";

import { useState } from "react";
import ProfileModal from "./ProfileModal";

export default function ProfileButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute right-0 top-1 flex items-center gap-1 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs text-zinc-500 shadow-sm backdrop-blur transition-colors hover:text-zinc-700"
      >
        💌 내 정보
      </button>
      {open && <ProfileModal onClose={() => setOpen(false)} />}
    </>
  );
}
