'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  Beef,
  Settings,
  Keyboard,
  ArrowLeftRight,
  Menu,
  X,
  User,
  HelpCircle,
} from 'lucide-react';
import { Icon } from '@/components/Icon';
import ThemeToggle from './ThemeToggle';
import { useWallet } from '@/hooks/useWallet';
import { useAtRiskLoans } from '@/hooks/useAtRiskLoans';
import NotificationBadge from '@/components/NotificationBadge';
import { NotificationBell, NotificationDrawer } from '@/components/NotificationDrawer';
import { useNotifications } from '@/hooks/useNotifications';
import { useShortcutsHelp } from '@/components/KeyboardShortcutsProvider';
// i18n — Issue #1207
import LanguageSwitcher from '@/components/LanguageSwitcher';

const JWT_COOKIE_NAME = 'session';

/** Expires the JWT session cookie on disconnect — Issue #1208. */
function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${JWT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}

const NAV_SECTIONS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/loans', label: 'Loans', icon: ClipboardList },
  { href: '/collateral', label: 'Collateral', icon: Beef },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** Extra links that live in the desktop utility bar; shown in the mobile menu (#1415). */
const MOBILE_EXTRA_LINKS = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/help/faq', label: 'Help & FAQ', icon: HelpCircle },
] as const;

/**
 * Active-link indicator styles — closes #781
 *
 * Active state:
 *  - Bottom border (3 px, colour-primary token) acting as an underline pill.
 *  - Bold text in the primary token colour.
 *  - Background pill in primary with 10 % opacity — visible on both light/dark.
 *  - `aria-current="page"` for assistive technology.
 *
 * Design token colours satisfy WCAG AA contrast on the nav background
 * in both light mode (#5D3C15 on #FEFCF8 — ~10.8:1) and dark mode
 * (#F0D9B8 on #2A1B0B — ~10.4:1).
 *
 * Icons — #801: lucide-react replaces all emoji. Each icon is decorative
 * (aria-hidden) because the link label is visible text.
 *
 * Notification badge — #803: a red badge on the Dashboard link when any loan
 * has health factor < 1.2.
 */

const MOBILE_MENU_ID = 'mobile-nav-menu';

