import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// CONFIGURACIÓN DE TU FIREBASE (VINCULADO A TU PROYECTO)
const firebaseConfig = {
  apiKey: "AIzaSyD-BUO7VCx64Eq8-VyXt4ZEIP1AY_tr-JA",
  authDomain: "reto-verano-46f08.firebaseapp.com",
  projectId: "reto-verano-46f08",
  storageBucket: "reto-verano-46f08.firebasestorage.app",
  messagingSenderId: "1082177297543",
  appId: "1:1082177297543:web:b778fc3c3e53e53e16af6c22"
};

const appId = 'reto-verano-2024';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TOTAL_WEEKS = 16;
const COLORS = ["#4f6ef7", "#f56565", "#ed8936", "#48bb78", "#9f7aea", "#38b2ac", "#ed64a6", "#667eea", "#fc8181", "#4fd1c5"];

const calculateBFP = (gender, height, neck, waist, hip) => {
  if (!height || !neck || !waist) return null;
  if (gender === 'M') {
    const diff = waist - neck;
    return diff <= 0 ? null : (495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(height)) - 450);
  } else {
    if (!hip) return null;
    const diff = waist + hip - neck;
    return diff <= 0 ? null : (495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.22100 * Math.log10(height)) - 450);
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('data');
  const [participants, setParticipants] = useState([]);
  const [toastMsg, setToastMsg] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: '', data: null });
  
  const [inputName, setInputName] = useState('');
  const [inputGender, setInputGender] = useState('M');
  const [inputAge, setInputAge] = useState('');
  const [inputHeight, setInputHeight] = useState('');

  useEffect(() => {
    signInAnonymously(auth).catch((err) => {
      console.error("Auth fail:", err);
      setConnError("Error de Conexión. Entra por: [https://reto-verano.vercel.app](https://reto-verano.vercel.app)");
    });
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const participantsRef = collection(db, 'retos', appId, 'participantes');
    const unsubscribe = onSnapshot(participantsRef, (snap) => {
      const data = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      setParticipants(data.sort((a,b) => (parseInt(a.id?.replace('p','')) || 0) - (parseInt(b.id?.replace('p','')) || 0)));
      setLoading(false);
      setConnError(null);
    }, (err) => {
      console.error("Snapshot error:", err);
      setConnError("Error de base de datos. Revisa las Reglas en Firebase.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleDataChange = async (p, weekNum, field, value) => {
    const numValue = value === '' ? '' : parseFloat(value.replace(',', '.'));
    let newData = [...(p.weeklyData || [])];
    const idx = newData.findIndex(w => w.week === weekNum);
    if (idx >= 0) newData[idx] = { ...newData[idx], [field]: numValue };
    else newData.push({ week: weekNum, [field]: numValue });

    const docRef = doc(db, 'retos', appId, 'participantes', p.docId || p.id);
    await updateDoc(docRef, { 
      weeklyData: newData.filter(w => Object.keys(w).length > 1).sort((a,b)=>a.week-b.week) 
    });
    showToast('Guardado ✓');
  };

  const confirmAction = async () => {
    if (!inputName.trim() || !inputAge || !inputHeight) return showToast("Faltan datos ⚠️");
    const payload = { name: inputName, gender: inputGender, age: parseInt(inputAge), height: parseFloat(inputHeight) };
    const id = modalState.type === 'add' ? `p${Date.now()}` : modalState.data.docId;
    
    try {
      if (modalState.type === 'delete') await deleteDoc(doc(db, 'retos', appId, 'participantes', id));
      else if (modalState.type === 'add') await setDoc(doc(db, 'retos', appId, 'participantes', id), { id, color: COLORS[participants.length % COLORS.length], weeklyData: [], ...payload });
      else await updateDoc(doc(db, 'retos', appId, 'participantes', id), payload);
      setModalState({ isOpen: false });
      showToast('¡Hecho! ✨');
    } catch (e) { showToast('Error al guardar ❌'); }
  };

  const rankingData = useMemo(() => {
    const valid = participants.filter(p => p.weeklyData?.length >= 2);
    const ranked = valid.map(p => {
      const sorted = [...p.weeklyData].sort((a,b)=>a.week-b.week);
      const first = sorted.find(w => w.weight && calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip));
      const last = [...sorted].reverse().find(w => w.weight && calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip));
      
      if (!first || !last || first.week === last.week) return { ...p, score: 0, isUnranked: true };

      const bfp1 = calculateBFP(p.gender, p.height, first.neck, first.waist, first.hip);
      const bfp2 = calculateBFP(p.gender, p.height, last.neck, last.waist, last.hip);
      const wLoss = Math.max(0, first.weight - last.weight);
      const fLoss = Math.max(0, bfp1 - bfp2);
      
      let maxS = 0, currS = 0, pW = first.weight, pF = bfp1;
      const firstIndex = sorted.indexOf(first);
      sorted.slice(firstIndex + 1).forEach(w => {
        const b = calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip);
        let improved = false;
        if (w.weight && pW && w.weight < pW) improved = true;
        if (b && pF && b < pF) improved = true;

        if (improved) { 
          currS++; 
          if (currS > maxS) maxS = currS; 
        } else if (w.weight || b) {
          currS = 0;
        }
        if (w.weight) pW = w.weight; 
        if (b) pF = b;
      });

      const scoreValue = (wLoss * 2) + (fLoss * 3) + (maxS * 2);
      return { ...p, wLoss, fLoss, maxS, score: scoreValue.toFixed(1) };
    }).filter(p => !p.isUnranked).sort((a,b) => b.score - a.score);
    return { ranked, unranked: participants.filter(p => !ranked.find(r => r.id === p.id)) };
  }, [participants]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center font-black text-slate-400 p-10 text-center">
      <div className="animate-pulse text-2xl tracking-tighter italic uppercase mb-4 text-slate-800">Sincronizando con la Nube...</div>
      {connError && <div className="text-red-500 text-sm max-w-xs bg-red-50 p-4 rounded-xl border border-red-100">{connError}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 pb-24 font-sans text-slate-900">
      <div className="max-w-[1500px] mx-auto space-y-6 text-slate-900">
        <header className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black tracking-tighter italic flex items-center gap-2">
            <span className="text-orange-500 animate-pulse">🔥</span> RETO VERANO
          </h1>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {['data','ranking'].map(t => (
              <button key={t} onClick={()=>setActiveTab(t)} className={`px-10 py-3 rounded-xl text-sm font-black transition-all uppercase tracking-widest ${activeTab===t ? 'bg-white text-blue-600 shadow-md scale-105' : 'text-slate-400'}`}>
                {t==='data'?'Registro':'Ranking'}
              </button>
            ))}
          </div>
        </header>

        {activeTab === 'data' && (
          <div className="space-y-4">
            <button onClick={()=> { setInputName(''); setModalState({isOpen:true, type:'add'}); }} className="bg-blue-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95 text-sm uppercase tracking-widest">
              ➕ AÑADIR JUGADOR
            </button>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[1400px]">
                  <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b border-slate-200">
                    <tr>
                      <th className="p-6 w-64 sticky left-0 bg-slate-50 z-20 text-left font-black">Participante</th>
                      {Array.from({length:16}).map((_,i)=>(
                        <th key={i} className={`p-4 border-l border-slate-100 min-w-[300px] ${(i+1)%4===0?'bg-blue-50/50':''}`}>
                          <div className="text-slate-800 text-xs mb-3 font-black uppercase">Semana {i+1} {(i+1)%4===0?'🔵':''}</div>
                          <div className="flex gap-1 opacity-60 font-bold tracking-tight text-slate-400">
                            <span className="flex-1">Kg</span><span className="flex-1">Cuello</span><span className="flex-1">Cint</span><span className="flex-1">Cad</span><span className="flex-1 text-blue-600 font-black">Grasa %</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                        <td className="p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                          <div className="flex items-center justify-between">
                            <div onClick={()=> { setInputName(p.name); setInputGender(p.gender); setInputAge(p.age); setInputHeight(p.height); setModalState({isOpen:true, type:'edit', data:{docId:p.docId, ...p}}); }} className="cursor-pointer">
                              <div className="font-black text-xl flex items-center gap-2 tracking-tighter hover:text-blue-600 transition-colors"><div className="w-3 h-3 rounded-full shadow-sm" style={{background:p.color}}></div>{p.name}</div>
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
                            <td key={i} className={`p-4 border-l border-slate-100 align-middle ${hito?'bg-blue-50/15':''}`}>
                              <div className="flex flex-col gap-4 min-h-[120px] justify-center text-slate-900">
                                <div className="grid grid-cols-5 gap-2">
                                  {['weight','neck','waist','hip'].map(f => (
                                    <input key={f} type="number" step="0.1" disabled={f==='hip'&&p.gender==='M'}
                                      defaultValue={wData[f]||''} onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                      className={`p-3 text-center text-xs font-black rounded-xl outline-none border border-transparent focus:border-blue-400 focus:bg-white transition-all shadow-sm ${f==='hip'&&p.gender==='M'?'bg-transparent opacity-5':'bg-slate-100/70 hover:bg-slate-200'}`}
                                    />
                                  ))}
                                  <div className="flex items-center justify-center font-black text-blue-700 bg-blue-100/50 rounded-xl text-[11px] border border-blue-200/20 shadow-inner">
                                    {bfp ? bfp.toFixed(1) : '-'}
                                  </div>
                                </div>
                                {hito && (
                                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-blue-100/40">
                                    {['arm','chest'].map(f => (
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
            <h2 className="text-4xl font-black mb-10 tracking-tighter italic flex items-center gap-4">🏆 CLASIFICACIÓN</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-slate-300 font-black text-[10px] uppercase tracking-[0.25em] border-b border-slate-100">
                  <tr><th className="p-6">Pos</th><th className="p-6">Jugador</th><th className="p-6 text-center">Peso Bajado</th><th className="p-6 text-center">Grasa Bajada</th><th className="p-6 text-center">Mejor Racha</th><th className="p-6 text-right font-black">Puntuación</th></tr>
                </thead>
                <tbody>
                  {rankingData.ranked.map((r,i) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all group">
                      <td className="p-6 text-5xl font-black italic text-slate-100 group-hover:text-slate-200 transition-colors">{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                      <td className="p-6"><div className="flex items-center gap-4 font-black text-2xl tracking-tighter"><span className="w-4 h-4 rounded-full shadow-md" style={{background:r.color}}></span>{r.name}</div></td>
                      <td className="p-6 text-center text-green-500 font-black text-xl tracking-tight">-{r.wLoss.toFixed(1)}kg</td>
                      <td className="p-6 text-center text-green-500 font-black text-xl tracking-tight">-{r.fLoss.toFixed(1)}%</td>
                      <td className="p-6 text-center font-bold text-slate-300 group-hover:text-blue-500 transition-colors tracking-tight">{r.maxS} semanas</td>
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
          <div className="bg-white rounded-[3.5rem] p-12 w-full max-w-md shadow-2xl border border-white/20 animate-in zoom-in-95 duration-200 text-slate-900">
            <h3 className="text-3xl font-black mb-8 tracking-tighter uppercase italic">{modalState.type==='add'?'👤 NUEVO':'✏️ PERFIL'}</h3>
            {modalState.type !== 'delete' ? (
              <div className="space-y-6 mb-10 text-slate-900">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nombre</label><input type="text" placeholder="Ej: David" value={inputName} onChange={e=>setInputName(e.target.value)} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none focus:ring-4 ring-blue-500/10 focus:bg-white transition-all shadow-sm" /></div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Género</label><select value={inputGender} onChange={e=>setInputGender(e.target.value)} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none cursor-pointer"><option value="M">Hombre</option><option value="F">Mujer</option></select></div>
                  <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Edad</label><input type="number" placeholder="25" value={inputAge} onChange={e=>setInputAge(e.target.value)} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none shadow-sm" /></div>
                </div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Altura (cm)</label><input type="number" placeholder="175" value={inputHeight} onChange={e=>setInputHeight(e.target.value)} className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none shadow-sm" /></div>
              </div>
            ) : <p className="mb-10 text-slate-500 font-bold text-xl text-center leading-tight tracking-tight">¿Eliminar a <b>{modalState.data.playerName}</b>?</p>}
            <div className="flex gap-4">
              <button onClick={()=>setModalState({isOpen:false})} className="flex-1 p-5 rounded-2xl font-black text-slate-300 hover:bg-slate-50 transition-colors uppercase tracking-widest text-[10px]">CANCELAR</button>
              <button onClick={confirmAction} className={`flex-1 p-5 rounded-2xl font-black text-white shadow-xl uppercase tracking-widest text-[10px] ${modalState.type==='delete'?'bg-red-500 shadow-red-100':'bg-blue-600 shadow-blue-100'}`}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black shadow-2xl z-50 animate-bounce tracking-tight border border-white/10 uppercase text-xs tracking-[0.1em]">⚡ {toastMsg}</div>}
    </div>
  );
}
