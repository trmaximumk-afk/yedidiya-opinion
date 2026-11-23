import { useState, useEffect, useCallback } from "react";
import {
  supabase,
  fetchOpinions, fetchDeletedOpinions, createOpinion, likeOpinion,
  updateStatus, replyOpinion, removeReply,
  deleteOpinion, restoreOpinion, permanentDeleteOpinion,
} from "./lib/supabase";

// ─── 여디디야청년부(포털)에서 들어온 경우 ───
// 포털은 이 앱을 #yd=<토큰>&go=<user|admin> 으로 연다. 토큰은 yd_token, 마지막으로 확인된 역할은 yd_roles 에 둔다.
// 임원진 모드는 토큰이 있고 역할에 사역자(staff)나 임원(officer)이 있을 때만 쓸 수 있다(비밀번호 없음).
// go=admin 이면 바로 임원진 모드로, go=user 면 일반 모드로 연다. 머리글 버튼으로 두 모드를 오간다.
const YD_TOKEN_KEY = "yd_token";
const YD_ROLES_KEY = "yd_roles";
const lsGet = k => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰면 이번 화면에서만 쓴다 */ } };
const lsDel = k => { try { window.localStorage.removeItem(k); } catch { /* 무시 */ } };
function readCachedRoles() {
  try { const r = JSON.parse(lsGet(YD_ROLES_KEY) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
}
const hasAdminRole = roles => roles.includes("staff") || roles.includes("officer");

// 시작할 때 한 번만 주소의 #yd=…&go=… 를 읽어 토큰을 저장하고, 주소에서는 지운다.
// 다른 토큰으로 들어오면 앞 사람의 역할(yd_roles)은 버리고 새로 확인한다.
const PORTAL_GO = (() => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (!hash.includes("yd=")) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const token = p.get("yd");
  if (token) {
    if (lsGet(YD_TOKEN_KEY) !== token) lsDel(YD_ROLES_KEY);
    lsSet(YD_TOKEN_KEY, token);
  }
  try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* 무시 */ }
  return p.get("go");
})();
let portalGoHandled = false;

