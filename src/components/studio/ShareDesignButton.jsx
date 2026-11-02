import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, Copy, ExternalLink, Loader2, Mail, Plus, X, Check } from "lucide-react";
import { useStudio } from "@/lib/growroom/StudioStore";
import { apiUrl } from "@/lib/api";

// Share the current design: the server stores a copy and hands back a token,
// the link /view/<token> opens it read-only in 3D for 7 days, and it can be
// emailed to up to 5 people (sent by ZATLA's server through Resend). Mirrors
// GrowStudios' ShareLinkButton, minus the login.
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const MAX_RECIPIENTS = 5;
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-white/60";
const FIELD = "h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-400";

// What leaves the browser: the design only. Model URLs are left out — the viewer
// reads the live model library itself (a model imported into this browser's
// library would not exist for the person opening the link anyway).
const SKIP = new Set(["globalModels", "models", "thumbnail", "thumbnail_url", "thumbnail_svg", "thumbnail_2d_svg"]);
const shareable = (doc) => Object.fromEntries(Object.entries(doc || {}).filter(([k]) => !SKIP.has(k)));

async function api(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export default function ShareDesignButton({ className = "" }) {
  const { doc } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [share, setShare] = useState(null); // { token, expiresAt }
  const [recipients, setRecipients] = useState([""]);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const url = share ? `${window.location.origin}/view/${share.token}` : "";
  const expires = share ? new Date(share.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const openDialog = () => { setOpen(true); setError(""); setNotice(""); };

  const createLink = async () => {
    setBusy(true); setError("");
    try {
      const r = await api("/api/shares", { design: shareable(doc) });
      setShare({ token: r.token, expiresAt: r.expiresAt });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const sendEmail = async () => {
    const list = recipients.map((r) => r.trim()).filter(Boolean);
    setError(""); setNotice("");
    if (!list.length) { setError("Add at least one recipient."); return; }
    const bad = list.find((r) => !EMAIL_RE.test(r));
    if (bad) { setError(`"${bad}" doesn't look like an email address.`); return; }
    setBusy(true);
    try {
      const r = await api(`/api/shares/${share.token}/email`, { to: list, message: message.trim() });
      setNotice(r.failed?.length
        ? `Sent to ${r.sent.join(", ")}. Couldn't send to ${r.failed.join(", ")}.`
        : `Sent to ${r.sent.join(", ")}.`);
      setRecipients([""]); setMessage("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setError("Couldn't copy the link — select it and copy it by hand."); }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`inline-flex h-[38px] items-center gap-1.5 rounded-full border border-white/15 bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-lg hover:bg-emerald-500 ${className}`}
      >
        <Share2 className="h-3.5 w-3.5" /> Share
      </button>

      {/* Portalled to <body>: the button sits in a click-through (pointer-events:
          none) strip over the 3D, and the dialog must not inherit that. */}
      {open && createPortal(
        <div
          className="pointer-events-auto fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14181a] p-5 text-white shadow-2xl">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 id="share-title" className="text-base font-semibold">Share this 3D design</h2>
              <button type="button" onClick={() => !busy && setOpen(false)} aria-label="Close" className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-white/60">
              Anyone with the link can view this design in 3D for 7 days. It shows the design as it is now; later edits aren't included.
            </p>

            {!share ? (
              <button type="button" disabled={busy} onClick={createLink} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Create share link
              </button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className={LABEL}>Link · works until {expires}</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${FIELD} flex-1`} />
                    <button type="button" onClick={copy} title="Copy link" aria-label="Copy link" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 hover:bg-white/10">
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <a href={url} target="_blank" rel="noreferrer" title="Open" aria-label="Open link" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 hover:bg-white/10">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className={LABEL}>Email link to</p>
                  {recipients.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="email" inputMode="email" autoComplete="email" placeholder="name@company.com"
                        value={r}
                        onChange={(e) => setRecipients((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                        className={FIELD}
                      />
                      {recipients.length > 1 && (
                        <button type="button" onClick={() => setRecipients((l) => l.filter((_, x) => x !== i))} aria-label="Remove recipient" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {recipients.length < MAX_RECIPIENTS && (
                    <button type="button" onClick={() => setRecipients((l) => [...l, ""])} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Plus className="h-3.5 w-3.5" /> Add recipient
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className={LABEL}>Message (optional)</p>
                  <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className={`${FIELD} h-auto py-2.5`} />
                </div>

                <button type="button" disabled={busy} onClick={sendEmail} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Mail className="h-4 w-4" /> Send link</>}
                </button>
              </div>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
            {notice && <p role="status" className="mt-3 text-sm text-emerald-400">{notice}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
