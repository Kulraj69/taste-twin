export function TwinMark({ className = "", decorative = true }: { className?: string; decorative?: boolean }) {
  return (
    <svg className={className} width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden={decorative} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Taste Twin"}>
      <path d="M2 7h29v30H2z" fill="currentColor" />
      <path d="M18 11h28v30H18z" stroke="currentColor" strokeWidth="2" />
      <path d="M7 12h19v20H7z" fill="var(--mark-screen, #102b2b)" />
      <path d="M10 17h3v3h-3zm10 0h3v3h-3zm-7 8h7v3h-7zM34 19h3v3h-3zm6 0h3v3h-3zm-4 9h6v3h-6zM5 40h9v3H5z" fill="currentColor" />
    </svg>
  );
}
