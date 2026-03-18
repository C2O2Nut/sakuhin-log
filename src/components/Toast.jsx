import { useEffect, useState } from 'react';

let _setToast = null;
export function showToast(msg, type = '') {
  _setToast?.({ msg, type, key: Date.now() });
}

export default function Toast() {
  const [toast, setToast] = useState(null);
  useEffect(() => { _setToast = setToast; return () => { _setToast = null; }; }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div style={{
      position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
      background: toast.type === 'error' ? '#c94a2a' : '#1a1612',
      color:'#fff', padding:'10px 22px', borderRadius:6, fontSize:13,
      boxShadow:'0 4px 16px rgba(0,0,0,0.2)', zIndex:9999,
      animation:'fadeIn 0.2s ease',
    }}>
      {toast.msg}
    </div>
  );
}
