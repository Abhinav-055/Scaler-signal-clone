"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { api, ApiError, DEMO_OTP } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Button, Spinner } from "@/components/ui/controls";
import { SignalWordmark } from "@/components/ui/SignalBrand";

const COUNTRIES = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
];

const DEMO_ACCOUNTS = [
  { name: "Aarav", number: "9800000001" },
  { name: "Priya", number: "9800000002" },
  { name: "Rohan", number: "9800000003" },
];

type Step = "phone" | "code" | "profile";

export default function LoginPage() {
  const router = useRouter();
  const { status, user, bootstrap } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState("+91");
  const [number, setNumber] = useState("");

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Already logged in with a profile: go to the app.
  useEffect(() => {
    if (status === "authenticated" && user?.display_name) router.replace("/chats");
  }, [status, user, router]);
  // Logged in but no name yet: the profile step is the only thing left to do.
  const currentStep: Step = status === "authenticated" && user && !user.display_name ? "profile" : step;

  const phone = `${country}${number.replace(/\D/g, "")}`;

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-panel px-4 py-8">
      <div className="w-full max-w-[400px]">
        {currentStep === "phone" && (
          <PhoneStep
            country={country}
            number={number}
            onCountry={setCountry}
            onNumber={setNumber}
            phone={phone}
            onDone={() => setStep("code")}
          />
        )}
        {currentStep === "code" && <CodeStep phone={phone} onBack={() => setStep("phone")} />}
        {currentStep === "profile" && <ProfileStep />}
      </div>
    </main>
  );
}

function PhoneStep(props: {
  country: string;
  number: string;
  phone: string;
  onCountry: (c: string) => void;
  onNumber: (n: string) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digits = props.number.replace(/\D/g, "");
  const valid = digits.length >= 7 && digits.length <= 14;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/request-otp", { method: "POST", body: { phone: props.phone } });
      props.onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-center text-center">
      <SignalWordmark size={48} />
      <h1 className="mt-6 text-[26px] font-semibold">Phone number</h1>
      <p className="mt-2 text-secondary">Enter your phone number to get started.</p>

      <div className="mt-8 flex w-full gap-2">
        <label className="sr-only" htmlFor="country">
          Country code
        </label>
        <select
          id="country"
          value={props.country}
          onChange={(e) => props.onCountry(e.target.value)}
          className="rounded-lg border border-border bg-panel px-2 py-3 text-[15px]"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          placeholder="Phone number"
          value={props.number}
          onChange={(e) => props.onNumber(e.target.value.replace(/[^\d\s-]/g, ""))}
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-3 text-[15px] outline-none focus:border-accent"
        />
      </div>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      <Button type="submit" disabled={!valid || busy} className="mt-8 w-full py-3">
        {busy ? <Spinner size={18} /> : "Continue"}
      </Button>

      <div className="mt-8 w-full rounded-xl bg-input/60 p-4 text-left">
        <p className="text-[13px] font-medium">Demo accounts</p>
        {DEMO_OTP && (
          <p className="mt-0.5 text-[12px] text-secondary">The verification code is always {DEMO_OTP}.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.number}
              type="button"
              onClick={() => {
                props.onCountry("+91");
                props.onNumber(a.number);
              }}
              className="rounded-full border border-border bg-panel px-3 py-1 text-[13px] hover:bg-hover"
            >
              {a.name} · {a.number}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function CodeStep({ phone, onBack }: { phone: string; onBack: () => void }) {
  const login = useAuth((s) => s.login);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  async function verify(code: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api<AuthResponse>("/auth/verify-otp", { method: "POST", body: { phone, code } });
      login(res); // the page effect moves on to the profile step or /chats
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function update(next: string[]) {
    setDigits(next);
    if (next.every((d) => d !== "")) void verify(next.join(""));
  }

  function onChange(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    // Handles typing one digit and pasting/autofilling several at once.
    const next = [...digits];
    let pos = i;
    for (const ch of clean) {
      if (pos > 5) break;
      next[pos++] = ch;
    }
    inputs.current[Math.min(pos, 5)]?.focus();
    update(next);
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
    }
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputs.current[i + 1]?.focus();
  }

  return (
    <div className="flex flex-col items-center text-center">
      <button onClick={onBack} className="self-start rounded-full p-2 hover:bg-hover" aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <h1 className="mt-2 text-[26px] font-semibold">Verification code</h1>
      <p className="mt-2 text-secondary">
        Enter the code we sent to <span className="font-medium text-text">{phone}</span>
      </p>
      {DEMO_OTP && <p className="mt-1 text-[13px] text-accent">Use {DEMO_OTP}</p>}

      <div className="mt-8 flex gap-2" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            className={`h-14 w-11 rounded-lg border bg-panel text-center text-[22px] font-semibold outline-none focus:border-accent sm:w-12 ${error ? "border-danger" : "border-border"}`}
          />
        ))}
      </div>
      <div className="mt-4 h-5 text-[13px]">
        {busy ? <Spinner size={16} className="text-accent" /> : error && <span className="text-danger">{error}</span>}
      </div>
    </div>
  );
}

function ProfileStep() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [avatar, setAvatar] = useState<{ url: string; publicId: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const name = `${first} ${last}`.trim();

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadToCloudinary(file, "avatar");
      setAvatar({ url: uploaded.secure_url, publicId: uploaded.public_id });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed. Using initials instead.");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await api<User>("/users/me", {
        method: "PATCH",
        body: {
          display_name: name,
          ...(avatar ? { avatar_url: avatar.url, avatar_public_id: avatar.publicId } : {}),
        },
      });
      setUser(updated);
      router.replace("/chats");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save your profile");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col items-center text-center">
      <h1 className="text-[26px] font-semibold">Set up your profile</h1>
      <p className="mt-2 text-secondary">Profiles are visible to people you message, contacts and groups.</p>

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="relative mt-8 rounded-full"
        aria-label="Choose profile photo"
      >
        <Avatar name={name || "?"} url={avatar?.url} color={user?.avatar_color} size={96} />
        <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-panel bg-input text-text">
          {uploading ? <Spinner size={14} /> : <Camera size={16} />}
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void pickPhoto(e.target.files?.[0])}
      />

      <div className="mt-8 flex w-full flex-col gap-3">
        <input
          autoFocus
          placeholder="First name (required)"
          aria-label="First name"
          value={first}
          maxLength={32}
          onChange={(e) => setFirst(e.target.value)}
          className="rounded-lg border border-border bg-panel px-3 py-3 text-[15px] outline-none focus:border-accent"
        />
        <input
          placeholder="Last name (optional)"
          aria-label="Last name"
          value={last}
          maxLength={31}
          onChange={(e) => setLast(e.target.value)}
          className="rounded-lg border border-border bg-panel px-3 py-3 text-[15px] outline-none focus:border-accent"
        />
      </div>

      <Button type="submit" disabled={!first.trim() || busy || uploading} className="mt-8 w-full py-3">
        {busy ? <Spinner size={18} /> : "Next"}
      </Button>
    </form>
  );
}
