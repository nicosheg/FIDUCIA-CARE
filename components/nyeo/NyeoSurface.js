// components/nyeo/NyeoSurface.js
export default function NyeoSurface({children,className='',onClick}){
  const Tag=onClick?'button':'div';
  return <Tag className={`nyeo-surface ${onClick?'nyeo-surface-clickable':''} ${className}`} onClick={onClick}>{children}</Tag>;
}
