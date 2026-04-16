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

// Componente de Gráfica Multi-Jugador
const MultiLineChart = ({ participants, dataKey, label, isBfp = false }) => {
  // 1. Extraer puntos válidos
  let allValues = [];
  const lines = participants.map(p => {
    const pPoints = [];
    (p.weeklyData || []).forEach(w => {
      let val = null;
      if (isBfp) val = calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip);
      else val = w[dataKey];
      
      if (val != null) {
        pPoints.push({ week: w.week, value: val });
        allValues.push(val);
      }
    });
    return { id: p.id, color: p.color, points: pPoints.sort((a,b)=>a.week-b.week) };
  }).filter(line => line.points.length > 0);

  if (lines.length === 0) return (
    <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm w-full text-center text-slate-400 font-bold italic">
      Aún no hay suficientes datos registrados para generar la gráfica de {label}.
    </div>
  );

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = (max - min) || 1; 
  const paddedMin = min - (range * 0.15);
  const paddedMax = max + (range * 0.15);
  const paddedRange = paddedMax - paddedMin;

  const width = 800;
  const height = 280;
  const paddingX = 40;
  const paddingY = 40;

  // Encontrar todas las semanas únicas para las líneas de la cuadrícula
  const allWeeks = Array.from(new Set(lines.flatMap(l => l.points.map(p => p.week)))).sort((a,b)=>a-b);
  const minWeek = Math.min(...allWeeks, 1);
  const maxWeek = Math.max(...allWeeks, 16);
  const weekRange = Math.max(maxWeek - minWeek, 1);

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm w-full overflow-x-auto">
      <h3 className="text-xl font-black text-slate-800 mb-6">{label}</h3>
      <div className="min-w-[600px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          
          {/* Líneas horizontales de guía (Grid Y) */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={height/2} x2={width - paddingX} y2={height/2} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#e2e8f0" strokeWidth="2" />
          
          {/* Líneas verticales y Etiquetas de Semana (Grid X) */}
          {allWeeks.map(w => {
            const x = paddingX + ((w - minWeek) / weekRange) * (width - paddingX * 2);
            return (
              <g key={`grid-${w}`}>
                <line x1={x} y1={paddingY} x2={x} y2={height - paddingY} stroke="#f8fafc" strokeWidth="1" />
                <text x={x} y={height - paddingY + 20} textAnchor="middle" fontSize="12" fill="#94a3b8" fontWeight="black">S{w}</text>
              </g>
            );
          })}

          {/* Dibujar Líneas y Puntos por Participante */}
          {lines.map(line => {
            const polylinePoints = line.points.map(pt => {
              const x = paddingX + ((pt.week - minWeek) / weekRange) * (width - paddingX * 2);
              const y = height - paddingY - ((pt.value - paddedMin) / paddedRange) * (height - paddingY * 2);
              return `${x},${y}`;
            });

            return (
              <g key={`line-${line.id}`}>
                {line.points.length > 1 && (
                  <polyline fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polylinePoints.join(' ')} opacity="0.8" className="drop-shadow-sm" />
                )}
                {line.points.map(pt => {
                  const x = paddingX + ((pt.week - minWeek) / weekRange) * (width - paddingX * 2);
                  const y = height - paddingY - ((pt.value - paddedMin) / paddedRange) * (height - paddingY * 2);
                  return (
                    <g key={`pt-${line.id}-${pt.week}`}>
                      <circle cx={x} cy={y} r="5" fill={line.color} stroke="#ffffff" strokeWidth="2" className="drop-shadow-sm" />
                      <text x={x} y={y - 12} textAnchor="middle" fontSize="11" fill={line.color} fontWeight="900" className="drop-shadow-md">{pt.value.toFixed(1)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
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

  // 🌟 TRUCO MAGICO: Inyectar Tailwind CSS
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
        signInAnonymously(auth).catch(err => setErrorInfo(`Error de Llave: ${err.code}.`));
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
      const sorted = docs.sort((a,b) => (parseInt(a.id?.replace('p','')) || 0) - (parseInt(b.id?.replace('p','')) || 0));
      setParticipants(sorted);
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
      <div className="animate-pulse text-2xl mb-4">Cargando v3.2...</div>
      {errorInfo && <div className="bg-red-50 text-red-600 p-6 rounded-3xl border border-red-100 text-sm font-bold max-w-sm shadow-sm">{errorInfo}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-2 md:p-6 pb-24 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="bg-white p-6 md:px-10 md:py-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 p-4 rounded-2xl">
              <span className="text-4xl text-orange-500">🔥</span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic text-slate-900">
                RETO VERANO <span className="text-[12px] bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full not-italic tracking-normal font-bold uppercase align-middle ml-2">PRO v3.2</span>
              </h1>
              <p className="text-slate-400 font-bold text-sm tracking-tight mt-1">16 Semanas de Transformación</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] w-full md:w-auto shadow-inner overflow-x-auto custom-scrollbar">
            {['data','graphs','ranking'].map(t => (
              <button key={t} onClick={()=>setActiveTab(t)} className={`flex-1 md:flex-none px-6 py-3.5 rounded-2xl text-xs md:text-sm font-black transition-all uppercase tracking-widest whitespace-nowrap ${activeTab===t ? 'bg-white text-emerald-600 shadow-md scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>
                {t === 'data' ? '📋 Registro' : t === 'graphs' ? '📈 Gráficas' : '🏆 Ranking'}
              </button>
            ))}
          </div>
        </header>

        {/* TAB 1: REGISTRO DE DATOS */}
        {activeTab === 'data' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={()=> { setForm({name:'', gender:'M', age:'', height:''}); setModalState({isOpen:true, type:'add'}); }} className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:shadow-emerald-300 hover:-translate-y-1 transition-all text-sm uppercase tracking-widest flex items-center gap-3">
              <span className="text-xl">+</span> AÑADIR JUGADOR
            </button>
            
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto font-black custom-scrollbar pb-6">
                <table className="w-full text-sm border-collapse min-w-[1400px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-6 w-72 sticky left-0 bg-slate-50 z-20 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Participante</th>
                      {Array.from({length:16}).map((_,i)=>(
                        <th key={i} className={`p-4 border-l border-slate-200 min-w-[350px] ${(i+1)%4===0?'bg-emerald-50/50':''}`}>
                          <div className="text-slate-800 text-sm mb-3 font-black uppercase italic tracking-tight">Semana {i+1} {(i+1)%4===0?'🏆':''}</div>
                          {/* CONTRASTE MEJORADO EN ENCABEZADOS */}
                          <div className="flex gap-2 font-black text-[10px] tracking-tight text-slate-700">
                            <span className="flex-1 text-center bg-slate-200/70 py-1.5 rounded-md">Kg</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1.5 rounded-md">Cuello</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1.5 rounded-md">Cintura</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1.5 rounded-md">Cadera</span>
                            <span className="flex-1 text-emerald-800 text-center bg-emerald-200 py-1.5 rounded-md">Grasa %</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 group transition-colors">
                        <td className="p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 transition-colors">
                          <div className="flex items-center justify-between">
                            <div onClick={()=> { setForm({name:p.name, gender:p.gender, age:p.age, height:p.height}); setModalState({isOpen:true, type:'edit', data:{docId:p.docId, ...p}}); }} className="cursor-pointer font-black">
                              <div className="font-black text-xl flex items-center gap-3 tracking-tighter hover:text-emerald-600 transition-colors text-slate-900">
                                <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{background:p.color}}></div>
                                {p.name}
                              </div>
                              <div className="text-[11px] font-bold text-slate-400 uppercase ml-7 mt-1 tracking-wider">{p.gender==='M'?'Hombre':'Mujer'} • {p.height}cm • {p.age} años</div>
                            </div>
                            <button onClick={()=>setModalState({isOpen:true, type:'delete', data:{docId:p.docId, playerName:p.name}})} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all bg-white hover:bg-red-50 p-2 rounded-full shadow-sm">🗑️</button>
                          </div>
                        </td>
                        {Array.from({length:16}).map((_,i)=>{
                          const wNum = i+1; const hito = wNum%4===0;
                          const wData = p.weeklyData?.find(w=>w.week === wNum) || {};
                          const bfp = calculateBFP(p.gender, p.height, wData.neck, wData.waist, wData.hip);
                          return (
                            <td key={i} className={`p-4 border-l border-slate-200 align-middle ${hito?'bg-emerald-50/30':''}`}>
                              <div className="flex flex-col gap-4 min-h-[100px] justify-center">
                                {/* CONTRASTE MEJORADO EN INPUTS */}
                                <div className="flex gap-2">
                                  {['weight','neck','waist','hip'].map(f => {
                                    const isDisabled = f === 'hip' && p.gender === 'M';
                                    return (
                                      <input key={f} type="number" step="0.1" disabled={isDisabled}
                                        defaultValue={wData[f]||''} onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                        className={`flex-1 w-0 p-2.5 text-center text-sm font-black text-slate-900 rounded-xl outline-none border-2 border-slate-200 focus:border-emerald-500 focus:bg-white focus:shadow-md transition-all shadow-sm placeholder:text-slate-300 ${isDisabled ? 'bg-slate-200 opacity-40 cursor-not-allowed' : 'bg-slate-50 hover:bg-white'}`}
                                      />
                                    );
                                  })}
                                  <div className="flex-1 w-0 flex items-center justify-center font-black text-emerald-800 bg-emerald-100 rounded-xl text-sm border-2 border-emerald-200 shadow-inner">
                                    {bfp ? bfp.toFixed(1) : '-'}
                                  </div>
                                </div>
                                
                                {/* SOLUCIÓN PARA BRAZO Y PECHO */}
                                {hito && (
                                  <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-dashed border-emerald-200/60">
                                    {['arm', 'chest'].map(f => (
                                      <div key={f} className="flex flex-col bg-slate-800 rounded-xl overflow-hidden shadow-md focus-within:ring-2 focus-within:ring-emerald-400 transition-all">
                                        <span className="text-[9px] text-center text-emerald-400 font-black pt-1.5 uppercase tracking-widest">
                                          {f === 'arm' ? '💪 Brazo' : '👕 Pecho'}
                                        </span>
                                        <input type="number" step="0.5" defaultValue={wData[f]||''} 
                                          onBlur={(e)=>handleDataChange(p, wNum, f, e.target.value)}
                                          className="p-2 w-full bg-slate-800 text-white text-center text-sm font-black outline-none"
                                        />
                                      </div>
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

        {/* TAB 2: GRÁFICAS (TODOS LOS JUGADORES A LA VEZ) */}
        {activeTab === 'graphs' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border border-slate-200 shadow-sm flex flex-col gap-6">
              <div>
                <h2 className="text-3xl font-black tracking-tighter italic text-slate-900 mb-2">📈 EVOLUCIÓN GLOBAL</h2>
                <p className="text-slate-500 font-bold text-sm">Comparativa de progreso de todos los participantes</p>
              </div>
              {/* Leyenda de colores de participantes */}
              <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                    <span className="w-3 h-3 rounded-full shadow-sm" style={{background: p.color}}></span>
                    <span className="text-xs font-black text-slate-700">{p.name}</span>
                  </div>
                ))}
                {participants.length === 0 && <span className="text-slate-400 italic text-sm font-bold">Añade participantes para ver la leyenda.</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MultiLineChart participants={participants} dataKey="weight" label="Evolución de PESO (Kg)" />
              <MultiLineChart participants={participants} dataKey="bfp" label="Evolución % GRASA CORPORAL" isBfp={true} />
              <MultiLineChart participants={participants} dataKey="arm" label="Evolución de BRAZO (cm)" />
              <MultiLineChart participants={participants} dataKey="chest" label="Evolución de PECHO (cm)" />
            </div>
          </div>
        )}

        {/* TAB 3: RANKING MEJORADO */}
        {activeTab === 'ranking' && (
          <div className="bg-white rounded-[3rem] p-6 md:p-10 border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between md:items-end mb-10 gap-4">
              <h2 className="text-4xl font-black tracking-tighter italic flex items-center gap-4 text-slate-900">
                🏆 CLASIFICACIÓN
              </h2>
            </div>
            
            <div className="overflow-x-auto font-black">
              <table className="w-full text-left">
                <thead className="text-slate-400 font-black text-[10px] uppercase tracking-[0.25em] border-b-2 border-slate-100">
                  <tr>
                    <th className="p-6">Pos</th>
                    <th className="p-6">Jugador</th>
                    <th className="p-6 min-w-[280px]">Progreso Gráfico</th>
                    <th className="p-6 text-center">Mejor Racha</th>
                    <th className="p-6 text-right font-black">Puntuación Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.map((r,i) => {
                    const pesoVisual = Math.min((r.wLoss / 10) * 100, 100);
                    const grasaVisual = Math.min((r.fLoss / 10) * 100, 100);
                    
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all group font-black text-slate-900">
                        <td className="p-6 text-4xl md:text-5xl font-black italic text-slate-300 group-hover:text-emerald-400 transition-colors">
                          {i===0?'🥇':i===1?'🥈':i===2?'🥉': `#${i+1}`}
                        </td>
                        
                        <td className="p-6">
                          <div className="flex items-center gap-4 font-black text-xl md:text-2xl tracking-tighter text-slate-900">
                            <span className="w-4 h-4 md:w-5 md:h-5 rounded-full shadow-md border border-black/10" style={{background:r.color}}></span>
                            {r.name}
                          </div>
                        </td>
                        
                        <td className="p-6">
                          <div className="flex flex-col gap-4 py-2">
                            {/* BARRA PESO */}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-blue-600 w-12 text-right uppercase tracking-widest bg-blue-50 px-1 py-0.5 rounded">Peso</span>
                              <span className="text-xs font-black text-slate-500 w-12 text-left">- {r.wLoss.toFixed(1)}</span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width: `${pesoVisual}%`}}></div>
                              </div>
                            </div>
                            {/* BARRA GRASA */}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-emerald-600 w-12 text-right uppercase tracking-widest bg-emerald-50 px-1 py-0.5 rounded">Grasa</span>
                              <span className="text-xs font-black text-slate-500 w-12 text-left">- {r.fLoss.toFixed(1)}</span>
                              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{width: `${grasaVisual}%`}}></div>
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="p-6 text-center">
                          <div className="inline-flex items-center justify-center gap-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-2xl border border-orange-200 shadow-sm">
                            <span className="text-lg">🔥</span> 
                            <span>{r.rMax} sem</span>
                          </div>
                        </td>
                        
                        <td className="p-6 text-right">
                          <div className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter tabular-nums drop-shadow-sm">
                            {r.score} <span className="text-xs opacity-40 uppercase tracking-widest font-bold ml-1 align-middle">pts</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rankingData.length === 0 && (
                <div className="p-10 text-center text-slate-400 italic tracking-tight text-lg">
                  Se necesitan al menos 2 semanas de datos registrados para que comience la competición.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN / AÑADIR */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-8 md:p-12 w-full max-w-md shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 font-black">
            <h3 className="text-3xl font-black mb-8 tracking-tighter uppercase italic text-slate-900">
              {modalState.type==='add'?'👤 NUEVO JUGADOR':'✏️ EDITAR PERFIL'}
            </h3>
            
            {modalState.type !== 'delete' ? (
              <div className="space-y-6 mb-10 text-slate-900 font-black">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 ml-2">Nombre del Participante</label>
                  <input type="text" placeholder="Ej: David" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-sm text-slate-900 text-lg" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 ml-2">Género</label>
                    <select value={form.gender} onChange={e=>setForm({...form, gender: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 font-black outline-none cursor-pointer focus:border-emerald-500 text-slate-900 text-lg">
                      <option value="M">Hombre</option><option value="F">Mujer</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 ml-2">Edad</label>
                    <input type="number" placeholder="25" value={form.age} onChange={e=>setForm({...form, age: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 shadow-sm text-slate-900 text-lg" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 ml-2">Altura (cm)</label>
                  <input type="number" placeholder="175" value={form.height} onChange={e=>setForm({...form, height: e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 shadow-sm text-slate-900 text-lg" />
                </div>
              </div>
            ) : (
              <div className="mb-10 text-center p-6 bg-red-50 rounded-3xl border border-red-100">
                <span className="text-5xl block mb-4">⚠️</span>
                <p className="text-red-600 font-black text-xl leading-tight tracking-tight">¿Eliminar a <b>{modalState.data.playerName}</b> de forma permanente?</p>
              </div>
            )}
            
            <div className="flex gap-4">
              <button onClick={()=>setModalState({isOpen:false})} className="flex-1 p-5 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[11px]">CANCELAR</button>
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
