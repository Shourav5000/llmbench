import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'

const MODELS_META = {
  'Claude Haiku':  { emoji: '⚡', tagline: 'Fastest & cheapest',  color: '#d4921a', bg: 'linear-gradient(135deg,#fef9ec,#fef0c7)', border: '#f0d080', glow: 'rgba(212,146,26,0.3)' },
  'Claude Sonnet': { emoji: '⚖️', tagline: 'Best all-rounder',    color: '#d4621a', bg: 'linear-gradient(135deg,#fef2ea,#fde8d0)', border: '#f0b070', glow: 'rgba(212,98,26,0.3)'  },
  'Claude Opus':   { emoji: '🧠', tagline: 'Most powerful',       color: '#7c4a1e', bg: 'linear-gradient(135deg,#f5e6d0,#eedfc5)', border: '#d4b896', glow: 'rgba(124,74,30,0.3)'  },
}

const EXAMPLES = [
  { label: '🤖 Transformer attention', prompt: 'Explain how transformer attention works in simple terms' },
  { label: '📚 RAG vs fine-tuning',    prompt: 'What are the tradeoffs between RAG and fine-tuning LLMs?' },
  { label: '🐍 Reverse linked list',   prompt: 'Write a Python function to reverse a linked list with explanation' },
  { label: '☁️  CAP theorem',          prompt: 'Explain the CAP theorem with a real-world example' },
]

function efficiencyScore(r) {
  const s = r.scores.overall || 0
  return r.cost_usd === 0 ? 0 : parseFloat((s / (r.cost_usd * 1000)).toFixed(1))
}

function getBestFor(results) {
  if (!results?.length) return []
  const byScore = [...results].sort((a,b) => (b.scores.overall||0) - (a.scores.overall||0))
  const cheapest = [...results].sort((a,b) => a.cost_usd - b.cost_usd)[0]
  const fastest  = [...results].sort((a,b) => a.latency_ms - b.latency_ms)[0]
  const bestEff  = [...results].sort((a,b) => efficiencyScore(b) - efficiencyScore(a))[0]
  return [
    { model: fastest.model_label,   reason: 'Lowest latency — best when speed matters most',         icon: '⚡' },
    { model: cheapest.model_label,  reason: 'Cheapest per run — ideal for high-volume production',   icon: '💰' },
    { model: byScore[0].model_label,reason: 'Highest quality score — best for critical tasks',       icon: '🏆' },
    { model: bestEff.model_label,   reason: 'Best quality per dollar — optimal value for money',     icon: '⚖️' },
  ]
}

function exportCSV(history) {
  const rows = [['Run ID','Prompt','Model','Latency ms','Tokens','Cost $','Relevance','Clarity','Completeness','Overall','Efficiency','Winner','Timestamp']]
  history.forEach(run => run.results.forEach(r => rows.push([
    run.run_id, `"${run.prompt.replace(/"/g,'""')}"`, r.model_label,
    r.latency_ms, r.output_tokens, r.cost_usd.toFixed(6),
    r.scores.relevance||0, r.scores.clarity||0, r.scores.completeness||0, r.scores.overall||0,
    efficiencyScore(r), run.winner, run.timestamp,
  ])))
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'})
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download:'llmbench.csv'})
  a.click(); URL.revokeObjectURL(a.href)
}

