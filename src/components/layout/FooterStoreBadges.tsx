function GooglePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="site-footer__play-icon" aria-hidden>
      <path
        d="M1.5 1.9v20.2c0 .5.3.9.8 1.1l11.1-10.2L2.3 1.8c-.5.2-.8.6-.8 1.1Z"
        fill="#4285F4"
      />
      <path
        d="M13.4 12 2.3 22.2l10.2 5.9c.5.3 1.1-.1 1.1-.7V12h-.2Z"
        fill="#34A853"
      />
      <path
        d="M22.1 10.6c.4.3.4.9 0 1.2l-2.4 1.4-3-2.8 3-2.8 2.4 1.4c.4.3.4.9 0 1.2Z"
        fill="#FBBC04"
      />
      <path
        d="M13.4 12 22.1 10.6c.4-.3.4-.9 0-1.2L13.4 6.6 10.4 9.4 13.4 12Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="site-footer__apple-icon" aria-hidden>
      <path
        fill="currentColor"
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"
      />
    </svg>
  );
}

export interface FooterStoreLinkProps {
  href: string;
  store: 'google' | 'apple';
  label: string;
  ariaLabel: string;
}

export function FooterStoreLink({ href, store, label, ariaLabel }: FooterStoreLinkProps) {
  return (
    <a
      href={href}
      className="site-footer__store-badge"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
    >
      {store === 'google' ? <GooglePlayIcon /> : <AppStoreIcon />}
      <span className="site-footer__store-name">{label}</span>
    </a>
  );
}
