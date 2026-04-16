import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// 1. CONFIGURACIÓN FIREBASE 
// ⚠️ ATENCIÓN: Pega aquí tu API Key copiada directamente de Firebase. 
// No uses la que yo transcribí porque tenía un error de lectura (una O por un 0).
const firebaseConfig = {
  apiKey: "AIzaSyD-BUO7VCx64Eq8-VyXt4ZEIP1AY_tR-JA", 
  authDomain: "reto-verano-46f08.firebaseapp.com",
  projectId: "reto-verano-46f08",
  storageBucket: "reto-verano-46f08.firebasestorage.app",
  messagingSenderId: "1082177297543",
  appId: "1:1082177297543:web:b778fc3c3e53e53e16af6c22",
  measurementId: "G-0XQSP6LJF0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'reto-verano-2024';

const TOTAL_WEEKS = 16;
const COLORS = ["#4f6ef7", "#f56565", "#ed8936", "#48bb78", "#9f7aea", "#38b2ac", "#ed64a6", "#667eea", "#fc8181", "#4fd1c5"];

const calculateBFP = (gender, height, neck, waist, hip) => {
  if (!height || !neck || !waist) return null;
  const h = parseFloat(height);
  const n = parseFloat(neck);
  const w = parseFloat(waist);
  const hi = parseFloat(hip || 0);
  if (gender === 'M') {
    const diff = w - n;
    return diff <= 0 ? null : (495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(h)) - 450);
  } else {
    if (!hi) return null;
    const diff = w + hi - n;
    return diff <= 0 ? null : (495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.22100 * Math.log10(h)) - 450);
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('data');
  const [participants, setParticipants] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, type: '', data: null });
  const [form, setForm] = useState({ name: '', gender: 'M', age: '', height: '' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(err => {
          setErrorInfo(`Error de Llave: ${err.code}. Revisa el Paso 1 de la guía.`);
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'retos', appId, 'participantes');
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      setParticipants(docs.sort((a,b) => (parseInt(a.id?.replace('p','')) || 0) - (parseInt(b.id?.replace('p','')) || 0)));
      setLoading(false);
    }, (err) => {
      setErrorInfo(`Error Firestore: ${err.code}. Revisa las reglas de la base de datos.`);
      setLoading(false);
    });
  }, [user]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleDataChange = async (p, weekNum, field, value) => {
    const num = value === '' ? '' : parseFloat(value.replace(',', '.'));
    let newData = [...(p.weeklyData || [])];
    const idx = newData.findIndex(w => w.week === weekNum);
    if (idx >= 0) newData[idx] = { ...newData[idx], [field]: num };
    else newData.push({ week: weekNum, [field]: num });
    try {
      await updateDoc(doc(db, 'retos', appId, 'participantes', p.docId || p.id), { 
        weeklyData: newData.filter(w => Object.keys(w).length > 1).sort((a,b)=>a.week-b.week) 
      });
      showToast('Guardado ✓');
    } catch (e) { showToast('Error'); }
  };

  const confirmAction = async () => {
    if (!form.name.trim() || !form.age || !form.height) return;
    const id = modalState.type === 'add' ? `p${Date.now()}` : modalState.data.docId;
    try {
      if (modalState.type === 'delete') {
        await deleteDoc(doc(db, 'retos', appId, 'participantes', id));
      } else if (modalState.type === 'add') {
        await setDoc(doc(db, 'retos', appId, 'participantes', id), { 
          id, color: COLORS[participants.length % COLORS.length], weeklyData: [], ...form 
        });
      } else {
        await updateDoc(doc(db, 'retos', appId, 'participantes', id), { ...form });
      }
      setModalState({ isOpen: false });
      showToast('Hecho ✨');
    } catch (e) { showToast('Error'); }
  };

  const rankingData = useMemo(() => {
    return participants.filter(p => p.weeklyData?.length >= 2).map(p => {
      const sortedData = [...p.weeklyData].sort((a,b)=>a.week-b.week);
      const fItem = sortedData.find(w => w.weight && calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip));
      const lItem = [...sortedData].reverse().find(w => w.weight && calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip));
      if (!fItem || !lItem || fItem.week === lItem.week) return { ...p, score: 0, isUnranked: true };
      const b1 = calculateBFP(p.gender, p.height, fItem.neck, fItem.waist, fItem.hip) || 0;
      const b2 = calculateBFP(p.gender, p.height, lItem.neck, lItem.waist, lItem.hip) || 0;
      const wLoss = Math.max(0, (fItem.weight || 0) - (lItem.weight || 0));
      const fLoss = Math.max(0, b1 - b2);
      let rMax = 0, rCurr = 0, prevW = fItem.weight, prevB = b1;
      sortedData.slice(sortedData.indexOf(fItem) + 1).forEach(w => {
        const b = calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip);
        let win = false;
        if (w.weight && prevW && w.weight < prevW) win = true;
        if (b && prevB && b < prevB) win = true;
        if (win) { rCurr++; if (rCurr > rMax) rMax = rCurr; }
        else if (w.weight || b) rCurr = 0;
        if (w.weight) prevW = w.weight; if (b) prevB = b;
      });
      const scoreTotal = (wLoss * 2) + (fLoss * 3) + (rMax * 2);
      return { ...p, wLoss, fLoss, rMax, score: scoreTotal.toFixed(1) };
    }).filter(p => !p.isUnranked).sort((a,b) => b.score - a.score);
  }, [participants]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center font-black text-slate-800 bg-[#f8fafc] p-10 text-center uppercase italic tracking-tighter">
      <div className="text-6xl mb-6 animate-bounce text-indigo-600">🔥</div>
      <div className="animate-pulse text-2xl mb-4">Cargando v2.8...</div>
      {errorInfo && <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100 text-sm font-bold max-w-sm shadow-sm">{errorInfo}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 pb-24 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <header className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black tracking-tighter italic flex items-center gap-3">
            <span className="text-indigo-600">🔥</span> RETO VERANO <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full not-italic tracking-normal font-black uppercase">v2.8</span>
          </h1>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
            {['data','ranking'].map(t => (
              <button key={t} onClick={()=>setActiveTab(t)} className={`px-10 py-3 rounded-xl text-xs font-black transition-all uppercase tracking-widest ${activeTab===t ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400'}`}>
                {t==='data'?'Registro':'Ranking'}
              </button>
            ))}
          </div>
        </header>

        {activeTab === 'data' && (
          <div className="space-y-4">
            <button onClick={()=> { setForm({name:'', gender:'M', age:'', height:''}); setModalState({isOpen:true, type:'add'}); }} className="bg-indigo-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-xl hover:bg-indigo-700 transition-all text-sm uppercase tracking-widest">
              ➕ AÑADIR JUGADOR
            </button>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto font-black">
                <table className="w-full text-sm border-collapse min-w-[1400px]">
                  <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="p-6 w-64 sticky left-0 bg-slate-50 z-20 text-left">Participante</th>
                      {Array.from({length:16}).map((_,i)=>(
                        <th key={i} className={`p-4 border-l border-slate-100 min-w-[320px] ${(i+1)%4===0?'bg-indigo-50/50':''}`}>
                          <div className="text-slate-800 text-xs mb-3 font-black uppercase italic tracking-tight">Semana {i+1} {(i+1)%4===0?'🔵':''}</div>
                          <div className="flex gap-1 opacity-60 font-bold tracking-tight">
                            <span className="flex-1 text-center">Kg</span><span className="flex-1 text-center">Cuello</span><span className="flex-1 text-center">Cint</span><span className="flex-1 text-center">Cad</span><span className="flex-1 text-indigo-600 text-center font-black">Grasa %</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 group font-black">
                        <td className="p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                          <div className="flex items-center justify-between">
                            <div onClick={()=> { setForm({name:p.name, gender:p.gender, age:p.age, height:p.height}); setModalState({isOpen:true, type:'edit', data:{docId:p.docId, ...p}}); }} className="cursor-pointer font-black">
                              <div className="font-black text-xl flex items-center gap-2 tracking-tighter hover:text-indigo-600 transition-colors text-slate-900"><div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{background:p.color}}></div>{p.name}</div>
                              <div className="text-[10px] font-bold opacity-30 uppercase ml-5 mt-1">{p.gender==='M'?'Hombre':'Mujer'} · {p.height}cm</div>
                            </div>
                            <button onClick={()=>setModalState({isOpen:true, type:'delete', data:{docId:p.docId, playerName:p.name}})} className="opacity-0 group-hover:opacity-100 text-red-200 hover:text-red-500 transition-opacity">🗑️</button>
                          </div>
                        </td>
                        {Array.from({length:16}).map((_,i)=>{
                          const wNum = i+1; const hito = wNum%4===0;
                          const wData = p.weeklyData?.find(w=>w.week === wNum) || {};
                          const bfp = calculateBFP(p.gender, p.height, wData.neck, wData.waist, wData.hip);
                          return (
                            <td key={i} className={`p-4 border-l border-slate-100 align-middle ${hito?'bg-indigo-50/15':''}`}>
                              <div className="flex flex-col gap-4 min-h-[120px] justify-center text-slate-900 font-black">
                                <div className="grid grid-cols-5 gap-2 font-black">
                                  {['weight','neck','waist','hip'].map(f => (
                                    <input key={f} type="number" step="0.1" disabled={f==='hip'&&p.gender==='M'}
                                      defaultValue={wData[f]||''} onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                      className={`p-3 text-center text-xs font-black rounded-xl outline-none border border-transparent focus:border-indigo-400 focus:bg-white transition-all shadow-sm ${f==='hip'&&p.gender==='M'?'bg-transparent opacity-5':'bg-slate-100/70 hover:bg-slate-200'}`}
                                    />
                                  ))}
                                  <div className="flex items-center justify-center font-black text-indigo-700 bg-indigo-100/50 rounded-xl text-[11px] border border-indigo-200/20 shadow-inner">
                                    {bfp ? bfp.toFixed(1) : '-'}
                                  </div>
                                </div>
                                {hito && (
                                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-indigo-100/40 font-black">
                                    {['arm', 'chest'].map(f => (
                                      <input key={f} type="number" step="0.5" defaultValue={wData[f]||''} placeholder={f==='arm'?'BRAZO':'PECHO'}
                                        onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                        className="p-3 text-center text-[10px] font-black rounded-xl bg-indigo-50 text-indigo-700 border border-transparent focus:border-indigo-300 uppercase tracking-tighter"
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ranking' && (
          <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-4xl font-black mb-10 tracking-tighter italic flex items-center gap-4 text-slate-900">🏆 CLASIFICACIÓN</h2>
            <div className="overflow-x-auto font-black">
              <table className="w-full text-left">
                <thead className="text-slate-300 font-black text-[10px] uppercase tracking-[0.25em] border-b border-slate-100">
                  <tr><th className="p-6">Pos</th><th className="p-6">Jugador</th><th className="p-6 text-center">Peso Bajado</th><th className="p-6 text-center">Grasa Bajada</th><th className="p-6 text-center">Mejor Racha</th><th className="p-6 text-right font-black">Puntuación</th></tr>
                </thead>
                <tbody>
                  {rankingData.map((r,i) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all group font-black text-slate-900">
                      <td className="p-6 text-5xl font-black italic text-slate-100 group-hover:text-slate-200 transition-colors">{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                      <td className="p-6"><div className="flex items-center gap-4 font-black text-2xl tracking-tighter text-slate-900"><span className="w-4 h-4 rounded-full shadow-md" style={{background:r.color}}></span>{r.name}</div></td>
                      <td className="p-6 text-center text-green-500 font-black text-xl tracking-tight">-{r.wLoss.toFixed(1)}kg</td>
                      <td className="p-6 text-center text-green-500 font-black text-xl tracking-tight">-{r.fLoss.toFixed(1)}%</td>
                      <td className="p-6 text-center font-bold text-slate-300 group-hover:text-indigo-500 transition-colors tracking-tight">{r.rMax} semanas</td>
                      <td className="p-6 text-right text-5xl font-black text-slate-900 tracking-tighter tabular-nums">{r.score} <span className="text-xs opacity-20 uppercase tracking-widest font-bold ml-1">pts</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modalState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3.5rem] p-12 w-full max-w-md shadow-2xl border border-white/20 animate-in zoom-in-95 duration-200 font-black">
            <h3 className="text-3xl font-black mb-8 tracking-tighter uppercase italic text-slate-900">{modalState.type==='add'?'👤 NUEVO':'✏️ PERFIL'}</h3>
            {modalState.type !== 'delete' ? (
              <div className="space-y-6 mb-10 text-slate-900 font-black">
                <input type="text" placeholder="Nombre" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none focus:ring-4 ring-indigo-500/10 focus:bg-white transition-all shadow-sm text-slate-900" />
                <div className="grid grid-cols-2 gap-6">
                  <select value={form.gender} onChange={e=>setForm({...form, gender: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none cursor-pointer text-slate-900 font-black"><option value="M">Hombre</option><option value="F">Mujer</option></select>
                  <input type="number" placeholder="Edad" value={form.age} onChange={e=>setForm({...form, age: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none shadow-sm text-slate-900" />
                </div>
                <input type="number" placeholder="Altura (cm)" value={form.height} onChange={e=>setForm({...form, height: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none shadow-sm text-slate-900" />
              </div>
            ) : <p className="mb-10 text-slate-500 font-bold text-xl text-center leading-tight tracking-tight text-slate-900">¿Eliminar a <b>{modalState.data.playerName}</b>?</p>}
            <div className="flex gap-4">
              <button onClick={()=>setModalState({isOpen:false})} className="flex-1 p-5 rounded-2xl font-black text-slate-300 hover:bg-slate-100 transition-colors uppercase tracking-widest text-[10px]">CANCELAR</button>
              <button onClick={confirmAction} className={`flex-1 p-5 rounded-2xl font-black text-white shadow-xl uppercase tracking-widest text-[10px] ${modalState.type==='delete'?'bg-red-500 shadow-red-100':'bg-indigo-600 shadow-indigo-100'}`}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl z-50 animate-bounce tracking-tight border border-white/10 uppercase text-xs tracking-[0.1em]">⚡ {toastMsg}</div>}
    </div>
  );
}
