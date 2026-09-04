// lib/aria/capabilityRegistry.js
export const ARIA_CAPABILITIES=Object.freeze({
 find_person:{
  description:'Find a person known to the organization.',
  requiresPerson:false,
  mutates:false,
  approval:false
 },
 get_person_context:{
  description:'Retrieve a person’s current NYEOCARE context and history.',
  requiresPerson:true,
  mutates:false,
  approval:false
 },
 get_care_recommendations:{
  description:'Retrieve current care recommendations.',
  requiresPerson:false,
  mutates:false,
  approval:false
 },
 get_pending_actions:{
  description:'Retrieve actions waiting for human review.',
  requiresPerson:false,
  mutates:false,
  approval:false
 },
 prepare_message:{
  description:'Prepare a personalized message for a person.',
  requiresPerson:true,
  mutates:true,
  approval:true
 },
 prepare_action:{
  description:'Prepare an action for a person.',
  requiresPerson:true,
  mutates:true,
  approval:true
 },
 explain_person:{
  description:'Explain what ARIA knows about a person and why attention may matter.',
  requiresPerson:true,
  mutates:false,
  approval:false
 }
});

export function getCapability(name){
 const capability=ARIA_CAPABILITIES[name];
 if(!capability)throw new Error(`Unknown ARIA capability: ${name}`);
 return capability;
}

export function listCapabilities(){
 return Object.entries(ARIA_CAPABILITIES).map(([name,value])=>({name,...value}));
}
