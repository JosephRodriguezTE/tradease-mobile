// Customer Settings tab — reuses the existing, fully-built settings screen
// (account, preferences, support, legal, sign out/delete) rather than
// duplicating it. Its own back-chevron gracefully no-ops to Home when
// there's no push-navigation stack to go back to, which is the case here.
export { default } from '../profile/settings';
