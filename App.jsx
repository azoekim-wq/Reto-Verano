import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// 1. CONFIGURACIÓN FIREBASE 
// ⚠️ ATENCIÓN: Sustituye el texto de abajo por tu API Key real.
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

// Cálculo de % Grasa Corporal
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

  // 🌟 TRUCO MAGICO: Inyectar Tailwind CSS si el servidor Vercel no lo cargó
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // Autenticación
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(err => {
          setErrorInfo(`Error de Llave: ${err.code}.`);
        });
      }
    });
    return () => unsub();
  }, []);

  // Base de datos
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'retos', appId, 'participantes');
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      setParticipants(docs.sort((a,b) => (parseInt(a.id?.replace('p','')) || 0) - (parseInt(b.id?.replace('p','')) || 0)));
      setLoading(false);
    }, (err) => {
      setErrorInfo(`Error Firestore: ${err.code}.`);
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
      <div className="text-6xl mb-6 animate-bounce text-emerald-500">🔥</div>
      <div className="animate-pulse text-2xl mb-4">Cargando v3.0 Premium...</div>
      {errorInfo && <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100 text-sm font-bold max-w-sm shadow-sm">{errorInfo}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-2 md:p-6 pb-24 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* HEADER MEJORADO */}
        <header className="bg-white p-6 md:px-10 md:py-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 p-4 rounded-2xl">
              <span className="text-4xl text-orange-500">🔥</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic text-slate-900">
                RETO VERANO <span className="text-[12px] bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full not-italic tracking-normal font-bold uppercase align-middle ml-2">PRO v3.0</span>
              </h1>
              <p className="text-slate-400 font-bold text-sm tracking-tight mt-1">16 Semanas de Transformación</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-full md:w-auto shadow-inner">
            {['data','ranking'].map(t => (
              <button key={t} onClick={()=>setActiveTab(t)} className={`flex-1 md:flex-none px-8 py-3.5 rounded-2xl text-xs md:text-sm font-black transition-all uppercase tracking-widest ${activeTab===t ? 'bg-white text-emerald-600 shadow-md scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>
                {t === 'data' ? '📋 Registro' : '🏆 Ranking'}
              </button>
            ))}
          </div>
        </header>

        {activeTab === 'data' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={()=> { setForm({name:'', gender:'M', age:'', height:''}); setModalState({isOpen:true, type:'add'}); }} className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:shadow-emerald-300 hover:-translate-y-1 transition-all text-sm uppercase tracking-widest flex items-center gap-3">
              <span className="text-xl">+</span> AÑADIR JUGADOR
            </button>
            
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto font-black custom-scrollbar">
                <table className="w-full text-sm border-collapse min-w-[1400px]">
                  <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="p-6 w-72 sticky left-0 bg-slate-50 z-20 text-left">Participante</th>
                      {Array.from({length:16}).map((_,i)=>(
                        <th key={i} className={`p-4 border-l border-slate-100 min-w-[340px] ${(i+1)%4===0?'bg-emerald-50/50':''}`}>
                          <div className="text-slate-800 text-xs mb-3 font-black uppercase italic tracking-tight">Semana {i+1} {(i+1)%4===0?'🏆':''}</div>
                          <div className="flex gap-2 opacity-60 font-bold tracking-tight">
                            <span className="flex-1 text-center bg-slate-100 py-1 rounded-md">Kg</span>
                            <span className="flex-1 text-center bg-slate-100 py-1 rounded-md">Cuello</span>
                            <span className="flex-1 text-center bg-slate-100 py-1 rounded-md">Cintura</span>
                            <span className="flex-1 text-center bg-slate-100 py-1 rounded-md">Cadera</span>
                            <span className="flex-1 text-emerald-600 text-center font-black bg-emerald-100 py-1 rounded-md">Grasa %</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 group font-black transition-colors">
                        <td className="p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 transition-colors">
                          <div className="flex items-center justify-between">
                            <div onClick={()=> { setForm({name:p.name, gender:p.gender, age:p.age, height:p.height}); setModalState({isOpen:true, type:'edit', data:{docId:p.docId, ...p}}); }} className="cursor-pointer font-black">
                              <div className="font-black text-xl flex items-center gap-3 tracking-tighter hover:text-emerald-600 transition-colors text-slate-900">
                                <div className="w-4 h-4 rounded-full shadow-sm" style={{background:p.color}}></div>
                                {p.name}
                              </div>
                              <div className="text-[11px] font-bold opacity-40 uppercase ml-7 mt-1 tracking-wider">{p.gender==='M'?'Hombre':'Mujer'} • {p.height}cm • {p.age} años</div>
                            </div>
                            <button onClick={()=>setModalState({isOpen:true, type:'delete', data:{docId:p.docId, playerName:p.name}})} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all bg-white hover:bg-red-50 p-2 rounded-full shadow-sm">🗑️</button>
                          </div>
                        </td>
                        {Array.from({length:16}).map((_,i)=>{
                          const wNum = i+1; const hito = wNum%4===0;
                          const wData = p.weeklyData?.find(w=>w.week === wNum) || {};
                          const bfp = calculateBFP(p.gender, p.height, wData.neck, wData.waist, wData.hip);
                          return (
                            <td key={i} className={`p-4 border-l border-slate-100 align-middle ${hito?'bg-emerald-50/20':''}`}>
                              <div className="flex flex-col gap-4 min-h-[120px] justify-center text-slate-900 font-black">
                                <div className="flex gap-2 font-black">
                                  {['weight','neck','waist','hip'].map(f => (
                                    <input key={f} type="number" step="0.1" disabled={f==='hip'&&p.gender==='M'}
                                      defaultValue={wData[f]||''} onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                      className={`flex-1 w-0 p-3 text-center text-xs font-black rounded-xl outline-none border-2 border-transparent focus:border-emerald-400 focus:bg-white focus:shadow-md transition-all shadow-sm ${f==='hip'&&p.gender==='M'?'bg-transparent opacity-10':'bg-slate-100/70 hover:bg-slate-200'}`}
                                    />
                                  ))}
                                  <div className="flex-1 w-0 flex items-center justify-center font-black text-emerald-700 bg-emerald-100/50 rounded-xl text-[12px] border border-emerald-200/40 shadow-inner">
                                    {bfp ? bfp.toFixed(1) : '-'}
                                  </div>
                                </div>
                                {hito && (
                                  <div className="grid grid-cols-2 gap-2 pt-3 border-t-2 border-dashed border-emerald-100/50 font-black">
                                    {['arm', 'chest'].map(f => (
                                      <input key={f} type="number" step="0.5" defaultValue={wData[f]||''} placeholder={f==='arm'?'💪 BRAZO':'👕 PECHO'}
                                        onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                        className="p-3 text-center text-[10px] font-black rounded-xl bg-slate-800 text-white placeholder:text-slate-400 border border-transparent focus:border-emerald-400 uppercase tracking-widest shadow-md"
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
          <div className="bg-white rounded-[3rem] p-6 md:p-10 border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between md:items-end mb-10 gap-4">
              <h2 className="text-4xl font-black tracking-tighter italic flex items-center gap-4 text-slate-900">
                🏆 CLASIFICACIÓN
              </h2>
              <div className="flex gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Peso</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Grasa</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Racha</span>
              </div>
            </div>
            
            <div className="overflow-x-auto font-black">
              <table className="w-full text-left">
                <thead className="text-slate-400 font-black text-[10px] uppercase tracking-[0.25em] border-b-2 border-slate-100">
                  <tr>
                    <th className="p-6">Pos</th>
                    <th className="p-6">Jugador</th>
                    <th className="p-6 min-w-[200px]">Progreso Gráfico</th>
                    <th className="p-6 text-center">Mejor Racha</th>
                    <th className="p-6 text-right font-black">Puntuación Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.map((r,i) => {
                    // Calculo visual de gráficas para el Ranking (máximo visual 10kg o 10%)
                    const pesoVisual = Math.min((r.wLoss / 10) * 100, 100);
                    const grasaVisual = Math.min((r.fLoss / 10) * 100, 100);
                    
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all group font-black text-slate-900">
                        <td className="p-6 text-4xl md:text-5xl font-black italic text-slate-200 group-hover:text-emerald-200 transition-colors">
                          {i===0?'🥇':i===1?'🥈':i===2?'🥉': `#${i+1}`}
                        </td>
                        
                        <td className="p-6">
                          <div className="flex items-center gap-4 font-black text-xl md:text-2xl tracking-tighter text-slate-900">
                            <span className="w-4 h-4 md:w-5 md:h-5 rounded-full shadow-md" style={{background:r.color}}></span>
                            {r.name}
                          </div>
                        </td>
                        
                        <td className="p-6">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-400 w-8">- {r.wLoss.toFixed(1)}</span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width: `${pesoVisual}%`}}></div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-400 w-8">- {r.fLoss.toFixed(1)}</span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{width: `${grasaVisual}%`}}></div>
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="p-6 text-center">
                          <div className="inline-flex items-center justify-center gap-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-2xl border border-orange-100">
                            <span className="text-lg">🔥</span> 
                            <span>{r.rMax} sem</span>
                          </div>
                        </td>
                        
                        <td className="p-6 text-right">
                          <div className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter tabular-nums drop-shadow-sm">
                            {r.score} <span className="text-xs opacity-30 uppercase tracking-widest font-bold ml-1 align-middle">pts</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rankingData.length === 0 && (
                <div className="p-10 text-center text-slate-400 italic tracking-tight">
                  Se necesitan al menos 2 semanas de datos para mostrar el progreso.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modalState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-8 md:p-12 w-full max-w-md shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 font-black">
            <h3 className="text-3xl font-black mb-8 tracking-tighter uppercase italic text-slate-900">
              {modalState.type==='add'?'👤 NUEVO JUGADOR':'✏️ EDITAR PERFIL'}
            </h3>
            
            {modalState.type !== 'delete' ? (
              <div className="space-y-6 mb-10 text-slate-900 font-black">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 ml-2">Nombre del Participante</label>
                  <input type="text" placeholder="Ej: David" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-100 font-bold outline-none focus:border-emerald-400 focus:bg-white transition-all shadow-sm text-slate-900 text-lg" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 ml-2">Género</label>
                    <select value={form.gender} onChange={e=>setForm({...form, gender: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-100 font-black outline-none cursor-pointer focus:border-emerald-400 text-slate-900 text-lg">
                      <option value="M">Hombre</option><option value="F">Mujer</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 ml-2">Edad</label>
                    <input type="number" placeholder="25" value={form.age} onChange={e=>setForm({...form, age: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-100 font-bold outline-none focus:border-emerald-400 shadow-sm text-slate-900 text-lg" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 ml-2">Altura (cm)</label>
                  <input type="number" placeholder="175" value={form.height} onChange={e=>setForm({...form, height: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-100 font-bold outline-none focus:border-emerald-400 shadow-sm text-slate-900 text-lg" />
                </div>
              </div>
            ) : (
              <div className="mb-10 text-center p-6 bg-red-50 rounded-3xl border border-red-100">
                <span className="text-4xl block mb-4">⚠️</span>
                <p className="text-red-600 font-black text-xl leading-tight tracking-tight">¿Eliminar a <b>{modalState.data.playerName}</b> de forma permanente?</p>
              </div>
            )}
            
            <div className="flex gap-4">
              <button onClick={()=>setModalState({isOpen:false})} className="flex-1 p-5 rounded-2xl font-black text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[11px]">CANCELAR</button>
              <button onClick={confirmAction} className={`flex-1 p-5 rounded-2xl font-black text-white shadow-xl hover:-translate-y-1 transition-all uppercase tracking-widest text-[11px] ${modalState.type==='delete'?'bg-red-500 hover:bg-red-600 shadow-red-200':'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full font-black shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 tracking-tight border border-white/10 uppercase text-xs tracking-[0.1em] flex items-center gap-3">
          <span className="text-emerald-400 text-xl">✓</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
