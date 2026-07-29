export interface Review {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
  jobTitle: string;
}

export interface JobHistory {
  id: string;
  title: string;
  date: string;
  amount: string;
  status: 'completed' | 'cancelled';
  customerRating?: number;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  thumbnail: string;
  caption?: string;
}

export interface ContractorProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  trade: string;
  yearsExperience: number;
  school?: string;
  serviceArea: string;
  website?: string;
  bio: string;
  rating: number;
  reviewCount: number;
  jobsCompleted: number;
  memberSince: string;
  verified: boolean;
  insured: boolean;
  licensed: boolean;
  reviews: Review[];
  jobHistory: JobHistory[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  memberSince: string;
  jobsPosted: number;
  reviewsLeft: number;
}

export const MOCK_CONTRACTOR_PROFILE: ContractorProfile = {
  id: 'con1',
  name: 'Carlos Rivera',
  username: 'carlosrivera_pro',
  avatar: 'C',
  trade: 'Plumbing',
  yearsExperience: 12,
  school: 'Lincoln Technical Institute',
  serviceArea: 'Brooklyn, Queens, Manhattan, NY',
  website: 'www.carlosplumbing.com',
  bio: 'Licensed master plumber with 12 years of residential and commercial experience. Specializing in leak detection, pipe replacement, and full bathroom renovations. Available 7 days a week for emergency calls.',
  rating: 4.9,
  reviewCount: 87,
  jobsCompleted: 143,
  memberSince: 'March 2022',
  verified: true,
  insured: true,
  licensed: true,
  reviews: [
    {
      id: 'r1',
      customerName: 'Sarah M.',
      rating: 5,
      comment: 'Carlos was fantastic. Fixed our burst pipe within hours. Professional, clean, and fair pricing.',
      date: '2 days ago',
      jobTitle: 'Emergency Pipe Repair',
    },
    {
      id: 'r2',
      customerName: 'James T.',
      rating: 5,
      comment: 'Replaced our entire bathroom plumbing. Immaculate work. Would absolutely hire again.',
      date: '1 week ago',
      jobTitle: 'Bathroom Renovation Plumbing',
    },
    {
      id: 'r3',
      customerName: 'Maria L.',
      rating: 4,
      comment: 'Good work, arrived on time. Took slightly longer than quoted but the result was great.',
      date: '2 weeks ago',
      jobTitle: 'Kitchen Sink Installation',
    },
  ],
  jobHistory: [
    { id: 'j1', title: 'Emergency Pipe Repair', date: 'May 1, 2026', amount: '$380', status: 'completed', customerRating: 5 },
    { id: 'j2', title: 'Bathroom Renovation Plumbing', date: 'Apr 24, 2026', amount: '$1,200', status: 'completed', customerRating: 5 },
    { id: 'j3', title: 'Kitchen Sink Installation', date: 'Apr 18, 2026', amount: '$290', status: 'completed', customerRating: 4 },
    { id: 'j4', title: 'Water Heater Replacement', date: 'Apr 10, 2026', amount: '$850', status: 'completed', customerRating: 5 },
  ],
};

export const MOCK_CUSTOMER_PROFILE: CustomerProfile = {
  id: 'cus1',
  name: 'Alex Johnson',
  username: 'alexj_nyc',
  avatar: 'A',
  memberSince: 'January 2024',
  jobsPosted: 8,
  reviewsLeft: 6,
};