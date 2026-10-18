/** The ASENS name tag. `compact` drops the label for small spaces. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M24 9h29a7 7 0 0 1 7 7v32a7 7 0 0 1-7 7H24L4 32z"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="32" r="4.2" fill="var(--brand)" />
        <rect x="35" y="36" width="9" height="9" fill="var(--green)" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 132 64" aria-hidden="true">
      <path
        d="M30 7h89a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H30L5 32z"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="32" r="4.5" fill="var(--brand)" />
      <rect x="45" y="37" width="7" height="7" fill="var(--green)" />
      <text
        x="54"
        y="44"
        fill="var(--brand)"
        fontFamily="Outfit, system-ui, sans-serif"
        fontSize="31"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        ase
      </text>
    </svg>
  );
}

/** A `.ase` suffix with the brand's green dot. */
export function Suffix() {
  return (
    <span className="tld">
      <i aria-hidden="true" />
      <span className="sr-only">.</span>ase
    </span>
  );
}
