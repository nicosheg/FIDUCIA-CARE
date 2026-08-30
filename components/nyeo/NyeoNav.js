// components/nyeo/NyeoNav.js
import {useRouter} from 'next/router';

const items=[
  {label:'Home',path:'/',icon:'⌂'},
  {label:'People',path:'/people',icon:'◉'},
  {label:'Profile',path:'/profile',icon:'○'}
];

export default function NyeoNav(){
  const router=useRouter();
  const active=path=>router.pathname===path;
  return <nav className="nyeo-nav" aria-label="Main navigation">
    <div className="nyeo-nav-liquid">
      {items.map((item,i)=><button key={item.path} type="button" aria-label={item.label} aria-current={active(item.path)?'page':undefined} className={`nyeo-nav-node ${active(item.path)?'is-active':''} n${i}`} onClick={()=>router.push(item.path)}>
        <span className="nyeo-nav-core">{item.icon}</span><span className="nyeo-nav-label">{item.label}</span>
      </button>)}
    </div>
  </nav>;
}