// ─── 여디디야 통합 디자인 v1.1 ───
// 색·글꼴·모양은 /yd/tokens.css 의 변수(var(--yd-…))와 .yd-… 모양만 쓴다.
// 아이콘은 /yd/icons.js 의 선 아이콘(window.YD_ICONS)을 그대로 그린다. 화면에 이모지를 넣지 않는다.
function Icon({ n, s = 16, c, fill, style }) {
  const paths = (typeof window !== "undefined" && window.YD_ICONS && window.YD_ICONS[n]) || "";
  return <svg className="yd-icon" xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={fill?"currentColor":"none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{color:c,...style}} dangerouslySetInnerHTML={{__html:paths}}/>;
}

// id 는 DB(opinions.category)에 저장되는 값이고 label 은 CSV 내보내기에 그대로 쓰이므로 건드리지 않는다.
// 화면에는 icon + name 으로 그린다. color=글자, solid=채움(선택·막대), bg=옅은 바탕, ring=테두리.
const CATEGORIES = [
  { id: "suggest", label: "💡 사역 제안", name: "사역 제안", icon: "lightbulb", color: "var(--yd-navy-800)", solid: "var(--yd-navy-800)", bg: "var(--yd-navy-100)", ring: "var(--yd-navy-200)" },
  { id: "feedback", label: "📋 건의사항", name: "건의사항", icon: "clipboard", color: "var(--yd-gold-700)", solid: "var(--yd-gold-600)", bg: "var(--yd-gold-50)", ring: "var(--yd-gold-200)" },
  { id: "thanks", label: "💛 감사/격려", name: "감사/격려", icon: "handheart", color: "var(--yd-green-700)", solid: "var(--yd-green-600)", bg: "var(--yd-green-50)", ring: "var(--yd-green-200)" },
  { id: "concern", label: "🤔 고민/상담", name: "고민/상담", icon: "help", color: "var(--yd-blue-600)", solid: "var(--yd-blue-500)", bg: "var(--yd-blue-50)", ring: "var(--yd-blue-200)" },
  { id: "event", label: "🎪 행사 아이디어", name: "행사 아이디어", icon: "party", color: "var(--yd-orange-600)", solid: "var(--yd-orange-600)", bg: "var(--yd-orange-50)", ring: "var(--yd-orange-200)" },
  { id: "other", label: "✏️ 기타", name: "기타", icon: "pencil", color: "var(--yd-gray-600)", solid: "var(--yd-gray-500)", bg: "var(--yd-gray-100)", ring: "var(--yd-gray-200)" },
];
const PRIORITY = [
  { id: "normal", label: "일반", color: "var(--yd-gray-600)", solid: "var(--yd-gray-600)", bg: "var(--yd-gray-100)", ring: "var(--yd-gray-200)" },
  { id: "important", label: "중요", color: "var(--yd-gold-700)", solid: "var(--yd-gold-600)", bg: "var(--yd-gold-100)", ring: "var(--yd-gold-200)" },
  { id: "urgent", label: "긴급", color: "var(--yd-red-700)", solid: "var(--yd-red-600)", bg: "var(--yd-red-50)", ring: "var(--yd-red-200)" },
];
const STATUS_MAP = {
  new: { label: "새 의견", color: "var(--yd-navy-700)", bg: "var(--yd-navy-50)", ring: "var(--yd-navy-200)" },
  read: { label: "확인됨", color: "var(--yd-gray-600)", bg: "var(--yd-gray-100)", ring: "var(--yd-gray-200)" },
  replied: { label: "답변완료", color: "var(--yd-green-700)", bg: "var(--yd-green-50)", ring: "var(--yd-green-200)" },
  archived: { label: "보관됨", color: "var(--yd-gray-500)", bg: "var(--yd-gray-50)", ring: "var(--yd-gray-200)" },
};

// 화면 모양 묶음(색·둥글기·글자 크기만 담는다)
const chip = (o, big) => ({display:"inline-flex",alignItems:"center",gap:4,fontSize:big?11:10.5,fontWeight:600,lineHeight:1.5,padding:big?"3px 10px":"2px 8px",borderRadius:999,background:o.bg,color:o.color,boxShadow:o.ring?`inset 0 0 0 1px ${o.ring}`:"none",whiteSpace:"nowrap"});
const SECRET_CHIP = { color: "var(--yd-wine-700)", bg: "var(--yd-wine-100)" };
const UI = {
  titleRow: {display:"flex",alignItems:"center",gap:10,marginTop:16,marginBottom:20},
  iconBtn: {width:36,height:36,flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:12,background:"#fff",border:"1px solid var(--yd-gray-200)",color:"var(--yd-navy-800)",boxShadow:"var(--yd-shadow-sm)"},
  h2: {fontSize:20,fontWeight:700,fontFamily:"var(--yd-serif)",letterSpacing:"-0.02em",color:"var(--yd-navy-900)"},
  count: {fontSize:13,color:"var(--yd-gray-500)",fontWeight:500},
  label: {fontSize:14,fontWeight:700,color:"var(--yd-gray-900)",marginBottom:10},
  cardTitle: {display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:700,color:"var(--yd-gray-900)",marginBottom:12},
  filter: {display:"inline-flex",alignItems:"center",gap:5,padding:"7px 13px",borderRadius:999,fontSize:12,fontWeight:600,whiteSpace:"nowrap"},
  mini: {display:"inline-flex",alignItems:"center",gap:4,padding:"5px 11px",borderRadius:10,fontSize:11.5,fontWeight:600,background:"#fff"},
  knob: {width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:3,transition:"left .2s",boxShadow:"0 1px 4px rgba(15,36,66,0.25)"},
  empty: {textAlign:"center",padding:40,color:"var(--yd-gray-500)"},
};

// 알림 문구 맨 앞의 기호는 화면에 그릴 때만 선 아이콘으로 바꾼다(문구는 그대로 둔다).
const TOAST_ICONS = { "⚠": "warn", "\u{1F512}": "lock", "✅": "checkcircle", "❌": "xcircle", "✏": "pencil", "\u{1F4AC}": "message", "\u{1F5D1}": "trash", "♻": "undo", "\u{1F513}": "unlock" };
function splitToast(m) {
  const i = m.indexOf(" ");
  const icon = i > 0 ? TOAST_ICONS[m.slice(0, i).replace(/\uFE0F/g, "")] : null;
  return icon ? { icon, text: m.slice(i + 1) } : { icon: null, text: m };
}
function Toast({ msg }) {
  const t = splitToast(msg);
  return (
    <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",display:"flex",alignItems:"center",gap:8,width:"max-content",background:"var(--yd-navy-950)",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:14,fontWeight:500,zIndex:1000,boxShadow:"var(--yd-shadow-xl)",border:"1px solid rgba(255,255,255,0.08)",maxWidth:"90%",textAlign:"center"}} className="su">
      {t.icon&&<Icon n={t.icon} s={16} c={t.icon==="xcircle"?"var(--yd-red-300)":"var(--yd-gold-300)"}/>}
      <span>{t.text}</span>
    </div>
  );
}

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
    <button onClick={onClick} style={{width:"100%",textAlign:"left",background:opinion.secret?"var(--yd-wine-50)":"#fff",borderRadius:16,padding:compact?"14px 16px":"16px 18px",marginBottom:10,border:opinion.secret?"1px solid var(--yd-wine-200)":"1px solid var(--yd-gray-200)",boxShadow:"var(--yd-shadow-sm)",borderLeft:`3px solid ${cat.solid}`,position:"relative",fontFamily:"inherit",color:"var(--yd-gray-900)"}}>
      {opinion.secret&&<div style={{...chip(SECRET_CHIP),position:"absolute",top:8,right:8,fontSize:9.5,fontWeight:700}}><Icon n="lock" s={10}/>비밀글</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6,paddingRight:opinion.secret?60:0}}>
            <span style={chip(cat)}><Icon n={cat.icon} s={11}/>{cat.name}</span>
            <span style={chip(st)}>{st.label}</span>
            {opinion.priority!=="normal"&&pri&&<span style={chip(pri)}>{pri.label}</span>}
          </div>
          <div style={{fontSize:14,fontWeight:600,color:"var(--yd-gray-900)",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:compact?"nowrap":"normal",paddingRight:opinion.secret?60:0}}>{opinion.title}</div>
          {!compact&&<div style={{fontSize:12.5,color:"var(--yd-gray-600)",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{opinion.content}</div>}
        </div>
        {!opinion.secret&&<div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0,marginTop:compact?0:4}}><Icon n="heart" s={13} c="var(--yd-red-500)" fill/><span className="yd-tabular" style={{fontSize:12,fontWeight:600,color:"var(--yd-gray-600)"}}>{opinion.likes}</span></div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:8,fontSize:11,color:"var(--yd-gray-500)"}}>
        <span>{opinion.secret?(isAdmin?<><Icon n="lock" s={12}/> {opinion.author}</>:<><Icon n="lock" s={12}/> 비밀글</>):(opinion.anonymous?<><Icon n="eyeoff" s={12}/> 익명</>:<><Icon n="user" s={12}/> {opinion.author}</>)}</span>
        <div style={{display:"flex",gap:8,alignItems:"center",flex:"none"}}>
          {opinion.reply&&<Icon n="message" s={13} c="var(--yd-green-600)"/>}
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
  const [anim, setAnim] = useState(true);
  const [form, setForm] = useState({category:"",title:"",content:"",author:"",anonymous:true,secret:false,priority:"normal"});
  const [replyText, setReplyText] = useState("");
  const [editingReply, setEditingReply] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [likedIds, setLikedIds] = useState({});
  const [trash, setTrash] = useState([]);
  // 토큰이 없으면 저장된 역할은 쓰지 않는다.
  const [ydToken, setYdToken] = useState(() => lsGet(YD_TOKEN_KEY));
  const [ydRoles, setYdRoles] = useState(() => (lsGet(YD_TOKEN_KEY) ? readCachedRoles() : []));
  const canAdmin = !!ydToken && hasAdminRole(ydRoles);

  // 포털 토큰 확인: 성공하면 역할 저장, 모르는 토큰이면 둘 다 지움, 연결·RPC 오류면 저장된 역할을 그대로 쓴다.
  // go=admin 은 이 확인이 끝난 뒤에 한 번만 처리한다(저장된 역할로 켰다가 다시 끄지 않도록).
  useEffect(() => {
    const token = lsGet(YD_TOKEN_KEY);
    if (!token) return;
    let alive = true;
    (async () => {
      let roles = readCachedRoles();
      let tokenOk = true;
      try {
        const { data, error } = await supabase.rpc("yd_portal_session", { p_token: token });
        if (error) throw error;
        const res = typeof data === "string" ? JSON.parse(data) : data;
        if (res && res.ok === true) {
          roles = Array.isArray(res.roles) ? res.roles : [];
          lsSet(YD_ROLES_KEY, JSON.stringify(roles));
        } else if (res && res.ok === false) {
          roles = []; tokenOk = false;
          lsDel(YD_TOKEN_KEY); lsDel(YD_ROLES_KEY);
        }
      } catch (e) {
        console.warn("yd_portal_session 확인 실패, 저장된 역할을 씁니다:", e?.message || e);
      }
      if (!alive) return;
      if (!tokenOk) setYdToken(null);
      setYdRoles(roles);
      if (PORTAL_GO === "admin" && !portalGoHandled) {
        portalGoHandled = true;
        if (tokenOk && hasAdminRole(roles)) { setIsAdmin(true); notify("🔓 임원진 모드 활성화"); }
      }
    })();
    return () => { alive = false; };
  }, []);

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
    setTimeout(() => { setPage(p); setSelected(o); setAnim(true); setReplyText(""); setShowDel(false); setEditingReply(false); }, 150);
  };
  const notify = m => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // 역할이 더는 임원진을 허락하지 않으면(토큰 거절·역할 바뀜) 임원진 모드를 끄고, 임원진 전용 화면에서는 홈으로 나간다.
  useEffect(() => {
    if (isAdmin && !canAdmin) {
      setIsAdmin(false);
      if (page === "admin" || page === "trash" || (page === "detail" && selected?.secret)) nav("home");
    }
  }, [isAdmin, canAdmin]);

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
    try { await replyOpinion(id, r); await load(); notify(editingReply ? "✏️ 답변이 수정되었습니다" : "💬 답변이 등록되었습니다"); setEditingReply(false); } catch (e) { console.error(e); }
  };
  const doRemoveReply = async (id) => {
    try { await removeReply(id); await load(); notify("답변이 삭제되었습니다"); setEditingReply(false); setReplyText(""); } catch (e) { console.error(e); }
  };
  const doDel = async (id) => {
    try { await deleteOpinion(id); await load(); notify("🗑️ 휴지통으로 이동했습니다"); nav("list"); } catch (e) { console.error(e); }
  };
  const loadTrash = async () => {
    try { const d = await fetchDeletedOpinions(); setTrash(d || []); } catch (e) { console.error(e); }
  };
  const doRestore = async (id) => {
    try { await restoreOpinion(id); await load(); await loadTrash(); notify("♻️ 의견이 복구되었습니다"); } catch (e) { console.error(e); }
  };
  const doPermanentDel = async (id) => {
    try { await permanentDeleteOpinion(id); await loadTrash(); notify("의견이 영구 삭제되었습니다"); } catch (e) { console.error(e); }
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

  const S = { card: { background: "#fff", borderRadius: 20, padding: 16, marginBottom: 12, border: "1px solid var(--yd-gray-200)", boxShadow: "var(--yd-shadow-sm)" } };
  // 제출 버튼의 색만 정한다(누를 수 있는지는 바꾸지 않는다)
  const ready = form.category&&form.title&&form.content&&(!form.secret||form.author);

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"var(--yd-ivory)",gap:16}}>
      <div style={{width:40,height:40,border:"3px solid var(--yd-gray-200)",borderTop:"3px solid var(--yd-navy-600)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:14,color:"var(--yd-gray-500)",fontWeight:500}}>의견함을 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--yd-ivory)"}}>
      {/* Toast */}
      {toast&&<Toast msg={toast}/>}

      {/* Header */}
      <header className="yd-hero" style={{padding:"24px 20px 24px",position:"relative",overflow:"hidden"}}>
        <div aria-hidden="true" style={{position:"absolute",left:0,right:0,bottom:0,height:2,background:"linear-gradient(90deg,#EC2036 0%,rgba(204,168,95,.7) 50%,rgba(204,168,95,0) 100%)"}}/>
        <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:14}}>
              <img src="/yd/brand/church-symbol-light.svg" alt="" width="32" height="28" style={{display:"block",flex:"none"}}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.25,letterSpacing:"-0.02em"}}>대전대흥침례교회</div>
                <div style={{fontSize:11,color:"var(--yd-gold-300)",fontWeight:500,lineHeight:1.3,marginTop:1}}>여디디야 청년부</div>
              </div>
            </div>
            <h1 style={{fontSize:30,lineHeight:1.15,fontWeight:700,color:"#fff",fontFamily:"var(--yd-serif)",letterSpacing:"-0.02em"}}>의견함</h1>
            <div className="yd-gold-rule" style={{width:150,margin:"12px 0 10px"}}/>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.78)"}}>여러분의 목소리가 여디디야를 만들어갑니다</p>
          </div>
          {(canAdmin||isAdmin)&&<button onClick={()=>isAdmin?(setIsAdmin(false),notify("🔒 로그아웃 완료")):(setIsAdmin(true),notify("🔓 임원진 모드 활성화"))} className="yd-btn yd-btn-onhero" style={{flex:"none",gap:6,padding:"8px 12px",borderRadius:12,fontSize:12,fontWeight:600,...(isAdmin?{background:"rgba(201,169,97,0.16)",borderColor:"rgba(220,194,134,0.6)",color:"var(--yd-gold-200)"}:{})}}>
            {isAdmin?<><Icon n="shieldcheck" s={14}/>임원진</>:<><Icon n="lock" s={14}/>로그인</>}
          </button>}
        </div>
      </header>

      {/* Main */}
      <main style={{padding:"16px 16px 100px",maxWidth:480,margin:"0 auto",opacity:anim?1:0,transition:"opacity .15s"}}>

        {/* ═══ HOME ═══ */}
        {page==="home"&&<div className="su">
          <div className="yd-card-navy" style={{display:"grid",gridTemplateColumns:isAdmin?"1fr 1fr 1fr 1fr":"1fr 1fr 1fr",gap:8,padding:12,marginTop:16,marginBottom:20}}>
            {[{v:isAdmin?stats.total:stats.pub,l:"전체 의견",c:"var(--yd-navy-200)"},{v:stats.new_,l:"새 의견",c:"var(--yd-gold-300)"},{v:stats.replied,l:"답변완료",c:"var(--yd-green-200)"},...(isAdmin?[{v:stats.secret,l:"비밀글",c:"var(--yd-wine-300)"}]:[])].map((s,i)=>
              <div key={i} style={{background:"rgba(255,255,255,0.06)",borderRadius:14,padding:"14px 6px 12px",textAlign:"center",border:"1px solid rgba(255,255,255,0.10)"}}>
                <div className="yd-tabular" style={{fontSize:isAdmin?22:26,fontWeight:800,lineHeight:1.2,color:"#fff"}}>{s.v}</div>
                <div style={{fontSize:10.5,color:s.c,fontWeight:600,marginTop:3}}>{s.l}</div>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <button onClick={()=>nav("submit")} className="yd-btn yd-btn-primary" style={{flex:1,padding:"18px 16px",borderRadius:16,fontSize:15,fontWeight:700}}><Icon n="pen" s={18}/>의견 남기기</button>
            <button onClick={()=>{setForm(f=>({...f,secret:true,anonymous:false}));nav("submit");}} className="yd-btn" style={{gap:6,padding:"18px 18px",borderRadius:16,background:"var(--yd-wine-600)",color:"#fff",fontSize:15,fontWeight:700,boxShadow:"var(--yd-shadow-md)"}}><Icon n="lock" s={17}/>비밀글</button>
          </div>
          <div style={{background:"var(--yd-gold-50)",borderRadius:16,padding:16,marginBottom:20,border:"1px solid var(--yd-gold-200)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:700,color:"var(--yd-gold-800)",marginBottom:8}}><span className="yd-headicon" style={{background:"#fff"}}><Icon n="inbox" s={15}/></span>여디디야 의견함 안내</div>
            <div style={{fontSize:12.5,color:"var(--yd-gold-900)",lineHeight:1.7}}>사역 제안, 건의사항, 감사, 고민 상담 등 자유롭게 의견을 남겨주세요. <strong style={{whiteSpace:"nowrap"}}><Icon n="lock" s={12}/> 비밀글</strong>은 임원진만 확인 가능하며 <strong>실명 작성</strong>이 필요합니다.</div>
          </div>
          {pubOps.length>0?<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h2 style={{display:"flex",alignItems:"center",gap:8,fontSize:17,fontWeight:700,fontFamily:"var(--yd-serif)",letterSpacing:"-0.02em",color:"var(--yd-navy-900)"}}><span className="yd-bar"/>최근 의견</h2>
              <button onClick={()=>nav("list")} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:12,color:"var(--yd-navy-600)",fontWeight:600,background:"none",padding:"4px 8px"}}>전체보기<Icon n="arrowright" s={13}/></button>
            </div>
            {pubOps.slice(0,3).map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} compact isAdmin={isAdmin}/>)}
          </>:<div style={UI.empty}><div style={{marginBottom:12,color:"var(--yd-gray-300)"}}><Icon n="inbox" s={48}/></div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>아직 의견이 없습니다</div><div style={{fontSize:13}}>첫 번째 의견을 남겨보세요!</div></div>}
        </div>}

        {/* ═══ SUBMIT ═══ */}
        {page==="submit"&&<div className="su">
          <div style={UI.titleRow}>
            <button onClick={()=>{setForm({category:"",title:"",content:"",author:"",anonymous:true,secret:false,priority:"normal"});nav("home");}} aria-label="뒤로" style={UI.iconBtn}><Icon n="arrowleft" s={18}/></button>
            <h2 style={UI.h2}>의견 남기기</h2>
          </div>
          {/* Secret toggle */}
          <div style={{...S.card,background:form.secret?"var(--yd-wine-50)":"#fff",border:form.secret?"1.5px solid var(--yd-wine-200)":"1px solid var(--yd-gray-200)",transition:"all .3s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div><div style={{display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:700,color:form.secret?"var(--yd-wine-700)":"var(--yd-gray-900)"}}>{form.secret?<><Icon n="lock" s={15}/>비밀글 모드</>:<><Icon n="megaphone" s={15}/>공개글 모드</>}</div><div style={{fontSize:11.5,color:form.secret?"var(--yd-wine-800)":"var(--yd-gray-500)",marginTop:2}}>{form.secret?"임원진만 확인 가능 · 실명 작성 필수":"전체 공개됩니다"}</div></div>
              <button onClick={()=>{const ns=!form.secret;setForm({...form,secret:ns,anonymous:ns?false:form.anonymous});}} style={{width:52,height:28,flex:"none",borderRadius:14,position:"relative",background:form.secret?"var(--yd-wine-600)":"var(--yd-gray-300)",transition:"background .2s"}}><div style={{...UI.knob,left:form.secret?27:3}}/></button>
            </div>
            {form.secret&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,0.7)",borderRadius:12}}><div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,color:"var(--yd-wine-800)",marginBottom:6}}><Icon n="pencil" s={13}/>실명 작성 (임원진에게만 공개)</div><input className="yd-input" value={form.author} onChange={e=>setForm({...form,author:e.target.value})} placeholder="이름을 입력해주세요 (필수)" style={{fontSize:14,borderColor:"var(--yd-wine-200)"}}/></div>}
          </div>
          {/* Anonymous (public only) */}
          {!form.secret&&<div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div><div style={{display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:700,color:"var(--yd-gray-900)"}}>{form.anonymous?<><Icon n="eyeoff" s={15}/>익명으로 제출</>:<><Icon n="user" s={15}/>실명으로 제출</>}</div><div style={{fontSize:11.5,color:"var(--yd-gray-500)",marginTop:2}}>{form.anonymous?"이름이 공개되지 않습니다":"이름이 함께 표시됩니다"}</div></div>
              <button onClick={()=>setForm({...form,anonymous:!form.anonymous})} style={{width:52,height:28,flex:"none",borderRadius:14,position:"relative",background:form.anonymous?"var(--yd-navy-600)":"var(--yd-gray-300)",transition:"background .2s"}}><div style={{...UI.knob,left:form.anonymous?27:3}}/></button>
            </div>
            {!form.anonymous&&<input className="yd-input" value={form.author} onChange={e=>setForm({...form,author:e.target.value})} placeholder="이름을 입력해주세요" style={{marginTop:12,fontSize:14}}/>}
          </div>}
          {/* Category */}
          <div style={S.card}><div style={UI.label}>카테고리 선택</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setForm({...form,category:c.id})} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 13px",borderRadius:12,fontSize:12.5,fontWeight:600,background:form.category===c.id?c.solid:c.bg,color:form.category===c.id?"#fff":c.color,boxShadow:form.category===c.id?"var(--yd-shadow-sm)":`inset 0 0 0 1px ${c.ring}`,transition:"all .2s"}}><Icon n={c.icon} s={14}/>{c.name}</button>)}</div></div>
          {/* Priority */}
          <div style={S.card}><div style={UI.label}>중요도</div><div style={{display:"flex",gap:8}}>{PRIORITY.map(p=><button key={p.id} onClick={()=>setForm({...form,priority:p.id})} style={{flex:1,padding:10,borderRadius:12,fontSize:13,fontWeight:600,background:form.priority===p.id?p.solid:"var(--yd-gray-100)",color:form.priority===p.id?"#fff":"var(--yd-gray-600)"}}>{p.label}</button>)}</div></div>
          {/* Title & Content */}
          <div style={S.card}>
            <input className="yd-input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="제목을 입력해주세요" maxLength={100} style={{fontSize:15,fontWeight:600,marginBottom:10}}/>
            <div style={{position:"relative"}}><textarea className="yd-input" value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder={form.secret?"비밀 의견을 자유롭게 작성해주세요...\n(임원진만 확인 가능합니다)":"의견을 자유롭게 작성해주세요..."} maxLength={1000} rows={6} style={{fontSize:14,lineHeight:1.6}}/><div className="yd-tabular" style={{position:"absolute",bottom:8,right:12,fontSize:11,color:"var(--yd-gray-400)"}}>{form.content.length}/1000</div></div>
          </div>
          <button onClick={doSubmit} disabled={submitting} style={{width:"100%",padding:16,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:submitting?"var(--yd-gray-400)":ready?(form.secret?"var(--yd-wine-600)":"var(--yd-navy-600)"):"var(--yd-gray-200)",color:(submitting||ready)?"#fff":"var(--yd-gray-500)",fontSize:16,fontWeight:700,boxShadow:(!submitting&&ready)?"var(--yd-shadow-md)":"none",opacity:submitting?0.7:1}}>{submitting?"제출 중...":(form.secret?<><Icon n="lock" s={17}/>비밀글 제출하기</>:<><Icon n="send" s={17}/>의견 제출하기</>)}</button>
        </div>}

        {/* ═══ LIST ═══ */}
        {page==="list"&&<div className="su">
          <div style={{...UI.titleRow,marginBottom:16}}>
            <button onClick={()=>nav("home")} aria-label="뒤로" style={UI.iconBtn}><Icon n="arrowleft" s={18}/></button>
            <h2 style={UI.h2}>전체 의견</h2>
            <span style={UI.count}>{filtered.length}건</span>
            {/* Refresh */}
            <button onClick={load} style={{...UI.iconBtn,marginLeft:"auto"}} title="새로고침" aria-label="새로고침"><Icon n="refresh" s={17}/></button>
          </div>
          {isAdmin&&<div style={{display:"flex",gap:6,marginBottom:10}}>{[{id:"all",l:"전체",i:"list",c:"var(--yd-navy-900)"},{id:"public",l:"공개글",i:"megaphone",c:"var(--yd-blue-600)"},{id:"secret",l:"비밀글",i:"lock",c:"var(--yd-wine-600)"}].map(v=><button key={v.id} onClick={()=>setFilterVis(v.id)} style={{...UI.filter,background:filterVis===v.id?v.c:"var(--yd-gray-100)",color:filterVis===v.id?"#fff":"var(--yd-gray-600)"}}><Icon n={v.i} s={13}/>{v.l}</button>)}</div>}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}}>
            <button onClick={()=>setFilterCat("all")} style={{...UI.filter,background:filterCat==="all"?"var(--yd-navy-900)":"var(--yd-gray-100)",color:filterCat==="all"?"#fff":"var(--yd-gray-600)",flexShrink:0}}>전체</button>
            {CATEGORIES.map(c=><button key={c.id} onClick={()=>setFilterCat(c.id)} style={{...UI.filter,background:filterCat===c.id?c.solid:c.bg,color:filterCat===c.id?"#fff":c.color,boxShadow:filterCat===c.id?"none":`inset 0 0 0 1px ${c.ring}`,flexShrink:0}}><Icon n={c.icon} s={13}/>{c.name}</button>)}
          </div>
          {filtered.length===0?<div style={UI.empty}><div style={{marginBottom:12,color:"var(--yd-gray-300)"}}><Icon n="inbox" s={40}/></div><div style={{fontSize:14,fontWeight:500}}>해당하는 의견이 없습니다</div></div>:filtered.map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} isAdmin={isAdmin}/>)}
        </div>}

        {/* ═══ DETAIL ═══ */}
        {page==="detail"&&selected&&<div className="su">
          <div style={{...UI.titleRow,marginBottom:16}}>
            <button onClick={()=>nav("list")} aria-label="뒤로" style={UI.iconBtn}><Icon n="arrowleft" s={18}/></button>
            <h2 style={UI.h2}>의견 상세</h2>
          </div>
          {(()=>{const cat=CATEGORIES.find(c=>c.id===selected.category)||CATEGORIES[5];const st=STATUS_MAP[selected.status]||STATUS_MAP.new;return(<>
            <div style={{background:selected.secret?"var(--yd-wine-50)":"#fff",borderRadius:20,padding:20,marginBottom:16,border:selected.secret?"1px solid var(--yd-wine-200)":"1px solid var(--yd-gray-200)",boxShadow:"var(--yd-shadow-md)",borderTop:`4px solid ${selected.secret?"var(--yd-wine-600)":cat.solid}`}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {selected.secret&&<span style={{...chip(SECRET_CHIP,true),fontWeight:700}}><Icon n="lock" s={11}/>비밀글</span>}
                <span style={chip(cat,true)}><Icon n={cat.icon} s={12}/>{cat.name}</span>
                <span style={chip(st,true)}>{st.label}</span>
                {selected.priority!=="normal"&&<span style={chip(PRIORITY.find(p=>p.id===selected.priority)||{},true)}>{PRIORITY.find(p=>p.id===selected.priority)?.label}</span>}
              </div>
              <h3 style={{fontSize:18,fontWeight:700,color:"var(--yd-gray-900)",marginBottom:12,lineHeight:1.4}}>{selected.title}</h3>
              <p style={{fontSize:14,color:"var(--yd-gray-700)",lineHeight:1.7,marginBottom:16,whiteSpace:"pre-wrap"}}>{selected.content}</p>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,paddingTop:12,borderTop:selected.secret?"1px solid var(--yd-wine-100)":"1px solid var(--yd-gray-100)"}}>
                <div style={{fontSize:12,color:"var(--yd-gray-500)"}}>{selected.secret?(isAdmin?<><Icon n="lock" s={13}/> {selected.author} (비밀글)</>:<><Icon n="lock" s={13}/> 비밀글</>):(selected.anonymous?<><Icon n="eyeoff" s={13}/> 익명</>:<><Icon n="user" s={13}/> {selected.author}</>)} · {fmtDate(selected.created_at)}</div>
                {!selected.secret&&<button onClick={()=>doLike(selected.id)} className="yd-tabular" style={{display:"flex",alignItems:"center",gap:6,flex:"none",padding:"8px 14px",borderRadius:12,background:likedIds[selected.id]?"var(--yd-red-100)":"var(--yd-red-50)",boxShadow:"inset 0 0 0 1px var(--yd-red-200)",fontSize:13,fontWeight:700,color:"var(--yd-red-600)",opacity:likedIds[selected.id]?0.6:1}}><Icon n="heart" s={15} c="var(--yd-red-500)" fill/>{selected.likes}</button>}
              </div>
            </div>
            {/* Reply display */}
            {selected.reply&&<div style={{background:"var(--yd-green-50)",borderRadius:16,padding:16,marginBottom:16,border:"1px solid var(--yd-green-200)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:28,height:28,flex:"none",borderRadius:8,background:"var(--yd-green-600)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="message" s={15}/></div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:"var(--yd-green-700)"}}>임원진</div><div className="yd-tabular" style={{fontSize:10.5,color:"var(--yd-green-600)"}}>{selected.reply_date||""}</div></div>
                {isAdmin&&!editingReply&&<div style={{display:"flex",gap:6,flex:"none"}}>
                  <button onClick={()=>{setEditingReply(true);setReplyText(selected.reply);}} style={{...UI.mini,color:"var(--yd-green-700)",border:"1px solid var(--yd-green-200)"}}><Icon n="pencil" s={12}/>수정</button>
                  <button onClick={()=>doRemoveReply(selected.id)} style={{...UI.mini,color:"var(--yd-red-700)",border:"1px solid var(--yd-red-200)"}}>삭제</button>
                </div>}
              </div>
              {!editingReply?<div style={{fontSize:13.5,color:"var(--yd-gray-800)",lineHeight:1.7,paddingLeft:36,whiteSpace:"pre-wrap"}}>{selected.reply}</div>
              :<div style={{marginTop:4}}>
                <textarea className="yd-input" value={replyText} onChange={e=>setReplyText(e.target.value)} rows={3} style={{fontSize:13,lineHeight:1.5,marginBottom:8,borderColor:"var(--yd-green-200)"}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{if(replyText.trim())doReply(selected.id,replyText);}} style={{padding:"8px 16px",borderRadius:12,background:replyText.trim()?"var(--yd-green-600)":"var(--yd-gray-300)",color:"#fff",fontSize:13,fontWeight:600}}>수정 완료</button>
                  <button onClick={()=>{setEditingReply(false);setReplyText("");}} style={{padding:"8px 16px",borderRadius:12,background:"var(--yd-gray-100)",color:"var(--yd-gray-600)",fontSize:13,fontWeight:500}}>취소</button>
                </div>
              </div>}
            </div>}
            {/* Admin tools */}
            {isAdmin&&<div style={S.card}>
              <div style={UI.cardTitle}><span className="yd-headicon"><Icon n="settings" s={15}/></span>임원진 관리</div>
              {selected.secret&&<div style={{background:"var(--yd-wine-50)",borderRadius:12,padding:12,marginBottom:12,border:"1px solid var(--yd-wine-200)"}}><div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,color:"var(--yd-wine-800)",marginBottom:4}}><Icon n="lock" s={12}/>비밀글 작성자</div><div style={{fontSize:14,fontWeight:700,color:"var(--yd-wine-600)"}}>{selected.author}</div></div>}
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>{Object.entries(STATUS_MAP).map(([k,v])=><button key={k} onClick={()=>doStatus(selected.id,k)} style={{padding:"6px 12px",borderRadius:999,fontSize:11.5,fontWeight:600,background:selected.status===k?v.color:v.bg,color:selected.status===k?"#fff":v.color,boxShadow:selected.status===k?"none":`inset 0 0 0 1px ${v.ring}`}}>{v.label}</button>)}</div>
              {!selected.reply&&<><div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,color:"var(--yd-gray-600)",marginBottom:6}}><Icon n="message" s={13}/>임원진 답변 작성</div><textarea className="yd-input" value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="답변을 작성해주세요..." rows={3} style={{fontSize:13,lineHeight:1.5,marginBottom:8}}/><button onClick={()=>{if(replyText.trim()){doReply(selected.id,replyText);setReplyText("");}}} style={{padding:"10px 16px",borderRadius:12,background:replyText.trim()?"var(--yd-green-600)":"var(--yd-gray-300)",color:"#fff",fontSize:13,fontWeight:600}}>임원진 답변 등록</button></>}
              <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid var(--yd-gray-100)"}}>
                {!showDel?<button onClick={()=>setShowDel(true)} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:600,background:"var(--yd-red-50)",color:"var(--yd-red-700)",border:"1px solid var(--yd-red-200)"}}><Icon n="trash" s={13}/>휴지통으로 이동</button>
                :<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:12,color:"var(--yd-red-700)",fontWeight:600}}>휴지통으로 옮기시겠습니까?</span><button onClick={()=>doDel(selected.id)} style={{padding:"6px 14px",borderRadius:10,fontSize:12,fontWeight:600,background:"var(--yd-red-600)",color:"#fff"}}>이동</button><button onClick={()=>setShowDel(false)} style={{padding:"6px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:"var(--yd-gray-100)",color:"var(--yd-gray-600)"}}>취소</button></div>}
                <div style={{fontSize:11,color:"var(--yd-gray-500)",marginTop:8}}>* 삭제해도 휴지통에서 복구할 수 있습니다</div>
              </div>
            </div>}
          </>);})()}
        </div>}

        {/* ═══ ADMIN ═══ */}
        {page==="admin"&&isAdmin&&<div className="su">
          <div style={UI.titleRow}>
            <button onClick={()=>nav("home")} aria-label="뒤로" style={UI.iconBtn}><Icon n="arrowleft" s={18}/></button>
            <h2 style={UI.h2}>임원진 대시보드</h2>
            <button onClick={load} style={{...UI.iconBtn,marginLeft:"auto"}} aria-label="새로고침"><Icon n="refresh" s={17}/></button>
          </div>
          <div className="yd-card-navy" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:12,marginBottom:16}}>
            {[{l:"전체",v:stats.total,i:"messages",c:"var(--yd-navy-200)"},{l:"미확인",v:stats.new_,i:"bell",c:"var(--yd-gold-300)"},{l:"답변완료",v:stats.replied,i:"checkcircle",c:"var(--yd-green-200)"},{l:"공개글",v:stats.pub,i:"megaphone",c:"var(--yd-blue-200)"},{l:"비밀글",v:stats.secret,i:"lock",c:"var(--yd-wine-300)"},{l:"좋아요",v:opinions.reduce((a,o)=>a+o.likes,0),i:"heart",c:"var(--yd-red-300)"}].map((s,i)=>
              <div key={i} style={{background:"rgba(255,255,255,0.06)",borderRadius:14,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.10)"}}><div style={{marginBottom:4,color:s.c,lineHeight:1}}><Icon n={s.i} s={18}/></div><div className="yd-tabular" style={{fontSize:22,fontWeight:800,lineHeight:1.2,color:"#fff"}}>{s.v}</div><div style={{fontSize:10.5,color:"rgba(255,255,255,0.72)",marginTop:1}}>{s.l}</div></div>
            )}
          </div>
          <button onClick={()=>exportToExcel(opinions)} className="yd-btn yd-btn-ok" style={{width:"100%",padding:14,marginBottom:12,fontSize:14,fontWeight:700,boxShadow:"var(--yd-shadow-md)"}}><Icon n="download" s={17}/>엑셀(CSV) 다운로드</button>
          <button onClick={()=>{loadTrash();nav("trash");}} className="yd-btn yd-btn-ghost" style={{width:"100%",padding:14,marginBottom:16,fontSize:14,fontWeight:700}}><Icon n="trash" s={17}/>휴지통 (삭제된 의견 복구)</button>
          {/* Category chart */}
          <div style={{...S.card,marginBottom:16}}><div style={UI.cardTitle}><span className="yd-headicon navy"><Icon n="chart" s={15}/></span>카테고리별 현황</div>
            {CATEGORIES.map(c=>{const cnt=opinions.filter(o=>o.category===c.id).length;const mx=Math.max(...CATEGORIES.map(cc=>opinions.filter(o=>o.category===cc.id).length),1);return(
              <div key={c.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:4}}><span style={{display:"inline-flex",alignItems:"center",gap:6,fontWeight:500,color:"var(--yd-gray-700)"}}><Icon n={c.icon} s={13} c={c.color}/>{c.name}</span><span className="yd-tabular" style={{fontWeight:700,color:c.color}}>{cnt}건</span></div><div style={{height:8,background:"var(--yd-gray-100)",borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${cnt?((cnt/mx)*100):0}%`,background:c.solid,borderRadius:999,transition:"width .5s"}}/></div></div>
            );})}
          </div>
          {/* Secret posts */}
          <div style={{...S.card,border:"1px solid var(--yd-wine-200)",marginBottom:16}}><div style={{...UI.cardTitle,color:"var(--yd-wine-700)"}}><span className="yd-headicon wine"><Icon n="lock" s={15}/></span>비밀글 목록</div>
            {opinions.filter(o=>o.secret).length===0?<div style={{textAlign:"center",padding:16,color:"var(--yd-gray-500)",fontSize:13}}>비밀글이 없습니다</div>
            :opinions.filter(o=>o.secret).map(o=><div key={o.id} onClick={()=>nav("detail",o)} style={{padding:12,background:"var(--yd-wine-50)",borderRadius:12,marginBottom:8,border:"1px solid var(--yd-wine-200)",cursor:"pointer"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:"var(--yd-gray-900)"}}>{o.title}</div><div style={{fontSize:11,color:"var(--yd-wine-800)",marginTop:2}}>작성자: <strong>{o.author}</strong> · {fmtDate(o.created_at)}</div></div><span style={{...chip(STATUS_MAP[o.status]||STATUS_MAP.new),flex:"none"}}>{(STATUS_MAP[o.status]||STATUS_MAP.new).label}</span></div></div>)}
          </div>
          {/* Pending */}
          <div style={S.card}><div style={UI.cardTitle}><span className="yd-headicon"><Icon n="bell" s={15}/></span>미확인 의견</div>
            {opinions.filter(o=>o.status==="new").length===0?<div style={{textAlign:"center",padding:16,color:"var(--yd-gray-500)",fontSize:13}}><Icon n="checkcircle" s={14} c="var(--yd-green-600)"/> 모든 의견을 확인했습니다</div>
            :opinions.filter(o=>o.status==="new").map(o=><OpinionCard key={o.id} opinion={o} onClick={()=>nav("detail",o)} compact isAdmin={isAdmin}/>)}
          </div>
        </div>}

        {/* ═══ TRASH ═══ */}
        {page==="trash"&&isAdmin&&<div className="su">
          <div style={{...UI.titleRow,marginBottom:16}}>
            <button onClick={()=>nav("admin")} aria-label="뒤로" style={UI.iconBtn}><Icon n="arrowleft" s={18}/></button>
            <h2 style={{...UI.h2,display:"flex",alignItems:"center",gap:6}}><Icon n="trash" s={19}/>휴지통</h2>
            <span style={UI.count}>{trash.length}건</span>
            <button onClick={loadTrash} style={{...UI.iconBtn,marginLeft:"auto"}} aria-label="새로고침"><Icon n="refresh" s={17}/></button>
          </div>
          <div style={{background:"var(--yd-gold-50)",borderRadius:14,padding:14,marginBottom:16,border:"1px solid var(--yd-gold-200)"}}>
            <div style={{fontSize:12.5,color:"var(--yd-gold-900)",lineHeight:1.6}}>삭제된 의견이 보관되는 공간입니다. <strong>복구</strong>하면 다시 목록에 표시되고, <strong>영구 삭제</strong>하면 완전히 사라집니다.</div>
          </div>
          {trash.length===0?<div style={UI.empty}><div style={{marginBottom:12,color:"var(--yd-gray-300)"}}><Icon n="trash" s={48}/></div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>휴지통이 비어 있습니다</div><div style={{fontSize:13}}>삭제된 의견이 없습니다</div></div>
          :trash.map(o=>{const cat=CATEGORIES.find(c=>c.id===o.category)||CATEGORIES[5];return(
            <div key={o.id} style={{background:"#fff",borderRadius:16,padding:"16px 18px",marginBottom:10,border:"1px solid var(--yd-gray-200)",boxShadow:"var(--yd-shadow-sm)",borderLeft:`3px solid ${cat.solid}`,opacity:0.85}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {o.secret&&<span style={{...chip(SECRET_CHIP),fontWeight:700}}><Icon n="lock" s={10}/>비밀글</span>}
                <span style={chip(cat)}><Icon n={cat.icon} s={11}/>{cat.name}</span>
              </div>
              <div style={{fontSize:14,fontWeight:600,color:"var(--yd-gray-900)",marginBottom:4}}>{o.title}</div>
              <div style={{fontSize:12.5,color:"var(--yd-gray-600)",lineHeight:1.5,marginBottom:8,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{o.content}</div>
              <div style={{fontSize:11,color:"var(--yd-gray-500)",marginBottom:10}}>
                {o.secret?<><Icon n="lock" s={12}/> {o.author}</>:(o.anonymous?<><Icon n="eyeoff" s={12}/> 익명</>:<><Icon n="user" s={12}/> {o.author}</>)} · 작성 {fmtDate(o.created_at)} · 삭제 {fmtDate(o.deleted_at)}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>doRestore(o.id)} className="yd-btn yd-btn-primary" style={{flex:1,gap:6,padding:"10px",borderRadius:12,fontSize:13}}><Icon n="undo" s={14}/>복구하기</button>
                <button onClick={()=>{if(window.confirm("정말 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다."))doPermanentDel(o.id);}} className="yd-btn yd-btn-danger" style={{padding:"10px 16px",borderRadius:12,fontSize:13}}>영구 삭제</button>
              </div>
            </div>
          );})}
        </div>}
      </main>

      {/* Nav */}
      <nav className="yd-tabbar" style={{zIndex:100}}>
        {[{id:"home",icon:"home",label:"홈"},{id:"submit",icon:"pen",label:"의견쓰기"},{id:"list",icon:"list",label:"전체보기"},...(isAdmin?[{id:"admin",icon:"settings",label:"관리"}]:[])].map(t=>
          <button key={t.id} onClick={()=>nav(t.id)} className={page===t.id?"yd-tab on":"yd-tab"}>
            <Icon n={t.icon} s={22}/>
            <span>{t.label}</span>
          </button>
        )}
      </nav>
    </div>
  );
}
