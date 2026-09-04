// lib/aria/engagementClassifier.js
export function classifyEngagement({totalParticipation=0,weeksSinceLast=0}){
 const total=Number(totalParticipation)||0;
 const weeks=Math.max(0,Number(weeksSinceLast)||0);
 const engagementState=total===0?'first_time':total===1?'returning':weeks<4?'regular':weeks<8?'less_recent':'quiet';
 return{engagementState,careState:total===0?'welcome':weeks===0?'healthy':'relationship_context',attentionLevel:'none'};
}
