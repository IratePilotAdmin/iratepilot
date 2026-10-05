'use client';

import {
  BedDouble,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  DollarSign,
  Search,
} from 'lucide-react';

type Destination =
  | 'Reservations'
  | 'Rooms & housekeeping'
  | 'Folio reports'
  | 'Guest records'
  | 'Reports';

const actions = [
  {
    title: 'Check In',
    description: 'Arrivals and walk-in rooms',
    icon: CalendarDays,
    destination: null,
  },
  {
    title: 'Reservations',
    description: 'Find and manage stays',
    icon: ClipboardList,
    destination: 'Reservations',
  },
  {
    title: 'Housekeeping',
    description: 'Room readiness and tasks',
    icon: BedDouble,
    destination: 'Rooms & housekeeping',
  },
  {
    title: 'Payments',
    description: 'Folios and payment records',
    icon: DollarSign,
    destination: 'Folio reports',
  },
  {
    title: 'Guest Search',
    description: 'Guest profiles and history',
    icon: Search,
    destination: 'Guest records',
  },
  {
    title: 'Reports',
    description: 'Daily statistics and performance',
    icon: ChartColumn,
    destination: 'Reports',
  },
] as const;

export function FrontDeskLauncher({
  onCheckIn,
  onNavigate,
}: {
  onCheckIn: () => void;
  onNavigate: (destination: Destination) => void;
}) {
  return (
    <nav className="pilot-front-desk-launcher" aria-label="Front desk shortcuts">
      {actions.map(({ title, description, icon: Icon, destination }) => (
        <button
          key={title}
          type="button"
          className="pilot-front-desk-action"
          onClick={() =>
            destination ? onNavigate(destination) : onCheckIn()
          }
        >
          <span className="pilot-front-desk-icon" aria-hidden="true">
            <Icon size={21} />
          </span>
          <span className="pilot-front-desk-copy">
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
