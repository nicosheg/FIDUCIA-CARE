// components/nyeo/NyeoActions.js
import {useRouter} from 'next/router';

const actions=[
  {label:'Scan',path:'/scan',icon:'⌁'},
  {label:'Attendance',path:'/attendance',icon:'◉'},
  {label:'Review',path:'/review-center',icon:'◇'}
];

export default function NyeoActions(){
  const router=useRouter();
  return <div className="nyeo-actions">
    {actions.map(a=><button key={a.path} type="button" className="nyeo-action" onClick={()=>router.push(a.path)}>
      <span className="nyeo-action-core">{a.icon}</span><span>{a.label}</span>
    </button>)}
  </div>;
}
