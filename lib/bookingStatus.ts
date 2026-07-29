export const BOOKING_STATUS = {
  pending:     { label: 'Finding Contractor', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'   },
  quoted:      { label: 'Quote Received',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)'  },
  accepted:    { label: 'Contractor Assigned', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)'  },
  confirmed:   { label: 'Confirmed',           color: '#38BDF8', bg: 'rgba(56,189,248,0.15)'  },
  in_progress: { label: 'In Progress',         color: '#38BDF8', bg: 'rgba(56,189,248,0.15)'  },
  completed:   { label: 'Awaiting Approval',   color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  },
  approved:    { label: 'Approved',            color: '#22C55E', bg: 'rgba(34,197,94,0.12)'   },
  paid:        { label: 'Paid',                color: '#22C55E', bg: 'rgba(34,197,94,0.12)'   },
  cancelled:   { label: 'Cancelled',           color: '#555555', bg: 'rgba(255,255,255,0.06)' },
  declined:    { label: 'Declined',            color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  disputed:    { label: 'Disputed',            color: '#EF4444', bg: 'rgba(239,68,68,0.15)'   },
} as const;

export type BookingStatus = keyof typeof BOOKING_STATUS;

export function getStatus(status: string) {
  return BOOKING_STATUS[status as BookingStatus] ?? BOOKING_STATUS.pending;
}
