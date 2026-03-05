import { useState, useEffect, useCallback } from "react";
import {
  fetchOpinions, createOpinion, likeOpinion,
  updateStatus, replyOpinion, deleteOpinion,
} from "./lib/supabase";

const ADMIN_PW = import.meta.env.VITE_ADMIN_PW || "2026";

const CATEGORIES = [
  { id: "suggest", label: "💡 사역 제안", color: "#6366F1", bg: "#EEF2FF" },
  { id: "feedback", label: "📋 건의사항", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "thanks", label: "💛 감사/격려", color: "#10B981", bg: "#ECFDF5" },
  { id: "concern", label: "🤔 고민/상담", color: "#EC4899", bg: "#FDF2F8" },
  { id: "event", label: "🎪 행사 아이디어", color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "other", label: "✏️ 기타", color: "#64748B", bg: "#F8FAFC" },
];
const PRIORITY = [
  { id: "normal", label: "일반", color: "#64748B" },
  { id: "important", label: "중요", color: "#F59E0B" },
  { id: "urgent", label: "긴급", color: "#EF4444" },
];
const STATUS_MAP = {
  new: { label: "새 의견", color: "#6366F1", bg: "#EEF2FF" },
  read: { label: "확인됨", color: "#64748B", bg: "#F1F5F9" },
  replied: { label: "답변완료", color: "#10B981", bg: "#ECFDF5" },
  archived: { label: "보관됨", color: "#94A3B8", bg: "#F8FAFC" },
};