// ── Score ring ────────────────────────────────────────────────
function ScoreRing({ score, color }) {
  const size=56, r=22, circ=2*Math.PI*r, fill=(score/10)*circ
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8d5be" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)'}}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={13} fontWeight={700} fontFamily="JetBrains Mono"
        style={{transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>{score}</text>
    </svg>
  )
}

// ── Animated counter ──────────────────────────────────────────
function Counter({ value, decimals=0, prefix='', suffix='' }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef()
  useEffect(() => {
    const start = performance.now(), duration = 800, from = 0, to = parseFloat(value) || 0
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setDisplay(parseFloat((from + (to - from) * ease).toFixed(decimals)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value])
  return <>{prefix}{display.toLocaleString()}{suffix}</>
}

// ── Stat box ──────────────────────────────────────────────────
function StatBox({ label, value, color, delay=0 }) {
  return (
    <div className="pop-in" style={{animationDelay:`${delay}s`, flex:1, textAlign:'center', background:'rgba(255,255,255,0.7)', backdropFilter:'blur(4px)', borderRadius:10, padding:'10px 6px', border:'1px solid var(--border)', transition:'transform 0.2s,box-shadow 0.2s', cursor:'default'}}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='var(--shadow)'}}
      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
      <div style={{fontFamily:'var(--font-m)',fontSize:13,fontWeight:700,color,marginBottom:2}}>{value}</div>
      <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>{label}</div>
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────
function ScoreBar({ label, value, color, delay=0 }) {
  const [width, setWidth] = useState(0)
  useEffect(() => { const t = setTimeout(() => setWidth(value*10), delay*1000+100); return ()=>clearTimeout(t) }, [value, delay])
  return (
    <div style={{marginBottom:9}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontSize:12,color:'var(--text2)',textTransform:'capitalize',fontWeight:500}}>{label}</span>
        <span style={{fontFamily:'var(--font-m)',fontSize:11,color,fontWeight:700}}>{value}/10</span>
      </div>
      <div style={{height:6,background:'var(--border)',borderRadius:100,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${width}%`,background:`linear-gradient(90deg,${color},${color}99)`,borderRadius:100,transition:'width 0.8s cubic-bezier(0.34,1.56,0.64,1)'}}/>
      </div>
    </div>
  )
}

// ── Model card ────────────────────────────────────────────────
function ModelCard({ result, isWinner, delay=0 }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const meta = MODELS_META[result.model_label] || {emoji:'◆',tagline:'',color:'#d4621a',bg:'#fef2ea',border:'#f0b070',glow:'rgba(212,98,26,0.3)'}
  const tps  = result.latency_ms > 0 ? Math.round(result.output_tokens/(result.latency_ms/1000)) : 0

  return (
    <div className="fade-up" style={{animationDelay:`${delay}s`}}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <div style={{
        background:'#fff', border:`2px solid ${isWinner ? meta.color : hovered ? meta.border : 'var(--border)'}`,
        borderRadius:18, overflow:'hidden',
        boxShadow: hovered ? `0 12px 40px ${meta.glow}, var(--shadow2)` : isWinner ? `0 6px 28px ${meta.glow}` : 'var(--shadow)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition:'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Gradient top strip */}
        <div style={{height:5,background:`linear-gradient(90deg,${meta.color},${meta.color}44,transparent)`}}/>

        {/* Header */}
        <div style={{padding:'16px 18px',display:'flex',alignItems:'center',gap:12,background:meta.bg,borderBottom:`1px solid ${meta.border}`}}>
          <div style={{
            width:48,height:48,borderRadius:14,background:'#fff',
            border:`2px solid ${meta.border}`,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:24,flexShrink:0,
            animation: isWinner ? 'wiggle 1s ease 0.5s' : 'none',
          }}>{meta.emoji}</div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
              <span style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:16,color:'var(--text)'}}>{result.model_label}</span>
              {isWinner && (
                <span style={{
                  fontSize:11,background:`linear-gradient(135deg,${meta.color},${meta.color}cc)`,
                  color:'#fff',padding:'3px 10px',borderRadius:100,fontWeight:700,
                  animation:'pulse-ring 2s infinite',
                }}>🏆 Winner</span>
              )}
            </div>
            <div style={{fontSize:12,color:'var(--text2)',fontWeight:500}}>{meta.tagline}</div>
          </div>
          <ScoreRing score={result.scores.overall||0} color={meta.color}/>
        </div>

        {/* Stats */}
        <div className="stat-boxes" style={{display:'flex',gap:8,padding:'12px 16px',background:'rgba(253,246,238,0.6)',borderBottom:'1px solid var(--border)'}}>
          <StatBox label="Time"       value={`${(result.latency_ms/1000).toFixed(1)}s`} color={meta.color} delay={delay}/>
          <StatBox label="Tokens"     value={result.output_tokens}                       color={meta.color} delay={delay+0.05}/>
          <StatBox label="Cost"       value={`$${result.cost_usd.toFixed(5)}`}           color={meta.color} delay={delay+0.1}/>
          <StatBox label="Efficiency" value={efficiencyScore(result)}                    color={meta.color} delay={delay+0.15}/>
        </div>

        {/* Score bars */}
        <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.09em',fontWeight:700,marginBottom:10}}>Quality Scores</div>
          {['relevance','clarity','completeness'].map((k,i) => (
            <ScoreBar key={k} label={k} value={result.scores[k]||0} color={meta.color} delay={delay+i*0.08}/>
          ))}
          {result.scores.reasoning && (
            <div style={{marginTop:10,fontSize:12,color:'var(--text2)',fontStyle:'italic',lineHeight:1.65,background:'rgba(255,255,255,0.7)',padding:'9px 12px',borderRadius:8,borderLeft:`3px solid ${meta.color}`}}>
              "{result.scores.reasoning}"
            </div>
          )}
        </div>

        {/* Response */}
        <div style={{padding:'12px 18px'}}>
          <button onClick={()=>setOpen(v=>!v)} style={{
            background:meta.bg, border:`1.5px solid ${meta.border}`, color:meta.color,
            fontFamily:'var(--font-s)',fontSize:12,fontWeight:700,
            padding:'8px 18px',borderRadius:10,cursor:'pointer',transition:'all 0.2s',
            transform: open ? 'none' : 'none',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.transform='scale(1.03)'}}
            onMouseLeave={e=>{e.currentTarget.style.background=meta.bg;e.currentTarget.style.transform='scale(1)'}}>
            {open ? '↑ Hide response' : '↓ Read response'}
          </button>
          {open && (
            <div className="fade-up" style={{marginTop:12,fontSize:13,color:'var(--text)',lineHeight:1.8,maxHeight:280,overflowY:'auto',paddingRight:4}}>
              <ReactMarkdown>{result.response}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Side by side ──────────────────────────────────────────────
function SideBySide({ results }) {
  return (
    <div className="fade-up" style={{background:'#fff',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',boxShadow:'var(--shadow)',marginBottom:'1.5rem'}}>
      <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',background:'var(--bg3)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:14,color:'var(--text)'}}>↔ Side-by-side responses</span>
        <span style={{fontSize:11,color:'var(--text3)'}}>Compare all 3 at once</span>
      </div>
      <div className="side-by-side-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
        {results.map((r,i) => {
          const meta = MODELS_META[r.model_label]||{color:'#d4621a',bg:'#fef2ea',border:'#f0b070',emoji:'◆'}
          return (
            <div key={r.model_id} style={{borderRight:i<2?'1px solid var(--border)':'none',padding:'16px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,paddingBottom:10,borderBottom:`3px solid ${meta.color}50`}}>
                <span style={{fontSize:18}}>{meta.emoji}</span>
                <span style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:13,color:'var(--text)'}}>{r.model_label}</span>
                <span style={{marginLeft:'auto',fontFamily:'var(--font-m)',fontSize:12,color:meta.color,fontWeight:700,background:meta.bg,padding:'2px 8px',borderRadius:100}}>{r.scores.overall||0}/10</span>
              </div>
              <div style={{fontSize:12,color:'var(--text)',lineHeight:1.75,maxHeight:340,overflowY:'auto'}}>
                <ReactMarkdown>{r.response}</ReactMarkdown>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cost calculator ───────────────────────────────────────────
function CostCalculator({ results }) {
  const [runs, setRuns] = useState(1000)
  return (
    <div className="fade-up" style={{background:'#fff',border:'1px solid var(--border)',borderRadius:16,padding:'18px 20px',boxShadow:'var(--shadow)',marginBottom:'1.5rem'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
        <span style={{fontSize:20}}>💰</span>
        <span style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:16,color:'var(--text)'}}>Cost Calculator</span>
      </div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>How much would this prompt cost at scale?</div>
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
        <span style={{fontSize:13,color:'var(--text2)',fontWeight:600,whiteSpace:'nowrap'}}>Runs per day:</span>
        <input type="range" min={100} max={100000} step={100} value={runs}
          onChange={e=>setRuns(Number(e.target.value))}
          style={{flex:1,accentColor:'var(--orange)',height:6}}/>
        <span style={{fontFamily:'var(--font-m)',fontSize:14,color:'var(--orange)',fontWeight:700,minWidth:90,background:'var(--orange-bg)',padding:'4px 10px',borderRadius:8}}>{runs.toLocaleString()}/day</span>
      </div>
      <div className="cost-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {results.map(r => {
          const meta = MODELS_META[r.model_label]||{color:'#d4621a',bg:'#fef2ea',border:'#f0b070'}
          const daily=r.cost_usd*runs, monthly=daily*30, yearly=daily*365
          return (
            <div key={r.model_id} style={{background:meta.bg,border:`1.5px solid ${meta.border}`,borderRadius:12,padding:'14px 16px',transition:'transform 0.2s',cursor:'default'}}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
              onMouseLeave={e=>e.currentTarget.style.transform=''}>
              <div style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:14,color:'var(--text)',marginBottom:10}}>{r.model_label}</div>
              {[['Daily',daily],['Monthly',monthly],['Yearly',yearly]].map(([lbl,val])=>(
                <div key={lbl} style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:12,color:'var(--text3)',fontWeight:500}}>{lbl}</span>
                  <span style={{fontFamily:'var(--font-m)',fontSize:12,color:meta.color,fontWeight:700}}>
                    ${val<1?val.toFixed(4):val<100?val.toFixed(2):Math.round(val).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Best for panel ────────────────────────────────────────────
function BestForPanel({ results }) {
  const recs = getBestFor(results)
  return (
    <div className="fade-up" style={{background:'#fff',border:'1px solid var(--border)',borderRadius:16,padding:'18px 20px',boxShadow:'var(--shadow)',marginBottom:'1.5rem'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
        <span style={{fontSize:20}}>🎯</span>
        <span style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:16,color:'var(--text)'}}>When to use each model</span>
      </div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>Based on this benchmark run</div>
      <div className="bestfor-grid" style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
        {recs.map((rec,i) => {
          const meta = MODELS_META[rec.model]||{color:'#d4621a',bg:'#fef2ea',border:'#f0b070'}
          return (
            <div key={i} className="slide-in" style={{animationDelay:`${i*0.07}s`,display:'flex',alignItems:'flex-start',gap:10,background:meta.bg,borderRadius:10,padding:'12px 14px',border:`1px solid ${meta.border}`,transition:'transform 0.2s',cursor:'default'}}
              onMouseEnter={e=>e.currentTarget.style.transform='translateX(3px)'}
              onMouseLeave={e=>e.currentTarget.style.transform=''}>
              <span style={{fontSize:18,flexShrink:0}}>{rec.icon}</span>
              <div>
                <div style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:13,color:meta.color,marginBottom:3}}>{rec.model}</div>
                <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>{rec.reason}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────
function ChartCard({ title, subtitle, data, unit, delay=0 }) {
  return (
    <div className="fade-up" style={{animationDelay:`${delay}s`,background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:'14px 16px',boxShadow:'var(--shadow)',transition:'transform 0.2s,box-shadow 0.2s'}}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='var(--shadow2)'}}
      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='var(--shadow)'}}>
      <div style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:14,color:'var(--text)',marginBottom:2}}>{title}</div>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>{subtitle}</div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} margin={{top:0,right:0,bottom:0,left:0}}>
          <XAxis dataKey="name" tick={{fontSize:11,fill:'var(--text2)',fontFamily:'DM Sans',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis hide/>
          <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,fontSize:12,fontFamily:'JetBrains Mono',boxShadow:'var(--shadow)'}} formatter={v=>[`${v}${unit}`,'']}/>
          <Bar dataKey="value" radius={[6,6,0,0]}>
            {data.map((d,i)=><Cell key={i} fill={d.color}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [prompt, setPrompt]     = useState('')
  const [system, setSystem]     = useState('You are a helpful AI assistant.')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [history, setHistory]   = useState([])
  const [error, setError]       = useState('')
  const [showSys, setShowSys]   = useState(false)
  const [activeTab, setActiveTab] = useState('cards')
  const [charCount, setCharCount] = useState(0)

  const run = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(''); setResult(null); setActiveTab('cards')
    try {
      const res = await fetch('/evaluate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({prompt:prompt.trim(),system_prompt:system}),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setResult(data)
      setHistory(h=>[{...data,short:prompt.slice(0,50)},...h].slice(0,20))
    } catch(e) { setError(e.message) }
    finally    { setLoading(false)   }
  }

  const sorted = result ? [...result.results].sort((a,b)=>(b.scores.overall||0)-(a.scores.overall||0)) : []

  const Tab = ({id,label}) => (
    <button onClick={()=>setActiveTab(id)} style={{
      background:'transparent', border:'none',
      borderBottom:`3px solid ${activeTab===id ? 'var(--orange)' : 'transparent'}`,
      color: activeTab===id ? 'var(--orange)' : 'var(--text2)',
      fontFamily:'var(--font-s)', fontSize:13, fontWeight:700,
      padding:'10px 16px', cursor:'pointer', transition:'all 0.2s', marginBottom:-1,
    }}>{label}</button>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>

      {/* Header */}
      <header style={{
        padding:'0 2rem', height:60,
        background:`linear-gradient(135deg, var(--brown2), #3a1e08)`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100,
        boxShadow:'0 4px 20px rgba(44,26,10,0.3)',
        borderBottom:'2px solid var(--orange)',
      }} className="header-inner">
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{
            width:36,height:36,borderRadius:10,
            background:'linear-gradient(135deg,var(--orange),var(--gold))',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:18,color:'#fff',fontFamily:'var(--font-h)',fontWeight:800,
            boxShadow:'0 2px 8px rgba(212,98,26,0.5)',
            animation:'pulse-ring 3s infinite',
          }}>⬡</div>
          <div>
            <span className="header-logo-text" style={{fontFamily:'var(--font-h)',fontWeight:800,fontSize:20,color:'#fff',letterSpacing:'-0.02em'}}>LLMBench</span>
            <span style={{fontFamily:'var(--font-s)',fontSize:11,color:'rgba(255,255,255,0.5)',marginLeft:8}}>by Shourav</span>
          </div>
          <span className="header-badge" style={{fontSize:11,color:'#d4b896',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',padding:'3px 10px',borderRadius:100,fontWeight:600}}>Claude Benchmarker</span>
        </div>
        <div className="header-models" style={{display:'flex',alignItems:'center',gap:16}}>
          {history.length>0 && (
            <button className="header-csv" onClick={()=>exportCSV(history)} style={{background:'rgba(212,98,26,0.2)',border:'1px solid rgba(212,98,26,0.4)',color:'#ffcc88',fontFamily:'var(--font-s)',fontSize:12,fontWeight:700,padding:'6px 14px',borderRadius:8,cursor:'pointer',transition:'all 0.2s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(212,98,26,0.35)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(212,98,26,0.2)'}>
              ⬇ Export CSV
            </button>
          )}
          {[['⚡','Haiku','#d4921a'],['⚖️','Sonnet','#e8762a'],['🧠','Opus','#d4b896']].map(([e,n,c])=>(
            <div key={n} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#d4b896',fontWeight:600}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:c,boxShadow:`0 0 6px ${c}`}}/>{e} {n}
            </div>
          ))}
        </div>
      </header>

      <div style={{flex:1,display:'flex',overflow:'hidden',height:'calc(100vh - 60px)'}}>

        {/* Sidebar */}
        {history.length>0 && (
          <aside style={{width:265,background:'rgba(255,248,240,0.95)',backdropFilter:'blur(8px)',borderRight:'1px solid var(--border)',padding:'1.25rem',overflowY:'auto',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:11,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'0.09em',fontWeight:700}}>History ({history.length})</div>
              <button onClick={()=>exportCSV(history)} style={{background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)',fontFamily:'var(--font-s)',fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:6,cursor:'pointer'}}>⬇ CSV</button>
            </div>
            {history.map((h,i)=>(
              <div key={i} className="slide-in" style={{animationDelay:`${i*0.04}s`}}
                onClick={()=>{setResult(h);setPrompt(h.prompt)}}>
                <div style={{
                  padding:'10px 12px',borderRadius:10,cursor:'pointer',marginBottom:6,
                  background: result?.run_id===h.run_id ? 'var(--orange-bg)' : 'var(--bg3)',
                  border:`1px solid ${result?.run_id===h.run_id ? 'var(--border2)' : 'var(--border)'}`,
                  transition:'all 0.15s',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='translateX(2px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=result?.run_id===h.run_id?'var(--border2)':'var(--border)';e.currentTarget.style.transform=''}}>
                  <div style={{fontSize:12,color:'var(--text)',marginBottom:4,lineHeight:1.4,fontWeight:500}}>{h.short}{h.short.length>=50?'…':''}</div>
                  <div style={{fontSize:11,color:'var(--text3)'}}>🏆 <span style={{color:(MODELS_META[h.winner]||{}).color||'var(--orange)',fontWeight:700}}>{h.winner}</span></div>
                </div>
              </div>
            ))}
          </aside>
        )}

        {/* Main */}
        <main style={{flex:1,overflowY:'auto',padding:'2rem'}}>

          {/* Input card */}
          <div className="input-card fade-up" style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(8px)',border:'1px solid var(--border)',borderRadius:20,padding:'1.5rem',marginBottom:'1.75rem',boxShadow:'var(--shadow2)'}}>
            <div className="input-title" style={{fontFamily:'var(--font-h)',fontWeight:800,fontSize:22,color:'var(--text)',marginBottom:4}}>What do you want to benchmark?</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.65}}>All 3 Claude models respond in parallel. Each answer is automatically scored on quality, clarity, and completeness.</div>

            <div style={{position:'relative'}}>
              <textarea value={prompt}
                onChange={e=>{setPrompt(e.target.value);setCharCount(e.target.value.length)}}
                onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))run()}}
                placeholder="Type any question or task here..." rows={3}
                style={{width:'100%',background:'var(--bg)',border:'2px solid var(--border)',borderRadius:12,color:'var(--text)',fontFamily:'var(--font-s)',fontSize:14,padding:'12px 14px',resize:'none',lineHeight:1.6,outline:'none',transition:'border-color 0.2s,box-shadow 0.2s',fontWeight:400}}
                onFocus={e=>{e.target.style.borderColor='var(--orange)';e.target.style.boxShadow='0 0 0 3px rgba(212,98,26,0.1)'}}
                onBlur={e=>{e.target.style.borderColor='var(--border)';e.target.style.boxShadow=''}}
              />
              {charCount>0 && <div style={{position:'absolute',bottom:8,right:12,fontSize:10,color:'var(--text3)',fontFamily:'var(--font-m)'}}>{charCount}</div>}
            </div>

            <div style={{marginTop:8}}>
              <button onClick={()=>setShowSys(v=>!v)} style={{background:'none',border:'none',color:'var(--text3)',fontSize:12,cursor:'pointer',padding:0,fontFamily:'var(--font-s)',fontWeight:600,transition:'color 0.2s'}}
                onMouseEnter={e=>e.currentTarget.style.color='var(--orange)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text3)'}>
                {showSys?'▲':'▼'} System prompt
              </button>
              {showSys && (
                <textarea value={system} onChange={e=>setSystem(e.target.value)} rows={2}
                  style={{display:'block',marginTop:8,width:'100%',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:8,color:'var(--text2)',fontFamily:'var(--font-s)',fontSize:13,padding:'10px 12px',resize:'none',outline:'none'}}/>
              )}
            </div>

            <div className="run-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:14,flexWrap:'wrap',gap:10}}>
              <div className="examples-row" style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:12,color:'var(--text3)',fontWeight:600}}>Try:</span>
                {EXAMPLES.map(e=>(
                  <button key={e.label} onClick={()=>setPrompt(e.prompt)} style={{
                    background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text2)',
                    fontSize:11,padding:'6px 12px',borderRadius:100,cursor:'pointer',
                    fontFamily:'var(--font-s)',fontWeight:600,transition:'all 0.2s',
                  }}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--cream)';e.currentTarget.style.borderColor='var(--border2)';e.currentTarget.style.transform='scale(1.04)'}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--bg3)';e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='scale(1)'}}>
                    {e.label}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:11,color:'var(--text3)'}}>Ctrl+Enter to run</span>
                <button onClick={run} disabled={!prompt.trim()||loading} style={{
                  background: loading ? 'var(--bg3)' : 'linear-gradient(135deg,var(--orange),var(--orange2))',
                  color: loading ? 'var(--text3)' : '#fff',
                  border:'none',fontFamily:'var(--font-h)',fontWeight:700,
                  fontSize:15,padding:'11px 28px',borderRadius:12,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(212,98,26,0.4)',
                  transition:'all 0.2s',letterSpacing:'0.01em',
                  animation: !prompt.trim()||loading ? 'none' : 'pulse-ring 3s infinite',
                }}
                  onMouseEnter={e=>{if(!loading&&prompt.trim()){e.currentTarget.style.transform='scale(1.04)';e.currentTarget.style.boxShadow='0 6px 20px rgba(212,98,26,0.5)'}}}
                  onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=loading?'none':'0 4px 16px rgba(212,98,26,0.4)'}}>
                  {loading ? '⏳ Running...' : 'Run Benchmark →'}
                </button>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:24,padding:'3rem'}}>
              <div className="loading-cards" style={{display:'flex',gap:16}}>
                {[['⚡','Claude Haiku','#d4921a'],['⚖️','Claude Sonnet','#d4621a'],['🧠','Claude Opus','#7c4a1e']].map(([e,n,c],i)=>(
                  <div className="loading-card" key={n} style={{background:'#fff',border:`2px solid ${c}`,borderRadius:16,padding:'16px 22px',display:'flex',alignItems:'center',gap:12,boxShadow:`0 8px 24px ${c}30`,animation:`bob 1.4s ease-in-out ${i*0.2}s infinite`}}>
                    <span style={{fontSize:24}}>{e}</span>
                    <div>
                      <div style={{fontFamily:'var(--font-h)',fontSize:14,fontWeight:700,color:'var(--text)'}}>{n}</div>
                      <div style={{fontSize:11,color:c,fontWeight:600,animation:'shimmer 1.5s linear infinite',background:`linear-gradient(90deg,${c},${c}88,${c})`,backgroundSize:'200% auto',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Thinking...</div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{fontSize:13,color:'var(--text2)',fontWeight:500,textAlign:'center'}}>Running all 3 models in parallel and scoring responses...<br/><span style={{fontSize:11,color:'var(--text3)'}}>This usually takes 15–40 seconds</span></p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="pop-in" style={{background:'#fff5ee',border:'2px solid #f0a080',borderRadius:14,padding:'14px 18px',color:'var(--orange)',fontSize:13,fontWeight:600,marginBottom:'1.5rem',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>⚠️</span>
              <span>{error} — Make sure <code style={{background:'rgba(0,0,0,0.06)',padding:'1px 5px',borderRadius:3}}>python main.py</code> is running.</span>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Summary */}
              <div className="summary-bar fade-up" style={{background:'rgba(255,255,255,0.95)',border:'1px solid var(--border)',borderRadius:16,padding:'16px 22px',marginBottom:'1.5rem',display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',boxShadow:'var(--shadow)'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Benchmarked prompt</div>
                  <div style={{fontSize:14,color:'var(--text)',fontWeight:500,lineHeight:1.5}}>"{result.prompt.slice(0,90)}{result.prompt.length>90?'…':''}"</div>
                </div>
                <div className="summary-stats" style={{display:'flex',gap:28}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Winner</div>
                    <div style={{fontFamily:'var(--font-h)',fontSize:16,fontWeight:800,color:(MODELS_META[result.winner]||{}).color||'var(--orange)'}}>🏆 {result.winner}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Total cost</div>
                    <div style={{fontFamily:'var(--font-m)',fontSize:15,fontWeight:700,color:'var(--text)'}}>${result.results.reduce((s,r)=>s+r.cost_usd,0).toFixed(5)}</div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="charts-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:'1.5rem'}}>
                {[
                  {title:'Response Time',subtitle:'lower is faster',unit:'ms',key:r=>Math.round(r.latency_ms)},
                  {title:'Quality Score', subtitle:'higher is better',unit:'/10',key:r=>r.scores.overall||0},
                  {title:'Cost per Run',  subtitle:'lower is cheaper',unit:'mc',key:r=>parseFloat((r.cost_usd*1000).toFixed(3))},
                  {title:'Efficiency',    subtitle:'quality ÷ cost',  unit:'',key:efficiencyScore},
                ].map((c,i)=>(
                  <ChartCard key={c.title} {...c} delay={i*0.06}
                    data={result.results.map(r=>({name:r.model_label.split(' ')[1],value:c.key(r),color:(MODELS_META[r.model_label]||{}).color||'#d4621a'}))}/>
                ))}
              </div>

              <BestForPanel results={result.results}/>
              <CostCalculator results={result.results}/>

              {/* Tabs */}
              <div style={{borderBottom:'2px solid var(--border)',marginBottom:'1.25rem',display:'flex',gap:0}}>
                <Tab id="cards"   label="📊 Model Cards"/>
                <Tab id="compare" label="↔ Side-by-Side"/>
              </div>

              {activeTab==='cards' && (
                <div className="cards-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'1rem'}}>
                  {sorted.map((r,i)=><ModelCard key={r.model_id} result={r} isWinner={r.model_label===result.winner} delay={i*0.1}/>)}
                </div>
              )}
              {activeTab==='compare' && <SideBySide results={result.results}/>}
            </>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div style={{textAlign:'center',padding:'3rem 1rem'}}>
              <div className="empty-title fade-up" style={{fontFamily:'var(--font-h)',fontWeight:800,fontSize:34,color:'var(--text)',marginBottom:12,letterSpacing:'-0.03em',lineHeight:1.2}}>
                Benchmark Claude models<br/><span style={{color:'var(--orange)',backgroundImage:'linear-gradient(135deg,var(--orange),var(--gold))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>side by side.</span>
              </div>
              <p className="fade-up" style={{animationDelay:'0.1s',fontSize:14,color:'var(--text2)',lineHeight:1.8,maxWidth:480,margin:'0 auto 2.5rem'}}>
                Type any prompt. All 3 Claude models answer at once. See which is fastest, most accurate, and most cost-efficient — instantly.
              </p>
              <div className="feature-cards" style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
                {[
                  {emoji:'⚡',title:'Parallel calls',  desc:'All 3 models at once',      color:'#d4921a',bg:'linear-gradient(135deg,#fef9ec,#fef0c7)'},
                  {emoji:'🤖',title:'AI evaluation',   desc:'Auto-scored on quality',     color:'#d4621a',bg:'linear-gradient(135deg,#fef2ea,#fde8d0)'},
                  {emoji:'🎯',title:'Recommendations', desc:'"Best for" per use case',    color:'#c4813d',bg:'linear-gradient(135deg,#fdf0e0,#fae8cc)'},
                  {emoji:'💰',title:'Cost calculator', desc:'Scale cost estimation',      color:'#7c4a1e',bg:'linear-gradient(135deg,#f5e6d0,#eedfc5)'},
                  {emoji:'↔', title:'Side by side',    desc:'Compare all 3 responses',   color:'#c05a3a',bg:'linear-gradient(135deg,#faebd7,#f5dfc0)'},
                  {emoji:'⬇', title:'CSV export',      desc:'Download all your runs',    color:'#8b5e3c',bg:'linear-gradient(135deg,#f5e6d0,#eedfc5)'},
                ].map((f,i)=>(
                  <div key={f.title} className="pop-in" style={{animationDelay:`${0.15+i*0.07}s`,background:f.bg,border:'1px solid var(--border)',borderRadius:16,padding:'18px 20px',width:155,textAlign:'left',boxShadow:'var(--shadow)',transition:'transform 0.25s,box-shadow 0.25s',cursor:'default'}}
                    onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-6px) scale(1.04)';e.currentTarget.style.boxShadow='var(--shadow2)'}}
                    onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='var(--shadow)'}}>
                    <div style={{fontSize:28,marginBottom:10,animation:`wiggle 2s ease ${i*0.5}s`}}>{f.emoji}</div>
                    <div style={{fontFamily:'var(--font-h)',fontWeight:700,fontSize:14,color:'var(--text)',marginBottom:4}}>{f.title}</div>
                    <div style={{fontSize:11,color:'var(--text3)',fontWeight:500}}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
