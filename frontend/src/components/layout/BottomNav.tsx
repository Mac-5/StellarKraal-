import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
}

const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const navItems: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/loans',
    label: 'Loans',
    icon: (
      <svg {...iconProps}>
        <path d="M12 2v20" />
        <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    to: '/collateral',
    label: 'Collateral',
    icon: (
      <svg {...iconProps}>
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
        <path d="M3 7l9 5 9-5" />
        <path d="M12 12v10" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {navItems.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${
                  isActive
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.icon}
                  <span aria-hidden="true">{item.label}</span>
                  {isActive && <span className="sr-only">(current)</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
