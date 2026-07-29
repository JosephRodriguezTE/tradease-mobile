export type JobStatus = 'pending' | 'active' | 'completed' | 'draft';

export interface Job {
  id: string;
  title: string;
  description: string;
  location: string;
  budget?: string;
  postedAt: string;
  trade: string;
  customerRating: number;
  images: string[];
  urgent: boolean;
}

export interface Booking {
  id: string;
  title: string;
  status: JobStatus;
  trade: string;
  location: string;
  postedAt: string;
  scheduledDate?: string;
  contractorName?: string;
  contractorTrade?: string;
  budget?: string;
}

export const MOCK_JOBS: Job[] = [
  {
    id: '1',
    title: 'Electrical Panel Upgrade',
    description: 'Need a licensed electrician to upgrade my 100A panel to 200A. House built in 1978. Must pull permits. Prefer someone with experience in older homes.',
    location: 'Brooklyn, NY',
    budget: '$800 - $1,400',
    postedAt: '12 min ago',
    trade: 'Electrical',
    customerRating: 4.8,
    images: [],
    urgent: true,
  },
  {
    id: '2',
    title: 'Kitchen Sink Leak Repair',
    description: 'Water leaking under kitchen sink. Appears to be coming from the P-trap or drain connection. Looking for quick fix today if possible.',
    location: 'Queens, NY',
    budget: '$150 - $300',
    postedAt: '45 min ago',
    trade: 'Plumbing',
    customerRating: 4.5,
    images: [],
    urgent: true,
  },
  {
    id: '3',
    title: 'Exterior House Painting',
    description: 'Two-story colonial needs full exterior repaint. Approximately 2,400 sq ft. Current color is beige, want to go darker. Includes trim and shutters.',
    location: 'Staten Island, NY',
    budget: '$3,500 - $6,000',
    postedAt: '2 hours ago',
    trade: 'Painting',
    customerRating: 4.9,
    images: [],
    urgent: false,
  },
  {
    id: '4',
    title: 'HVAC Tune-Up & Filter Replacement',
    description: 'Annual maintenance needed for central AC unit. Last serviced 14 months ago. Unit is a Carrier 3-ton system installed in 2019.',
    location: 'Bronx, NY',
    budget: '$120 - $200',
    postedAt: '3 hours ago',
    trade: 'HVAC',
    customerRating: 4.7,
    images: [],
    urgent: false,
  },
  {
    id: '5',
    title: 'Bathroom Tile Replacement',
    description: 'Master bathroom floor tiles cracked and need full replacement. Approximately 80 sq ft. Customer has already purchased new tiles.',
    location: 'Manhattan, NY',
    budget: '$600 - $1,100',
    postedAt: '5 hours ago',
    trade: 'Flooring',
    customerRating: 4.6,
    images: [],
    urgent: false,
  },
  {
    id: '6',
    title: 'Lawn Mowing & Cleanup',
    description: 'Large backyard needs mowing, edging, and leaf cleanup. Roughly half an acre. Bi-weekly service preferred if initial work is satisfactory.',
    location: 'Long Island, NY',
    budget: '$80 - $150',
    postedAt: '8 hours ago',
    trade: 'Landscaping',
    customerRating: 4.4,
    images: [],
    urgent: false,
  },
];

export const MOCK_BOOKINGS: Booking[] = [
  {
    id: 'b1',
    title: 'Fix Leaking Bathroom Faucet',
    status: 'pending',
    trade: 'Plumbing',
    location: 'My Home',
    postedAt: '1 hour ago',
    budget: '$100 - $250',
  },
  {
    id: 'b2',
    title: 'Install Ceiling Fan in Bedroom',
    status: 'pending',
    trade: 'Electrical',
    location: 'My Home',
    postedAt: '3 hours ago',
    budget: '$150 - $300',
  },
  {
    id: 'b3',
    title: 'Deep Clean Entire Home',
    status: 'active',
    trade: 'Cleaning',
    location: 'My Home',
    postedAt: '2 days ago',
    scheduledDate: 'Today, 2:00 PM',
    contractorName: 'Maria S.',
    contractorTrade: 'Cleaning Pro',
    budget: '$200',
  },
  {
    id: 'b4',
    title: 'Paint Living Room Walls',
    status: 'active',
    trade: 'Painting',
    location: 'My Home',
    postedAt: '4 days ago',
    scheduledDate: 'Tomorrow, 9:00 AM',
    contractorName: 'James T.',
    contractorTrade: 'Painter',
    budget: '$450',
  },
  {
    id: 'b5',
    title: 'Replace Kitchen Garbage Disposal',
    status: 'completed',
    trade: 'Plumbing',
    location: 'My Home',
    postedAt: '2 weeks ago',
    contractorName: 'Carlos R.',
    contractorTrade: 'Plumber',
    budget: '$280',
  },
  {
    id: 'b6',
    title: 'Fix Squeaky Hardwood Floors',
    status: 'draft',
    trade: 'Flooring',
    location: 'My Home',
    postedAt: 'Saved yesterday',
    budget: '$200 - $500',
  },
];