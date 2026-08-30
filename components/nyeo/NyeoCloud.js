// components/nyeo/NyeoCloud.js
export default function NyeoCloud({title,text,onClick,tone='quiet'}){
  return <button type="button" className={`nyeo-info-cloud tone-${tone}`} onClick={onClick}>
    <span className="nyeo-cloud-light"/>
    <span className="nyeo-cloud-copy">
      {title&&<strong>{title}</strong>}
      {text&&<span>{text}</span>}
    </span>
  </button>;
}
