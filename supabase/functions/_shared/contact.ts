// The support inbox, for the edge functions. Edge functions can't import
// the apps' code, so this is the third copy of the one address -- keep it in
// step with SUPPORT_EMAIL in the website (lib/contact.ts) and the mobile app
// (constants/contact.ts), and with report_inbox() in the database. A test in
// each repo fails if this file and that repo's constant disagree.
// tradease.tech is the only domain we own -- never use any other domain.
export const SUPPORT_EMAIL = 'support@tradease.tech'
