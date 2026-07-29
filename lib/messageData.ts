export type MessageStatus = 'sent' | 'delivered' | 'read';
export type ConversationState = 'pre_booking' | 'active' | 'completed' | 'locked';

export interface Message {
  id: string;
  senderId: string;
  body: string;
  timestamp: string;
  status: MessageStatus;
  imageUrl?: string;
  isMe: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  trade: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  state: ConversationState;
  messagesUsed: number;
  messageLimit: number;
  jobTitle?: string;
  jobId?: string;
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    name: 'Carlos Rivera',
    trade: 'Plumber',
    avatar: 'C',
    lastMessage: 'I can come by tomorrow at 9am.',
    lastMessageTime: '2m ago',
    unreadCount: 2,
    state: 'active',
    messagesUsed: 3,
    messageLimit: 3,
    jobTitle: 'Kitchen Sink Leak Repair',
    jobId: '2',
  },
  {
    id: 'c2',
    name: 'James Thompson',
    trade: 'Painter',
    avatar: 'J',
    lastMessage: 'What colors are you thinking?',
    lastMessageTime: '1h ago',
    unreadCount: 0,
    state: 'pre_booking',
    messagesUsed: 1,
    messageLimit: 3,
    jobTitle: 'Exterior House Painting',
    jobId: '3',
  },
  {
    id: 'c3',
    name: 'Maria Santos',
    trade: 'Cleaner',
    avatar: 'M',
    lastMessage: 'Job complete! Thanks for the tip.',
    lastMessageTime: '2d ago',
    unreadCount: 0,
    state: 'locked',
    messagesUsed: 3,
    messageLimit: 3,
    jobTitle: 'Deep Clean Entire Home',
    jobId: '1',
  },
];

export const MOCK_MESSAGES: Record<string, Message[]> = {
  c1: [
    {
      id: 'm1',
      senderId: 'contractor',
      body: 'Hi! I saw your job posting for the kitchen sink leak. I can definitely help.',
      timestamp: '10:22 AM',
      status: 'read',
      isMe: false,
    },
    {
      id: 'm2',
      senderId: 'me',
      body: 'Great! How soon can you come by?',
      timestamp: '10:24 AM',
      status: 'read',
      isMe: true,
    },
    {
      id: 'm3',
      senderId: 'contractor',
      body: 'I can come by tomorrow at 9am. The repair usually takes 1-2 hours depending on the damage.',
      timestamp: '10:25 AM',
      status: 'read',
      isMe: false,
    },
    {
      id: 'm4',
      senderId: 'me',
      body: 'Perfect, see you then!',
      timestamp: '10:26 AM',
      status: 'delivered',
      isMe: true,
    },
    {
      id: 'm5',
      senderId: 'contractor',
      body: 'I can come by tomorrow at 9am.',
      timestamp: '10:30 AM',
      status: 'read',
      isMe: false,
    },
  ],
  c2: [
    {
      id: 'm1',
      senderId: 'me',
      body: 'Hi James, I saw your profile and wanted to ask about the exterior painting job.',
      timestamp: 'Yesterday',
      status: 'read',
      isMe: true,
    },
    {
      id: 'm2',
      senderId: 'contractor',
      body: 'What colors are you thinking?',
      timestamp: 'Yesterday',
      status: 'read',
      isMe: false,
    },
  ],
  c3: [
    {
      id: 'm1',
      senderId: 'contractor',
      body: 'All done! The whole house is spotless.',
      timestamp: '2 days ago',
      status: 'read',
      isMe: false,
    },
    {
      id: 'm2',
      senderId: 'me',
      body: 'Amazing job, thank you so much!',
      timestamp: '2 days ago',
      status: 'read',
      isMe: true,
    },
    {
      id: 'm3',
      senderId: 'contractor',
      body: 'Job complete! Thanks for the tip.',
      timestamp: '2 days ago',
      status: 'read',
      isMe: false,
    },
  ],
};