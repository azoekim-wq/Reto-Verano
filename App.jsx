import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// 1. CONFIGURACIÓN FIREBASE 
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

// Cálculo de % Grasa Corporal (Con blindaje isNaN añadido)
const calculateBFP = (gender, height, neck, waist, hip) => {
  if (!height || !neck || !waist) return null;
  const h = parseFloat(height);
  const n = parseFloat(neck);
  const w = parseFloat(waist);
  const hi = parseFloat(hip || 0);
  if (isNaN(h) || isNaN(n) || isNaN(w)) return null;
  
  if (gender === 'M') {
    const diff = w - n;
    if (diff <= 0) return null;
    return (495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(h)) - 450);
  } else {
    if (!hi || isNaN(hi)) return null;
    const diff = w + hi - n;
    if (diff <= 0) return null;
    return (495 / (1.29579 - 0.35004 * Math.log10(diff) + 0.22100 * Math.log10(h)) - 450);
  }
};

// ─── COMPONENTE INPUT SEMANAL CONTROLADO ─────────────────────────────────────
// Solución al bug de "defaultValue" para actualizaciones en tiempo real
const WeekInput = ({ value, onSave, disabled, placeholder, className }) => {
  const [localVal, setLocalVal] = useState(value !== undefined && value !== '' ? String(value) : '');

  // Sincronizar cuando Firebase actualiza el valor externamente
  useEffect(() => {
    const incoming = value !== undefined && value !== '' ? String(value) : '';
    setLocalVal(incoming);
  }, [value]);

  const handleBlur = () => {
    const trimmed = localVal.trim();
    if (trimmed === '' && (value === '' || value === undefined)) return; // Sin cambios
    onSave(trimmed);
  };

  return (
    <input
      type="number"
      step="0.1"
      disabled={disabled}
      value={localVal}
      placeholder={placeholder || ''}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
};

// ─── COMPONENTE GRÁFICA MULTI-JUGADOR ─────────────────────────────────────────
const MultiLineChart = ({ participants, dataKey, label, isBfp = false, highlightedUser }) => {
  let allValues = [];
  
  const lines = participants.map(p => {
    const pPoints = [];
    (p.weeklyData || []).forEach(w => {
      let val = isBfp ? calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip) : w[dataKey];
      
      const numericVal = parseFloat(val);
      if (!isNaN(numericVal)) {
        pPoints.push({ week: Number(w.week), value: numericVal });
        allValues.push(numericVal);
      }
    });
    return { id: p.id, color: p.color, points: pPoints.sort((a,b)=>a.week-b.week) };
  }).filter(line => line.points.length > 0);

  if (lines.length === 0) return (
    <div className="bg-white p-6 md:p-10 rounded-3xl border border-slate-200 shadow-sm w-full text-center text-slate-400 font-bold italic text-sm md:text-base">
      Aún no hay datos para {label}.
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
  const paddingX = 50; // Margen ampliado para los números del eje Y
  const paddingY = 40;

  const allWeeks = Array.from(new Set(lines.flatMap(l => l.points.map(p => p.week)))).sort((a,b)=>a-b);
  const minWeek = Math.min(...allWeeks, 1);
  const maxWeek = Math.max(...allWeeks, 16);
  const weekRange = Math.max(maxWeek - minWeek, 1);

  // Etiquetas eje Y (3 niveles)
  const yLabels = [
    { val: paddedMin + paddedRange * 0.0, y: height - paddingY },
    { val: paddedMin + paddedRange * 0.5, y: height / 2 },
    { val: paddedMin + paddedRange * 1.0, y: paddingY },
  ];

  const sortedLines = [...lines].sort((a, b) => {
    if (a.id === highlightedUser) return 1;
    if (b.id === highlightedUser) return -1;
    return 0;
  });

  return (
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm w-full overflow-x-auto transition-all custom-scrollbar">
      <h3 className="text-lg md:text-xl font-black text-slate-800 mb-4 md:mb-6 leading-tight">{label}</h3>
      <div className="min-w-[500px] md:min-w-[600px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible transition-all duration-300">
          
          {/* Eje Y con valores */}
          {yLabels.map((lbl, i) => (
            <g key={`ylabel-${i}`}>
              <line x1={paddingX} y1={lbl.y} x2={width - paddingX} y2={lbl.y}
                stroke={i === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={i === 0 ? "2" : "1"} />
              <text x={paddingX - 8} y={lbl.y + 4} textAnchor="end"
                fontSize="11" fill="#94a3b8" fontWeight="700">
                {lbl.val.toFixed(1)}
              </text>
            </g>
          ))}
          
          {/* Eje X semanas */}
          {allWeeks.map(w => {
            const x = paddingX + ((w - minWeek) / weekRange) * (width - paddingX * 2);
            return (
              <g key={`grid-${w}`}>
                <line x1={x} y1={paddingY} x2={x} y2={height - paddingY} stroke="#f8fafc" strokeWidth="1" />
                <text x={x} y={height - paddingY + 20} textAnchor="middle" fontSize="12" fill="#94a3b8" fontWeight="800">S{w}</text>
              </g>
            );
          })}

          {sortedLines.map(line => {
            const isHighlighted = highlightedUser === line.id;
            const isDimmed = highlightedUser !== null && !isHighlighted;
            const lineOpacity = isDimmed ? "0.15" : (isHighlighted ? "1" : "0.8");
            const strokeWidth = isHighlighted ? "4" : "3";
            const circleR = isHighlighted ? "6" : "5";

            const polylinePoints = line.points.map(pt => {
              const x = paddingX + ((pt.week - minWeek) / weekRange) * (width - paddingX * 2);
              const y = height - paddingY - ((pt.value - paddedMin) / paddedRange) * (height - paddingY * 2);
              return `${x},${y}`;
            });

            return (
              <g key={`line-${line.id}`} className="transition-opacity duration-300">
                {line.points.length > 1 && (
                  <polyline fill="none" stroke={line.color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" points={polylinePoints.join(' ')} opacity={lineOpacity} className={isHighlighted ? "drop-shadow-md" : "drop-shadow-sm"} />
                )}
                {line.points.map(pt => {
                  const x = paddingX + ((pt.week - minWeek) / weekRange) * (width - paddingX * 2);
                  const y = height - paddingY - ((pt.value - paddedMin) / paddedRange) * (height - paddingY * 2);
                  return (
                    <g key={`pt-${line.id}-${pt.week}`}>
                      <circle cx={x} cy={y} r={circleR} fill={line.color} stroke="#ffffff" strokeWidth="2" opacity={lineOpacity} className={isHighlighted ? "drop-shadow-md" : "drop-shadow-sm"} />
                      {!isDimmed && (
                        <text x={x} y={y - 12} textAnchor="middle" fontSize={isHighlighted ? "14" : "11"} fill={line.color} fontWeight="900" className="drop-shadow-md transition-all">
                          {pt.value.toFixed(1)}
                        </text>
                      )}
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

// ─── APP PRINCIPAL ───────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('data');
  const [participants, setParticipants] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [modalState, setModalState] = useState({ isOpen: false, type: '', data: null });
  const [form, setForm] = useState({ name: '', gender: 'M', age: '', height: '' });
  const [highlightedUser, setHighlightedUser] = useState(null);

  const TABS = [
    { id: 'data', icon: '📋', label: 'Registro' },
    { id: 'graphs', icon: '📈', label: 'Gráficas' },
    { id: 'ranking', icon: '🏆', label: 'Ranking' }
  ];

  // Tailwind CDN (Por si Vercel no lo compila)
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

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

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const handleDataChange = useCallback(async (p, weekNum, field, rawValue) => {
    const trimmed = rawValue.trim();
    const num = trimmed === '' ? '' : parseFloat(trimmed.replace(',', '.'));
    if (trimmed !== '' && isNaN(num)) return; // ignorar letras/inválidos

    let newData = [...(p.weeklyData || [])];
    const idx = newData.findIndex(w => w.week === weekNum);
    if (idx >= 0) {
      newData[idx] = { ...newData[idx], [field]: num };
    } else {
      newData.push({ week: weekNum, [field]: num });
    }
    
    // Limpiar entradas completamente vacías
    newData = newData.filter(w => {
      const { week, ...rest } = w;
      return Object.values(rest).some(v => v !== '' && v !== null && v !== undefined && !isNaN(v));
    }).sort((a, b) => a.week - b.week);

    try {
      await updateDoc(doc(db, 'retos', appId, 'participantes', p.docId || p.id), { weeklyData: newData });
      showToast('Guardado ✓');
    } catch (e) {
      showToast('Error al guardar');
    }
  }, [showToast]);

  const confirmAction = async () => {
    // FIX VALIDACIÓN: Solo exige campos si no estamos eliminando
    if (modalState.type !== 'delete' && (!form.name.trim() || !form.age || !form.height)) {
      showToast('Completa todos los campos');
      return;
    }
    
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
      const wLoss = Math.max(0, (parseFloat(fItem.weight) || 0) - (parseFloat(lItem.weight) || 0));
      const fLoss = Math.max(0, b1 - b2);
      
      let rMax = 0, rCurr = 0, prevW = parseFloat(fItem.weight), prevB = b1;
      
      // FIX RACHA: Las semanas "neutras" (sin datos) no rompen la racha
      sortedData.slice(sortedData.indexOf(fItem) + 1).forEach(w => {
        const b = calculateBFP(p.gender, p.height, w.neck, w.waist, w.hip);
        const currentW = parseFloat(w.weight);
        const hasWeight = !isNaN(currentW) && currentW > 0;
        const hasBfp = b !== null;

        if (!hasWeight && !hasBfp) return; // Semana en blanco

        let win = false;
        if (hasWeight && prevW && currentW < prevW) win = true;
        if (hasBfp && prevB && b < prevB) win = true;
        
        if (win) { 
          rCurr++; 
          if (rCurr > rMax) rMax = rCurr; 
        } else {
          rCurr = 0; // Se rompe si has reportado y no hay mejora
        }
        
        if (hasWeight) prevW = currentW; 
        if (hasBfp) prevB = b;
      });
      
      const scoreTotal = (wLoss * 2) + (fLoss * 3) + (rMax * 2);
      return { ...p, wLoss, fLoss, rMax, score: scoreTotal.toFixed(1) };
    }).filter(p => !p.isUnranked).sort((a,b) => b.score - a.score);
  }, [participants]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center font-black text-slate-800 bg-[#f8fafc] p-6 text-center uppercase italic tracking-tighter">
      <div className="text-6xl mb-6 animate-bounce drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]">💡</div>
      <div className="animate-pulse text-xl md:text-2xl mb-4">Cargando v3.5...</div>
      {errorInfo && <div className="bg-red-50 text-red-600 p-4 md:p-6 rounded-3xl border border-red-100 text-sm md:text-base font-bold max-w-sm shadow-sm">{errorInfo}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-2 sm:p-4 md:p-6 pb-24 font-sans text-slate-900">
      <div className="max-w-[1600px] mx-auto space-y-4 md:space-y-6">
        
        {/* HEADER ADAPTATIVO */}
        <header className="bg-white p-4 md:px-10 md:py-8 rounded-3xl md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6">
          <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
            <div className="bg-yellow-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-yellow-100 shadow-[0_0_15px_rgba(250,204,21,0.2)] shrink-0">
              <span className="text-2xl md:text-4xl inline-block animate-pulse drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]">💡</span>
            </div>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl md:text-4xl font-black tracking-tighter italic text-slate-900 flex items-center flex-wrap gap-2">
                RETO VERANO 
                <span className="text-[9px] md:text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 md:px-3 md:py-1 rounded-full not-italic tracking-normal font-bold uppercase shrink-0">
                  PRO v3.5
                </span>
              </h1>
              <p className="text-slate-400 font-bold text-xs md:text-sm tracking-tight mt-0.5 md:mt-1">16 Semanas de Transformación</p>
            </div>
          </div>
          
          {/* NAVEGACIÓN MOBILE-FIRST */}
          <div className="w-full md:w-auto bg-slate-100 p-1.5 md:p-1.5 rounded-2xl shadow-inner grid grid-cols-3 gap-1 md:flex md:gap-0">
            {TABS.map(tab => (
              <button 
                key={tab.id} 
                onClick={()=>setActiveTab(tab.id)} 
                className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 py-2 md:px-6 md:py-3.5 rounded-xl transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-emerald-600 shadow-md scale-[1.02]' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className="text-base md:text-sm">{tab.icon}</span>
                <span className="text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-tight md:tracking-widest">{tab.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* TAB 1: REGISTRO DE DATOS */}
        {activeTab === 'data' && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={()=> { setForm({name:'', gender:'M', age:'', height:''}); setModalState({isOpen:true, type:'add'}); }} className="w-full md:w-auto justify-center bg-emerald-600 text-white px-6 py-4 md:px-10 md:py-5 rounded-2xl md:rounded-[2rem] font-black shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:shadow-emerald-300 hover:-translate-y-1 transition-all text-xs md:text-sm uppercase tracking-widest flex items-center gap-2 md:gap-3">
              <span className="text-lg md:text-xl">+</span> AÑADIR JUGADOR
            </button>
            
            <div className="bg-white rounded-3xl md:rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto font-black custom-scrollbar pb-4 md:pb-6">
                <table className="w-full text-sm border-collapse min-w-[1200px] md:min-w-[1400px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 md:p-6 w-32 sm:w-48 md:w-72 sticky left-0 bg-slate-50 z-20 text-left font-black text-slate-500 uppercase tracking-widest text-[10px] md:text-xs border-r border-slate-100">
                        Participante
                      </th>
                      {Array.from({length:16}).map((_,i)=>(
                        <th key={i} className={`p-2 md:p-4 border-l border-slate-200 min-w-[280px] md:min-w-[350px] ${(i+1)%4===0?'bg-emerald-50/50':''}`}>
                          <div className="text-slate-800 text-xs md:text-sm mb-2 md:mb-3 font-black uppercase italic tracking-tight">Semana {i+1} {(i+1)%4===0?'🏆':''}</div>
                          <div className="flex gap-1 md:gap-2 font-black text-[9px] md:text-xs tracking-tight text-slate-700">
                            <span className="flex-1 text-center bg-slate-200/70 py-1 md:py-1.5 rounded-md">Kg</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1 md:py-1.5 rounded-md">Cuello</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1 md:py-1.5 rounded-md">Cint</span>
                            <span className="flex-1 text-center bg-slate-200/70 py-1 md:py-1.5 rounded-md">Cadera</span>
                            <span className="flex-1 text-emerald-800 text-center bg-emerald-200 py-1 md:py-1.5 rounded-md">Grasa %</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 group transition-colors">
                        <td className="p-3 md:p-6 sticky left-0 bg-white group-hover:bg-slate-50 z-10 transition-colors border-r border-slate-50">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 md:gap-0">
                            <div onClick={()=> { setForm({name:p.name, gender:p.gender, age:p.age, height:p.height}); setModalState({isOpen:true, type:'edit', data:{docId:p.docId, ...p}}); }} className="cursor-pointer font-black">
                              <div className="font-black text-sm sm:text-base md:text-xl flex items-center gap-2 md:gap-3 tracking-tighter hover:text-emerald-600 transition-colors text-slate-900 truncate">
                                <div className="w-3 h-3 md:w-4 md:h-4 rounded-full shadow-sm border border-black/10 shrink-0" style={{background:p.color}}></div>
                                <span className="truncate">{p.name}</span>
                              </div>
                              <div className="text-[9px] md:text-xs font-bold text-slate-400 uppercase md:ml-7 mt-0.5 md:mt-1 tracking-wider">
                                {p.gender==='M'?'Hombre':'Mujer'} <br className="md:hidden" />
                                <span className="hidden md:inline">• </span>{p.height}cm <br className="md:hidden" />
                                <span className="hidden md:inline">• </span>{p.age} años
                              </div>
                            </div>
                            <button onClick={()=>setModalState({isOpen:true, type:'delete', data:{docId:p.docId, playerName:p.name}})} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all bg-white hover:bg-red-50 p-1.5 md:p-2 rounded-full shadow-sm self-start md:self-auto hidden md:block">🗑️</button>
                          </div>
                        </td>
                        {Array.from({length:16}).map((_,i)=>{
                          const wNum = i+1; const hito = wNum%4===0;
                          const wData = p.weeklyData?.find(w=>w.week === wNum) || {};
                          const bfp = calculateBFP(p.gender, p.height, wData.neck, wData.waist, wData.hip);
                          return (
                            <td key={i} className={`p-2 md:p-4 border-l border-slate-200 align-middle ${hito?'bg-emerald-50/30':''}`}>
                              <div className="flex flex-col gap-2 md:gap-4 min-h-[80px] md:min-h-[100px] justify-center">
                                <div className="flex gap-1 md:gap-2">
                                  {['weight','neck','waist','hip'].map(f => {
                                    const isDisabled = f === 'hip' && p.gender === 'M';
                                    return (
                                      <WeekInput
                                        key={`${p.id}-${wNum}-${f}`}
                                        value={wData[f]}
                                        disabled={isDisabled}
                                        onSave={(val) => handleDataChange(p, wNum, f, val)}
                                        className={`flex-1 w-0 p-1.5 md:p-2.5 text-center text-xs md:text-sm font-black text-slate-900 rounded-lg md:rounded-xl outline-none border md:border-2 border-slate-200 focus:border-emerald-500 focus:bg-white focus:shadow-md transition-all shadow-sm placeholder:text-slate-300 ${isDisabled ? 'bg-slate-200 opacity-40 cursor-not-allowed' : 'bg-slate-50 hover:bg-white'}`}
                                      />
                                    );
                                  })}
                                  <div className="flex-1 w-0 flex items-center justify-center font-black text-emerald-800 bg-emerald-100 rounded-lg md:rounded-xl text-xs md:text-sm border md:border-2 border-emerald-200 shadow-inner">
                                    {bfp ? bfp.toFixed(1) : '-'}
                                  </div>
                                </div>
                                
                                {hito && (
                                  <div className="grid grid-cols-2 gap-2 md:gap-3 pt-2 md:pt-4 border-t border-dashed border-emerald-200/60">
                                    {['arm', 'chest'].map(f => (
                                      <div key={f} className="flex flex-col bg-slate-800 rounded-lg md:rounded-xl overflow-hidden shadow-md focus-within:ring-2 focus-within:ring-emerald-400 transition-all">
                                        <span className="text-[9px] md:text-xs text-center text-emerald-400 font-black pt-1 md:pt-2 uppercase tracking-widest">
                                          {f === 'arm' ? '💪 Brazo' : '👕 Pecho'}
                                        </span>
                                        <WeekInput
                                          key={`${p.id}-${wNum}-${f}`}
                                          value={wData[f]}
                                          onSave={(val) => handleDataChange(p, wNum, f, val)}
                                          className="p-1.5 md:p-2 w-full bg-slate-800 text-white text-center text-xs md:text-sm font-black outline-none"
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

        {/* TAB 2: GRÁFICAS */}
        {activeTab === 'graphs' && (
          <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl md:rounded-[2.5rem] p-5 md:p-8 border border-slate-200 shadow-sm flex flex-col gap-4 md:gap-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tighter italic text-slate-900 mb-1 md:mb-2">📈 EVOLUCIÓN GLOBAL</h2>
                <p className="text-slate-500 font-bold text-xs md:text-sm">Toca un nombre para destacar su evolución.</p>
              </div>
              <div className="flex flex-wrap gap-2 md:gap-4 pt-3 md:pt-4 border-t border-slate-100">
                {participants.map(p => {
                  const isSelected = highlightedUser === p.id;
                  const isDimmed = highlightedUser !== null && !isSelected;
                  
                  return (
                    <button 
                      key={p.id} 
                      onClick={() => setHighlightedUser(isSelected ? null : p.id)}
                      className={`flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border transition-all ${
                        isSelected 
                          ? 'bg-white shadow-md border-slate-300 scale-105 ring-2 ring-slate-100' 
                          : isDimmed 
                            ? 'bg-slate-50 border-slate-100 opacity-40 grayscale hover:opacity-100 hover:grayscale-0'
                            : 'bg-slate-50 border-slate-200 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shadow-sm" style={{background: p.color}}></span>
                      <span className={`text-xs md:text-sm font-black ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{p.name}</span>
                    </button>
                  );
                })}
                {participants.length === 0 && <span className="text-slate-400 italic text-xs md:text-sm font-bold">Añade jugadores para ver la leyenda.</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <MultiLineChart participants={participants} dataKey="weight" label="PESO (Kg)" highlightedUser={highlightedUser} />
              <MultiLineChart participants={participants} dataKey="bfp" label="% GRASA CORPORAL" isBfp={true} highlightedUser={highlightedUser} />
              <MultiLineChart participants={participants} dataKey="arm" label="BRAZO (cm)" highlightedUser={highlightedUser} />
              <MultiLineChart participants={participants} dataKey="chest" label="PECHO (cm)" highlightedUser={highlightedUser} />
            </div>
          </div>
        )}

        {/* TAB 3: RANKING */}
        {activeTab === 'ranking' && (
          <div className="bg-white rounded-3xl md:rounded-[3rem] p-4 md:p-10 border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-10 gap-3 md:gap-4 p-2 md:p-0">
              <h2 className="text-2xl md:text-4xl font-black tracking-tighter italic flex items-center gap-2 md:gap-4 text-slate-900">
                🏆 CLASIFICACIÓN
              </h2>
            </div>
            
            <div className="overflow-x-auto font-black custom-scrollbar">
              <table className="w-full text-left min-w-[700px] md:min-w-0">
                <thead className="text-slate-400 font-black text-[10px] md:text-xs uppercase tracking-[0.25em] border-b-2 border-slate-100">
                  <tr>
                    <th className="p-3 md:p-6 w-16 md:w-auto">Pos</th>
                    <th className="p-3 md:p-6">Jugador</th>
                    <th className="p-3 md:p-6 min-w-[200px] md:min-w-[280px]">Progreso Gráfico</th>
                    <th className="p-3 md:p-6 text-center">Racha</th>
                    <th className="p-3 md:p-6 text-right font-black">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.map((r,i) => {
                    const pesoVisual = Math.min((r.wLoss / 10) * 100, 100);
                    const grasaVisual = Math.min((r.fLoss / 10) * 100, 100);
                    
                    return (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-all group font-black text-slate-900">
                        <td className="p-3 md:p-6 text-2xl md:text-5xl font-black italic text-slate-300 group-hover:text-emerald-400 transition-colors">
                          {i===0?'🥇':i===1?'🥈':i===2?'🥉': `#${i+1}`}
                        </td>
                        
                        <td className="p-3 md:p-6">
                          <div className="flex items-center gap-2 md:gap-4 font-black text-base md:text-2xl tracking-tighter text-slate-900">
                            <span className="w-3 h-3 md:w-5 md:h-5 rounded-full shadow-md border border-black/10 shrink-0" style={{background:r.color}}></span>
                            <span className="truncate max-w-[100px] md:max-w-none">{r.name}</span>
                          </div>
                        </td>
                        
                        <td className="p-3 md:p-6">
                          <div className="flex flex-col gap-2 md:gap-4 py-1 md:py-2">
                            {/* BARRA PESO */}
                            <div className="flex items-center gap-2 md:gap-3">
                              <span className="text-[9px] md:text-xs font-black text-blue-600 w-10 md:w-14 text-center uppercase tracking-widest bg-blue-50 px-1 py-0.5 md:py-1 rounded shrink-0">Peso</span>
                              <span className="text-xs md:text-sm font-black text-slate-500 w-10 md:w-12 text-left shrink-0">- {r.wLoss.toFixed(1)}</span>
                              <div className="flex-1 h-2 md:h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{width: `${pesoVisual}%`}}></div>
                              </div>
                            </div>
                            {/* BARRA GRASA */}
                            <div className="flex items-center gap-2 md:gap-3">
                              <span className="text-[9px] md:text-xs font-black text-emerald-600 w-10 md:w-14 text-center uppercase tracking-widest bg-emerald-50 px-1 py-0.5 md:py-1 rounded shrink-0">Grasa</span>
                              <span className="text-xs md:text-sm font-black text-slate-500 w-10 md:w-12 text-left shrink-0">- {r.fLoss.toFixed(1)}</span>
                              <div className="flex-1 h-2 md:h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{width: `${grasaVisual}%`}}></div>
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="p-3 md:p-6 text-center">
                          <div className="inline-flex items-center justify-center gap-1 md:gap-2 bg-orange-50 text-orange-600 px-2 py-1 md:px-4 md:py-2 rounded-xl md:rounded-2xl border border-orange-200 shadow-sm whitespace-nowrap">
                            <span className="text-sm md:text-lg">🔥</span> 
                            <span className="text-xs md:text-base">{r.rMax} sem</span>
                          </div>
                        </td>
                        
                        <td className="p-3 md:p-6 text-right">
                          <div className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter tabular-nums drop-shadow-sm whitespace-nowrap">
                            {r.score} <span className="text-[10px] md:text-base opacity-40 uppercase tracking-widest font-bold ml-0.5 md:ml-1 align-middle">pts</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rankingData.length === 0 && (
                <div className="p-6 md:p-10 text-center text-slate-400 italic tracking-tight text-sm md:text-lg">
                  Se necesitan al menos 2 semanas de datos para que comience la competición.
                </div>
              )}
            </div>

            {/* EXPLICACIÓN PUNTUACIÓN */}
            <div className="mt-6 md:mt-8 p-4 md:p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <h4 className="text-[10px] md:text-xs font-black text-slate-700 uppercase tracking-widest mb-3 md:mb-4 flex items-center gap-2">
                <span className="text-base md:text-lg">ℹ️</span> Sistema de Puntuación
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 text-[10px] md:text-xs font-bold text-slate-500 leading-relaxed">
                <div className="flex items-start gap-2 md:gap-3">
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-blue-500 mt-1 shrink-0 shadow-sm"></span>
                  <p><span className="text-slate-700 font-black">Peso:</span> 2 puntos por cada Kg bajado respecto al inicio.</p>
                </div>
                <div className="flex items-start gap-2 md:gap-3">
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-emerald-500 mt-1 shrink-0 shadow-sm"></span>
                  <p><span className="text-slate-700 font-black">Grasa:</span> 3 puntos por cada 1% de grasa corporal bajado.</p>
                </div>
                <div className="flex items-start gap-2 md:gap-3">
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-orange-500 mt-1 shrink-0 shadow-sm"></span>
                  <p><span className="text-slate-700 font-black">Racha:</span> 2 pts por semana seguida mejorando. Las semanas sin datos no rompen racha.</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* MODAL DE EDICIÓN / AÑADIR */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 w-full max-w-md shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 font-black mx-2">
            <h3 className="text-2xl md:text-3xl font-black mb-6 md:mb-8 tracking-tighter uppercase italic text-slate-900">
              {modalState.type==='add'?'👤 NUEVO JUGADOR':'✏️ EDITAR PERFIL'}
            </h3>
            
            {modalState.type !== 'delete' ? (
              <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 text-slate-900 font-black">
                <div className="space-y-1 md:space-y-2">
                  <label className="text-[10px] md:text-xs uppercase tracking-widest text-slate-500 ml-2">Nombre del Participante</label>
                  <input type="text" placeholder="Ej: David" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-sm text-slate-900 text-base md:text-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[10px] md:text-xs uppercase tracking-widest text-slate-500 ml-2">Género</label>
                    <select value={form.gender} onChange={e=>setForm({...form, gender: e.target.value})} className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-slate-200 font-black outline-none cursor-pointer focus:border-emerald-500 text-slate-900 text-base md:text-lg">
                      <option value="M">Hombre</option><option value="F">Mujer</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:space-y-2">
                    <label className="text-[10px] md:text-xs uppercase tracking-widest text-slate-500 ml-2">Edad</label>
                    <input type="number" placeholder="25" value={form.age} onChange={e=>setForm({...form, age: e.target.value})} className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 shadow-sm text-slate-900 text-base md:text-lg" />
                  </div>
                </div>
                <div className="space-y-1 md:space-y-2">
                  <label className="text-[10px] md:text-xs uppercase tracking-widest text-slate-500 ml-2">Altura (cm)</label>
                  <input type="number" placeholder="175" value={form.height} onChange={e=>setForm({...form, height: e.target.value})} className="w-full p-4 md:p-5 rounded-xl md:rounded-2xl bg-slate-50 border-2 border-slate-200 font-bold outline-none focus:border-emerald-500 shadow-sm text-slate-900 text-base md:text-lg" />
                </div>
              </div>
            ) : (
              <div className="mb-8 md:mb-10 text-center p-4 md:p-6 bg-red-50 rounded-2xl md:rounded-3xl border border-red-100">
                <span className="text-4xl md:text-5xl block mb-3 md:mb-4">⚠️</span>
                <p className="text-red-600 font-black text-lg md:text-xl leading-tight tracking-tight">¿Eliminar a <b>{modalState.data.playerName}</b> de forma permanente?</p>
              </div>
            )}
            
            <div className="flex gap-3 md:gap-4">
              <button onClick={()=>setModalState({isOpen:false})} className="flex-1 p-4 md:p-5 rounded-xl md:rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors uppercase tracking-widest text-[10px] md:text-sm">CANCELAR</button>
              <button onClick={confirmAction} className={`flex-1 p-4 md:p-5 rounded-xl md:rounded-2xl font-black text-white shadow-xl hover:-translate-y-1 transition-all uppercase tracking-widest text-[10px] md:text-sm ${modalState.type==='delete'?'bg-red-500 hover:bg-red-600 shadow-red-200':'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 md:px-8 py-3 md:py-4 rounded-full font-black shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 tracking-tight border border-white/10 uppercase text-[10px] md:text-xs tracking-[0.1em] flex items-center gap-2 md:gap-3 whitespace-nowrap">
          <span className="text-emerald-400 text-lg md:text-xl">✓</span> {toastMsg}
        </div>
      )}
    </div>
  );
}
