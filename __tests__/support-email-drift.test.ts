// The support address lives in places that can't import each other:
// constants/contact.ts (app), supabase/functions/_shared/contact.ts (edge
// functions) and report_inbox() (database). This keeps the first two in step
// and keeps addresses out of the email templates, so reply-to and footer can
// only come from the constant.
import { readFileSync } from 'fs';
import { join } from 'path';
import { SUPPORT_EMAIL } from '@/constants/contact';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('support address', () => {
  it('is on tradease.tech, the only domain we own', () => {
    expect(SUPPORT_EMAIL).toMatch(/@tradease\.tech$/);
  });

  it('edge functions use the same address', () => {
    const shared = read('supabase/functions/_shared/contact.ts');
    expect(shared).toContain(`export const SUPPORT_EMAIL = '${SUPPORT_EMAIL}'`);
  });

  it('send-email takes reply-to and footer from the constant, never a literal', () => {
    const src = read('supabase/functions/send-email/index.ts');
    expect(src).toContain('const REPLY_TO = SUPPORT_EMAIL');
    expect(src).toContain('mailto:${SUPPORT_EMAIL}');
    const addresses = src.match(/[\w.+-]+@[a-z][\w-]*\.[a-z]{2,}/gi) ?? [];
    expect(new Set(addresses)).toEqual(new Set(['hello@tradease.tech']));
  });
});