function exportToExcel(opinions) {
  const catMap = {}; CATEGORIES.forEach(c => catMap[c.id] = c.label);
  const priMap = {}; PRIORITY.forEach(p => priMap[p.id] = p.label);
  const stMap = {}; Object.entries(STATUS_MAP).forEach(([k, v]) => stMap[k] = v.label);
  const header = ["번호","날짜","카테고리","공개여부","익명여부","작성자","제목","내용","중요도","상태","좋아요","답변","답변일자"];
  const rows = opinions.map((o, i) => [
    i+1, o.created_at?.split("T")[0]||"", catMap[o.category]||"", o.secret?"비밀글":"공개",
    o.anonymous?"익명":"실명", o.author, o.title, o.content, priMap[o.priority]||"",
    stMap[o.status]||"", o.likes, o.reply||"", o.reply_date||""
  ]);
  const esc = v => { const s=String(v??""); return (s.includes(",")||s.includes('"')||s.includes("\n"))?'"'+s.replace(/"/g,'""')+'"':s; };
  const csv = "\uFEFF"+[header,...rows].map(r=>r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `여디디야_의견함_${new Date().toISOString().split("T")[0]}.csv`; a.click();
}

function fmtDate(d) { return d ? (d.split("T")[0]) : ""; }

// ─── Opinion Card ───
function OpinionCard({ opinion, onClick, compact, isAdmin }) {
  const cat = CATEGORIES.find(c=>c.id===opinion.category)||CATEGORIES[5];
  const st = STATUS_MAP[opinion.status]||STATUS_MAP.new;
  const pri = PRIORITY.find(p=>p.id===opinion.priority);
  return (
    <button onClick={onClick} style={{width:"100%",textAlign:"left",background:opinion.secret?"#FFFBFB":"white",borderRadius:16,padding:compact?"14px 16px":"16px 18px",marginBottom:10,border:opinion.secret?"1px solid #FECACA":"1px solid #F5F5F4",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",borderLeft:`3px solid ${cat.color}`,position:"relative",fontFamily:"inherit"}}>
      {opinion.secret&&<div style={{position:"absolute",top:8,right:8,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:6,background:"#FEE2E2",color:"#DC2626"}}>🔒 비밀글</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
            <span style={{fontSize:10.5,fontWeight:600,padding:"2px 8px",borderRadius:6,background:cat.bg,color:cat.color}}>{cat.label}</span>
            <span style={{fontSize:10.5,fontWeight:500,padding:"2px 8px",borderRadius:6,background:st.bg,color:st.color}}>{st.label}</span>
            {opinion.priority!=="normal"&&pri&&<span style={{fontSize:10.5,fontWeight:600,padding:"2px 8px",borderRadius:6,background:pri.color==="#EF4444"?"#FEE2E2":"#FEF3C7",color:pri.color}}>{pri.label}</span>}
          </div>
          <div style={{fontSize:14,fontWeight:600,color:"#1C1917",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:compact?"nowrap":"normal",paddingRight:opinion.secret?60:0}}>{opinion.title}</div>
          {!compact&&<div style={{fontSize:12.5,color:"#78716C",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{opinion.content}</div>}
        </div>
        {!opinion.secret&&<div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginTop:compact?0:4}}><span style={{fontSize:12}}>❤️</span><span style={{fontSize:12,fontWeight:600,color:"#78716C"}}>{opinion.likes}</span></div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:"#A8A29E"}}>
        <span>{opinion.secret?(isAdmin?`🔒 ${opinion.author}`:"🔒 비밀글"):(opinion.anonymous?"🕶️ 익명":`😊 ${opinion.author}`)}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {opinion.reply&&<span style={{fontSize:10,fontWeight:600,color:"#10B981"}}>💬</span>}
          <span>{fmtDate(opinion.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Main App ───
export default function App() {
  const [page, setPage] = useState("home");
  const [opinions, setOpinions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterVis, setFilterVis] = useState("all");
  const [toast, setToast] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPw, setLoginPw] = useState("");
  const [anim, setAnim] = useState(true);
  const [form, setForm] = useState({category:"",title:"",content:"",author:"",anonymous:true,secret:false,priority:"normal"});
  const [replyText, setReplyText] = useState("");
  const [showDel, setShowDel] = useState(false);
  const [likedIds, setLikedIds] = useState({});

  // Load opinions
  const load = useCallback(async () => {
    try {
      const data = await fetchOpinions();
      setOpinions(data || []);
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh selected opinion when opinions change
  useEffect(() => {
    if (selected) {
      const updated = opinions.find(o => o.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [opinions]);

  const nav = (p, o = null) => {
    setAnim(false);
    setTimeout(() => { setPage(p); setSelected(o); setAnim(true); setReplyText(""); setShowDel(false); }, 150);
  };
  const notify = m => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const pubOps = isAdmin ? opinions : opinions.filter(o => !o.secret);

  const doSubmit = async () => {
    if (!form.category||!form.title.trim()||!form.content.trim()) { notify("⚠️ 카테고리, 제목, 내용을 모두 입력해주세요"); return; }
    if (form.secret && !form.author.trim()) { notify("⚠️ 비밀글은 실명으로 작성해야 합니다"); return; }
    setSubmitting(true);
    try {
      await createOpinion({
        ...form,
        author: form.secret ? form.author : (form.anonymous ? "익명" : (form.author || "익명")),
        anonymous: form.secret ? false : form.anonymous,
      });
      setForm({category:"",title:"",content:"",author:"",anonymous:true,secret:false,priority:"normal"});
      notify(form.secret ? "🔒 비밀글이 접수되었습니다" : "✅ 의견이 접수되었습니다!");
      await load();
      nav("home");
    } catch (e) {
      notify("❌ 오류가 발생했습니다. 다시 시도해주세요.");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const doLike = async (id) => {
    if (likedIds[id]) { notify("이미 공감하셨습니다"); return; }
    const op = opinions.find(o => o.id === id);
    if (!op) return;
    setLikedIds({ ...likedIds, [id]: true });
    try {
      await likeOpinion(id, op.likes);
      await load();
    } catch (e) { console.error(e); }
  };

  const doStatus = async (id, s) => {
    try { await updateStatus(id, s); await load(); } catch (e) { console.error(e); }
  };
  const doReply = async (id, r) => {
    try { await replyOpinion(id, r); await load(); notify("💬 답변이 등록되었습니다"); } catch (e) { console.error(e); }
  };
  const doDel = async (id) => {
    try { await deleteOpinion(id); await load(); notify("🗑️ 삭제되었습니다"); nav("list"); } catch (e) { console.error(e); }
  };

  const getFiltered = useCallback(() => {
    let l = isAdmin ? opinions : opinions.filter(o => !o.secret);
    if (filterVis === "public") l = l.filter(o => !o.secret);
    if (filterVis === "secret") l = l.filter(o => o.secret);
    if (filterCat !== "all") l = l.filter(o => o.category === filterCat);
    return l;
  }, [opinions, isAdmin, filterCat, filterVis]);
  const filtered = getFiltered();

  const stats = {
    total: opinions.length,
    pub: opinions.filter(o => !o.secret).length,
    secret: opinions.filter(o => o.secret).length,
    new_: opinions.filter(o => o.status === "new").length,
    replied: opinions.filter(o => o.status === "replied").length,
  };

  const doLogin = () => {
    if (loginPw === ADMIN_PW) { setIsAdmin(true); setShowLogin(false); setLoginPw(""); notify("🔓 임원진 모드 활성화"); }
    else notify("❌ 비밀번호가 올바르지 않습니다");
  };

  const S = { card: { background: "white", borderRadius: 16, padding: 16, marginBottom: 12, border: "1px solid #F5F5F4", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" } };

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#FAFAF9",gap:16}}>
      <div style={{width:40,height:40,border:"3px solid #E7E5E4",borderTop:"3px solid #6366F1",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:14,color:"#78716C",fontWeight:500}}>의견함을 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#FAFAF9"}}>
      {/* Toast */}
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#1C1917",color:"white",padding:"12px 24px",borderRadius:16,fontSize:14,fontWeight:500,zIndex:1000,boxShadow:"0 8px 32px rgba(0,0,0,0.2)",maxWidth:"90%",textAlign:"center"}} className="su">{toast}</div>}

      {/* Login Modal */}
      {showLogin&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowLogin(false)}>
        <div style={{background:"white",borderRadius:24,padding:32,width:"100%",maxWidth:320,boxShadow:"0 24px 64px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()} className="su">
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:48,marginBottom:12}}>🔐</div>
            <h3 style={{fontSize:18,fontWeight:700,color:"#1C1917"}}>임원진 인증</h3>
            <p style={{fontSize:12.5,color:"#78716C",marginTop:6}}>비밀번호를 입력해주세요</p>
          </div>
          <input type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} placeholder="비밀번호" autoFocus onKeyDown={e=>e.key==="Enter"&&doLogin()} style={{width:"100%",padding:"14px 16px",fontSize:16,textAlign:"center",border:"2px solid #E7E5E4",borderRadius:14,outline:"none",letterSpacing:4,fontWeight:600}}/>
          <button onClick={doLogin} style={{width:"100%",marginTop:16,padding:14,borderRadius:14,background:"#6366F1",color:"white",fontSize:15,fontWeight:600}}>확인</button>
        </div>
      </div>}

      {/* Header */}
      <header style={{background:"linear-gradient(135deg,#4F46E5 0%,#7C3AED 50%,#6366F1 100%)",padding:"32px 20px 28px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.08)"}}/>
        <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"inline-block",background:"rgba(255,255,255,0.18)",padding:"4px 12px",borderRadius:100,fontSize:11,color:"rgba(255,255,255,0.9)",fontWeight:500,marginBottom:10}}>여디디야 청년부</div>
            <h1 style={{fontSize:24,fontWeight:800,color:"white",fontFamily:"'Outfit','Noto Sans KR',sans-serif"}}>의견함 📮</h1>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.75)",marginTop:4}}>여러분의 목소리가 여디디야를 만들어갑니다</p>
          </div>
          <button onClick={()=>isAdmin?(setIsAdmin(false),notify("🔒 로그아웃 완료")):setShowLogin(true)} style={{background:isAdmin?"rgba(16,185,129,0.25)":"rgba(255,255,255,0.15)",border:isAdmin?"1px solid rgba(16,185,129,0.4)":"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"8px 14px",color:"white",fontSize:11,fontWeight:500}}>
            {isAdmin?"✅ 임원진":"🔒 로그인"}
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{padding:"16px 16px 100px",maxWidth:480,margin:"0 auto",opacity:anim?1:0,transition:"opacity .15s"}}>

        {/* ═══ HOME ═══ */}
        {page==="home"&&<div className="su">
          <div style={{display:"grid",gridTemplateColumns:isAdmin?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:10,marginTop:16,marginBottom:20}}>
            {[{v:isAdmin?stats.total:stats.pub,l:"전체 의견",c:"#6366F1"},{v:stats.new_,l:"새 의견",c:"#F59E0B"},{v:stats.replied,l:"답변완료",c:"#10B981"},...(isAdmin?[{v:stats.secret,l:"비밀글",c:"#DC2626"}]:[])].map((s,i)=>
              <div key={i} style={{background:"white",borderRadius:16,padding:"14px 8px",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.04)",border:"1px solid #F5F5F4"}}>
                <div style={{fontSize:isAdmin?22:26,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif"}}>{s.v}</div>
                <div style={{fontSize:10,color:"#78716C",fontWeight:500,marginTop:2}}>{s.l}</div>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <button onClick={()=>nav("submit")} style={{flex:1,padding:"18px 16px",borderRadius:20,background:"linear-gradient(135deg,#6366F1,#8B5CF6)",color:"white",fontSize:15,fontWeight:700,boxShadow:"0 8px 24px rgba(99,102,241,0.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>✍️ 의견 남기기</button>
            <button onClick={()=>{setForm(f=>({...f,secret:true,anonymous:false}));nav("submit");}} style={{padding:"18px 18px",borderRadius:20,background:"linear-gradient(135deg,#DC2626,#EF4444)",color:"white",fontSize:15,fontWeight:700,boxShadow:"0 8px 24px rgba(220,38,38,0.2)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>🔒 비밀글</button>
          </div>
          <div style={{background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)",borderRadius:16,padding:16,marginBottom:20,border:"1px solid #FDE68A"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#92400E",marginBottom:8}}>📮 여디디야 의견함 안내</div>
            <div style={{fontSize:12.5,color:"#78350F",lineHeight:1.7}}>사역 제안, 건의사항, 감사, 고민 상담 등 자유롭게 의견을 남겨주세요. <strong>🔒 비밀글</strong>은 임원진만 확인 가능하며 <strong>실명 작성</strong>이 필요합니다.</div>
          </div>
          {pubOps.length>0?<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#1C1917"}}>최근 의견</h2>
              <button onClick={()=>nav("list")} style={{fontSize:12,color:"#6366F1",fontWeight:600,background:"none",padding:"4px 8px"}}>전체보기 →</button>
            </div>
            {pubOps.slice(0,3).map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} compact isAdmin={isAdmin}/>)}
          </>:<div style={{textAlign:"center",padding:40,color:"#A8A29E"}}><div style={{fontSize:48,marginBottom:12}}>📭</div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>아직 의견이 없습니다</div><div style={{fontSize:13}}>첫 번째 의견을 남겨보세요!</div></div>}
        </div>}

        {/* ═══ SUBMIT ═══ */}
        {page==="submit"&&<div className="su">
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:16,marginBottom:20}}>
            <button onClick={()=>{setForm({category:"",title:"",content:"",author:"",anonymous:true,secret:false,priority:"normal"});nav("home");}} style={{background:"none",fontSize:20,padding:4}}>←</button>
            <h2 style={{fontSize:18,fontWeight:700}}>의견 남기기</h2>
          </div>
          {/* Secret toggle */}
          <div style={{...S.card,background:form.secret?"linear-gradient(135deg,#FEF2F2,#FEE2E2)":"white",border:form.secret?"1.5px solid #FECACA":"1px solid #F5F5F4",transition:"all .3s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:14,fontWeight:600,color:form.secret?"#DC2626":"#1C1917"}}>{form.secret?"🔒 비밀글 모드":"📢 공개글 모드"}</div><div style={{fontSize:11.5,color:form.secret?"#991B1B":"#A8A29E",marginTop:2}}>{form.secret?"임원진만 확인 가능 · 실명 작성 필수":"전체 공개됩니다"}</div></div>
              <button onClick={()=>{const ns=!form.secret;setForm({...form,secret:ns,anonymous:ns?false:form.anonymous});}} style={{width:52,height:28,borderRadius:14,position:"relative",background:form.secret?"#DC2626":"#D6D3D1",transition:"background .2s"}}><div style={{width:22,height:22,borderRadius:11,background:"white",position:"absolute",top:3,left:form.secret?27:3,transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}/></button>
            </div>
            {form.secret&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,0.7)",borderRadius:12}}><div style={{fontSize:12,fontWeight:600,color:"#991B1B",marginBottom:6}}>✏️ 실명 작성 (임원진에게만 공개)</div><input value={form.author} onChange={e=>setForm({...form,author:e.target.value})} placeholder="이름을 입력해주세요 (필수)" style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"1.5px solid #FECACA",fontSize:14,outline:"none",background:"white"}}/></div>}
          </div>
          {/* Anonymous (public only) */}
          {!form.secret&&<div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:14,fontWeight:600}}>{form.anonymous?"🕶️ 익명으로 제출":"😊 실명으로 제출"}</div><div style={{fontSize:11.5,color:"#A8A29E",marginTop:2}}>{form.anonymous?"이름이 공개되지 않습니다":"이름이 함께 표시됩니다"}</div></div>
              <button onClick={()=>setForm({...form,anonymous:!form.anonymous})} style={{width:52,height:28,borderRadius:14,position:"relative",background:form.anonymous?"#6366F1":"#D6D3D1",transition:"background .2s"}}><div style={{width:22,height:22,borderRadius:11,background:"white",position:"absolute",top:3,left:form.anonymous?27:3,transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}/></button>
            </div>
            {!form.anonymous&&<input value={form.author} onChange={e=>setForm({...form,author:e.target.value})} placeholder="이름을 입력해주세요" style={{width:"100%",marginTop:12,padding:"12px 14px",borderRadius:12,border:"1.5px solid #E7E5E4",fontSize:14,outline:"none"}}/>}
          </div>}
          {/* Category */}
          <div style={S.card}><div style={{fontSize:14,fontWeight:600,marginBottom:10}}>카테고리 선택</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setForm({...form,category:c.id})} style={{padding:"8px 14px",borderRadius:10,fontSize:12.5,fontWeight:500,background:form.category===c.id?c.color:c.bg,color:form.category===c.id?"white":c.color,transition:"all .2s"}}>{c.label}</button>)}</div></div>
          {/* Priority */}
          <div style={S.card}><div style={{fontSize:14,fontWeight:600,marginBottom:10}}>중요도</div><div style={{display:"flex",gap:8}}>{PRIORITY.map(p=><button key={p.id} onClick={()=>setForm({...form,priority:p.id})} style={{flex:1,padding:10,borderRadius:10,fontSize:13,fontWeight:500,background:form.priority===p.id?p.color:"#F5F5F4",color:form.priority===p.id?"white":"#78716C"}}>{p.label}</button>)}</div></div>
          {/* Title & Content */}
          <div style={S.card}>
            <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="제목을 입력해주세요" maxLength={100} style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1.5px solid #E7E5E4",fontSize:15,fontWeight:600,outline:"none",marginBottom:10}}/>
            <div style={{position:"relative"}}><textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder={form.secret?"비밀 의견을 자유롭게 작성해주세요...\n(임원진만 확인 가능합니다)":"의견을 자유롭게 작성해주세요..."} maxLength={1000} rows={6} style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1.5px solid #E7E5E4",fontSize:14,outline:"none",lineHeight:1.6}}/><div style={{position:"absolute",bottom:8,right:12,fontSize:11,color:"#A8A29E"}}>{form.content.length}/1000</div></div>
          </div>
          <button onClick={doSubmit} disabled={submitting} style={{width:"100%",padding:16,borderRadius:16,background:submitting?"#A8A29E":(form.category&&form.title&&form.content&&(!form.secret||form.author))?(form.secret?"linear-gradient(135deg,#DC2626,#EF4444)":"linear-gradient(135deg,#6366F1,#8B5CF6)"):"#D6D3D1",color:"white",fontSize:16,fontWeight:700,boxShadow:(!submitting&&form.category&&form.title&&form.content)?`0 8px 24px ${form.secret?"rgba(220,38,38,0.3)":"rgba(99,102,241,0.3)"}`:"none",opacity:submitting?0.7:1}}>{submitting?"제출 중...":(form.secret?"🔒 비밀글 제출하기":"📮 의견 제출하기")}</button>
        </div>}

        {/* ═══ LIST ═══ */}
        {page==="list"&&<div className="su">
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:16,marginBottom:16}}>
            <button onClick={()=>nav("home")} style={{background:"none",fontSize:20,padding:4}}>←</button>
            <h2 style={{fontSize:18,fontWeight:700}}>전체 의견</h2>
            <span style={{fontSize:13,color:"#A8A29E",fontWeight:500}}>{filtered.length}건</span>
            {/* Refresh */}
            <button onClick={load} style={{marginLeft:"auto",background:"none",fontSize:16,padding:4}} title="새로고침">🔄</button>
          </div>
          {isAdmin&&<div style={{display:"flex",gap:6,marginBottom:10}}>{[{id:"all",l:"📋 전체",c:"#1C1917"},{id:"public",l:"📢 공개글",c:"#6366F1"},{id:"secret",l:"🔒 비밀글",c:"#DC2626"}].map(v=><button key={v.id} onClick={()=>setFilterVis(v.id)} style={{padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:filterVis===v.id?v.c:"#F5F5F4",color:filterVis===v.id?"white":"#78716C",whiteSpace:"nowrap"}}>{v.l}</button>)}</div>}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}}>
            <button onClick={()=>setFilterCat("all")} style={{padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:filterCat==="all"?"#1C1917":"#F5F5F4",color:filterCat==="all"?"white":"#78716C",whiteSpace:"nowrap",flexShrink:0}}>전체</button>
            {CATEGORIES.map(c=><button key={c.id} onClick={()=>setFilterCat(c.id)} style={{padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:filterCat===c.id?c.color:c.bg,color:filterCat===c.id?"white":c.color,whiteSpace:"nowrap",flexShrink:0}}>{c.label}</button>)}
          </div>
          {filtered.length===0?<div style={{textAlign:"center",padding:40,color:"#A8A29E"}}><div style={{fontSize:40,marginBottom:12}}>📭</div><div style={{fontSize:14,fontWeight:500}}>해당하는 의견이 없습니다</div></div>:filtered.map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} isAdmin={isAdmin}/>)}
        </div>}

        {/* ═══ DETAIL ═══ */}
        {page==="detail"&&selected&&<div className="su">
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:16,marginBottom:16}}>
            <button onClick={()=>nav("list")} style={{background:"none",fontSize:20,padding:4}}>←</button>
            <h2 style={{fontSize:18,fontWeight:700}}>의견 상세</h2>
          </div>
          {(()=>{const cat=CATEGORIES.find(c=>c.id===selected.category)||CATEGORIES[5];const st=STATUS_MAP[selected.status]||STATUS_MAP.new;return(<>
            <div style={{background:selected.secret?"#FFFBFB":"white",borderRadius:20,padding:20,marginBottom:16,border:selected.secret?"1px solid #FECACA":"1px solid #F5F5F4",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",borderTop:`4px solid ${selected.secret?"#DC2626":cat.color}`}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {selected.secret&&<span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8,background:"#FEE2E2",color:"#DC2626"}}>🔒 비밀글</span>}
                <span style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:8,background:cat.bg,color:cat.color}}>{cat.label}</span>
                <span style={{fontSize:11,fontWeight:500,padding:"4px 10px",borderRadius:8,background:st.bg,color:st.color}}>{st.label}</span>
                {selected.priority!=="normal"&&<span style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:8,background:selected.priority==="urgent"?"#FEE2E2":"#FEF3C7",color:PRIORITY.find(p=>p.id===selected.priority)?.color}}>{PRIORITY.find(p=>p.id===selected.priority)?.label}</span>}
              </div>
              <h3 style={{fontSize:18,fontWeight:700,color:"#1C1917",marginBottom:12,lineHeight:1.4}}>{selected.title}</h3>
              <p style={{fontSize:14,color:"#44403C",lineHeight:1.7,marginBottom:16,whiteSpace:"pre-wrap"}}>{selected.content}</p>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:12,borderTop:"1px solid #F5F5F4"}}>
                <div style={{fontSize:12,color:"#A8A29E"}}>{selected.secret?(isAdmin?`🔒 ${selected.author} (비밀글)`:"🔒 비밀글"):(selected.anonymous?"🕶️ 익명":`😊 ${selected.author}`)} · {fmtDate(selected.created_at)}</div>
                {!selected.secret&&<button onClick={()=>doLike(selected.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,background:likedIds[selected.id]?"#FEE2E2":"#FEF2F2",fontSize:13,fontWeight:600,color:"#EF4444",opacity:likedIds[selected.id]?0.6:1}}>❤️ {selected.likes}</button>}
              </div>
            </div>
            {/* Reply display */}
            {selected.reply&&<div style={{background:"linear-gradient(135deg,#ECFDF5,#D1FAE5)",borderRadius:16,padding:16,marginBottom:16,border:"1px solid #A7F3D0"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:28,height:28,borderRadius:8,background:"#10B981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💬</div>
                <div><div style={{fontSize:13,fontWeight:700,color:"#065F46"}}>임원진</div><div style={{fontSize:10,color:"#047857"}}>{selected.reply_date||""}</div></div>
              </div>
              <div style={{fontSize:13.5,color:"#065F46",lineHeight:1.7,paddingLeft:36,whiteSpace:"pre-wrap"}}>{selected.reply}</div>
            </div>}
            {/* Admin tools */}
            {isAdmin&&<div style={S.card}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>⚙️ 임원진 관리</div>
              {selected.secret&&<div style={{background:"#FEF2F2",borderRadius:10,padding:12,marginBottom:12,border:"1px solid #FECACA"}}><div style={{fontSize:12,fontWeight:600,color:"#991B1B",marginBottom:4}}>🔒 비밀글 작성자</div><div style={{fontSize:14,fontWeight:700,color:"#DC2626"}}>{selected.author}</div></div>}
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>{Object.entries(STATUS_MAP).map(([k,v])=><button key={k} onClick={()=>doStatus(selected.id,k)} style={{padding:"6px 12px",borderRadius:8,fontSize:11.5,fontWeight:500,background:selected.status===k?v.color:v.bg,color:selected.status===k?"white":v.color}}>{v.label}</button>)}</div>
              {!selected.reply&&<><div style={{fontSize:12,fontWeight:600,color:"#78716C",marginBottom:6}}>💬 임원진 답변 작성</div><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="답변을 작성해주세요..." rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E7E5E4",fontSize:13,outline:"none",lineHeight:1.5,marginBottom:8}}/><button onClick={()=>{if(replyText.trim()){doReply(selected.id,replyText);setReplyText("");}}} style={{padding:"10px 16px",borderRadius:10,background:replyText.trim()?"#10B981":"#D6D3D1",color:"white",fontSize:13,fontWeight:600}}>임원진 답변 등록</button></>}
              <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid #F5F5F4"}}>
                {!showDel?<button onClick={()=>setShowDel(true)} style={{padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:500,background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA"}}>🗑️ 의견 삭제</button>
                :<div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:12,color:"#DC2626",fontWeight:500}}>정말 삭제하시겠습니까?</span><button onClick={()=>doDel(selected.id)} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,background:"#DC2626",color:"white"}}>삭제</button><button onClick={()=>setShowDel(false)} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:500,background:"#F5F5F4",color:"#78716C"}}>취소</button></div>}
              </div>
            </div>}
          </>);})()}
        </div>}

        {/* ═══ ADMIN ═══ */}
        {page==="admin"&&isAdmin&&<div className="su">
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:16,marginBottom:20}}>
            <button onClick={()=>nav("home")} style={{background:"none",fontSize:20,padding:4}}>←</button>
            <h2 style={{fontSize:18,fontWeight:700}}>임원진 대시보드</h2>
            <button onClick={load} style={{marginLeft:"auto",background:"none",fontSize:16,padding:4}}>🔄</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
            {[{l:"전체",v:stats.total,i:"📊",c:"#6366F1"},{l:"미확인",v:stats.new_,i:"🔔",c:"#F59E0B"},{l:"답변완료",v:stats.replied,i:"✅",c:"#10B981"},{l:"공개글",v:stats.pub,i:"📢",c:"#8B5CF6"},{l:"비밀글",v:stats.secret,i:"🔒",c:"#DC2626"},{l:"좋아요",v:opinions.reduce((a,o)=>a+o.likes,0),i:"❤️",c:"#EF4444"}].map((s,i)=>
              <div key={i} style={{background:"white",borderRadius:14,padding:"14px 10px",textAlign:"center",border:"1px solid #F5F5F4",boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}><div style={{fontSize:18,marginBottom:2}}>{s.i}</div><div style={{fontSize:22,fontWeight:800,color:s.c,fontFamily:"'Outfit',sans-serif"}}>{s.v}</div><div style={{fontSize:10,color:"#78716C",marginTop:1}}>{s.l}</div></div>
            )}
          </div>
          <button onClick={()=>exportToExcel(opinions)} style={{width:"100%",padding:14,borderRadius:14,marginBottom:16,background:"linear-gradient(135deg,#059669,#10B981)",color:"white",fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(16,185,129,0.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📥 엑셀(CSV) 다운로드</button>
          {/* Category chart */}
          <div style={{...S.card,marginBottom:16}}><div style={{fontSize:14,fontWeight:700,marginBottom:12}}>📈 카테고리별 현황</div>
            {CATEGORIES.map(c=>{const cnt=opinions.filter(o=>o.category===c.id).length;const mx=Math.max(...CATEGORIES.map(cc=>opinions.filter(o=>o.category===cc.id).length),1);return(
              <div key={c.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{fontWeight:500,color:"#44403C"}}>{c.label}</span><span style={{fontWeight:700,color:c.color}}>{cnt}건</span></div><div style={{height:8,background:"#F5F5F4",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${cnt?((cnt/mx)*100):0}%`,background:c.color,borderRadius:4,transition:"width .5s"}}/></div></div>
            );})}
          </div>
          {/* Secret posts */}
          <div style={{...S.card,border:"1px solid #FECACA",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:"#DC2626",marginBottom:12}}>🔒 비밀글 목록</div>
            {opinions.filter(o=>o.secret).length===0?<div style={{textAlign:"center",padding:16,color:"#A8A29E",fontSize:13}}>비밀글이 없습니다</div>
            :opinions.filter(o=>o.secret).map(o=><div key={o.id} onClick={()=>nav("detail",o)} style={{padding:12,background:"#FFFBFB",borderRadius:12,marginBottom:8,border:"1px solid #FECACA",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:600,color:"#1C1917"}}>{o.title}</div><div style={{fontSize:11,color:"#991B1B",marginTop:2}}>작성자: <strong>{o.author}</strong> · {fmtDate(o.created_at)}</div></div><span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:6,background:(STATUS_MAP[o.status]||STATUS_MAP.new).bg,color:(STATUS_MAP[o.status]||STATUS_MAP.new).color}}>{(STATUS_MAP[o.status]||STATUS_MAP.new).label}</span></div></div>)}
          </div>
          {/* Pending */}
          <div style={S.card}><div style={{fontSize:14,fontWeight:700,marginBottom:12}}>🔔 미확인 의견</div>
            {opinions.filter(o=>o.status==="new").length===0?<div style={{textAlign:"center",padding:16,color:"#A8A29E",fontSize:13}}>✅ 모든 의견을 확인했습니다</div>
            :opinions.filter(o=>o.status==="new").map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} compact isAdmin={isAdmin}/>)}
          </div>
        </div>}
      </main>

      {/* Nav */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(20px)",borderTop:"1px solid #E7E5E4",padding:"8px 0 env(safe-area-inset-bottom,8px)",display:"flex",justifyContent:"center",gap:4,zIndex:100}}>
        {[{id:"home",icon:"🏠",label:"홈"},{id:"submit",icon:"✍️",label:"의견쓰기"},{id:"list",icon:"📋",label:"전체보기"},...(isAdmin?[{id:"admin",icon:"⚙️",label:"관리"}]:[])].map(t=>
          <button key={t.id} onClick={()=>nav(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 20px",borderRadius:12,background:page===t.id?"#EEF2FF":"transparent"}}>
            <span style={{fontSize:20}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:page===t.id?700:500,color:page===t.id?"#4F46E5":"#78716C"}}>{t.label}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
