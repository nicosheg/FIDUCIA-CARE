// This is the only place that knows which provider is used.
// To switch, change the import below.

import { placeCall } from './providers/twilio';

export async function initiateFollowUpCall(member, escalate = false) {
  // Here you could add logic to decide which provider to use
  // based on member's country, cost, etc.
  return await placeCall(member, escalate);
}