export default function Navbar() {
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const walletDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { address, connect, disconnect } = useWallet();
  const { atRiskCount } = useAtRiskLoans();
  const shortcutsHelp = useShortcutsHelp();
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } =
    useNotifications();

  /** Full auth-clearing disconnect — Issue #1208. */
  function handleDisconnect() {
    disconnect();
    clearSessionCookie();
    router.push('/');
  }

  // Close wallet dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (walletDropdownRef.current && !walletDropdownRef.current.contains(event.target as Node)) {
        setWalletDropdownOpen(false);
      }
    }

    if (walletDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [walletDropdownOpen]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Mobile menu: move focus into the panel on open, close on Escape or outside click.
  useEffect(() => {
    if (!mobileMenuOpen) return;

    mobileMenuRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!mobileMenuRef.current?.contains(target) && !menuButtonRef.current?.contains(target)) {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [mobileMenuOpen]);

  const truncatedAddress = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;

  // Suppress unused-var lint warnings for wallet actions used in future UI
  void connect;
  void disconnect;
  void truncatedAddress;
  void handleDisconnect;

  return (
    <nav
      aria-label="Main navigation"
      className="relative border-b px-3 sm:px-4"
      style={{
        backgroundColor: 'var(--color-nav-bg)',
        borderColor: 'var(--color-nav-border)',
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 h-14">
        {/* Brand */}
        <Link
          href="/"
          className="font-bold text-base sm:text-lg flex items-center gap-2 min-h-[44px] min-w-0 shrink"
          style={{ color: 'var(--color-text)' }}
        >
          <Icon icon={Beef} size="md" aria-hidden="true" className="text-current shrink-0" />
          <span className="truncate">StellarKraal</span>
        </Link>

        {/* Desktop nav */}
        <ul className="hidden lg:flex items-center gap-1" role="list">
          {NAV_SECTIONS.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            const isDashboard = href === '/dashboard';
            return (
              <li key={href}>
                {/*
                 * Active state (#781):
                 * — bottom border acts as a prominent underline-pill indicator
                 * — uses --token-primary so it automatically flips in dark mode
                 * — text colour also uses the token; background adds a subtle pill
                 */}
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg transition font-medium',
                    active ? 'border-b-[3px] font-bold' : 'hover:bg-[color:var(--token-primary)]/5',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    active
                      ? {
                          color: 'var(--token-primary)',
                          borderBottomColor: 'var(--token-primary)',
                          backgroundColor:
                            'color-mix(in srgb, var(--token-primary) 10%, transparent)',
                          borderRadius: '8px 8px 0 0',
                        }
                      : {
                          color: 'var(--token-text-muted)',
                        }
                  }
                >
                  {/* lucide icon — decorative, label is the visible text */}
                  <Icon icon={icon} size="sm" className="text-current" />
                  {label}
                  {/* #803: notification badge on dashboard link */}
                  {isDashboard && atRiskCount > 0 && <NotificationBadge count={atRiskCount} />}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right side: shortcuts help + notification bell + theme toggle + hamburger */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Keyboard shortcuts trigger — #531 */}
          <button
            onClick={() => shortcutsHelp?.openShortcutsHelp()}
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]"
          >
            <Icon icon={Keyboard} size="sm" className="text-[color:var(--color-text-muted)]" />
          </button>

          {/* Language switcher — #1207 (moves into the mobile menu below sm) */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          {/* Notification bell — #1066 */}
          <NotificationBell
            unreadCount={unreadCount}
            onClick={() => setNotifOpen((v) => !v)}
            isOpen={notifOpen}
          />

          {/* Notification drawer — #1066 */}
          <NotificationDrawer
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onDismiss={dismiss}
            onDismissAll={dismissAll}
          />

          {/* Theme toggle — visible on all screen sizes */}
          <ThemeToggle />

          {/* Hamburger toggle — mobile only (#1415) */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls={MOBILE_MENU_ID}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="lg:hidden flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg transition hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--token-accent)]"
            style={{ color: 'var(--color-text)' }}
          >
            <Icon icon={mobileMenuOpen ? X : Menu} size="md" className="text-current" />
          </button>
        </div>
      </div>

      {/* Mobile menu panel (#1415) */}
      <div
        id={MOBILE_MENU_ID}
        ref={mobileMenuRef}
        hidden={!mobileMenuOpen}
        className="lg:hidden absolute inset-x-0 top-full z-40 border-b shadow-lg"
        style={{
          backgroundColor: 'var(--color-nav-bg)',
          borderColor: 'var(--color-nav-border)',
        }}
      >
        <ul className="flex flex-col px-3 py-2" role="list">
          {[...NAV_SECTIONS, ...MOBILE_EXTRA_LINKS].map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 min-h-[48px] rounded-lg font-medium transition ${
                    active ? 'font-bold' : 'hover:bg-[color:var(--token-primary)]/5'
                  }`}
                  style={
                    active
                      ? {
                          color: 'var(--token-primary)',
                          backgroundColor:
                            'color-mix(in srgb, var(--token-primary) 10%, transparent)',
                        }
                      : { color: 'var(--token-text-muted)' }
                  }
                >
                  <Icon icon={icon} size="sm" className="text-current" />
                  {label}
                  {href === '/dashboard' && atRiskCount > 0 && (
                    <NotificationBadge count={atRiskCount} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div
          className="flex items-center justify-between gap-3 border-t px-6 py-3 sm:hidden"
          style={{ borderColor: 'var(--color-nav-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--token-text-muted)' }}>
            Language
          </span>
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  );
}
