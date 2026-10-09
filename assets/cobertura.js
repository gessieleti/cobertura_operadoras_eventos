const CAPITAIS=[["Rio Branco",-9.97,-67.81],["Maceió",-9.65,-35.73],["Macapá",0.03,-51.07],["Manaus",-3.12,-60.02],["Salvador",-12.97,-38.5],["Fortaleza",-3.73,-38.52],["Brasília",-15.79,-47.88],["Vitória",-20.32,-40.34],["Goiânia",-16.68,-49.25],["São Luís",-2.53,-44.3],["Cuiabá",-15.6,-56.1],["Campo Grande",-20.44,-54.65],["Belo Horizonte",-19.92,-43.94],["Belém",-1.46,-48.5],["João Pessoa",-7.12,-34.86],["Curitiba",-25.43,-49.27],["Recife",-8.05,-34.88],["Teresina",-5.09,-42.8],["Rio de Janeiro",-22.91,-43.17],["Natal",-5.79,-35.21],["Porto Alegre",-30.03,-51.23],["Porto Velho",-8.76,-63.9],["Boa Vista",2.82,-60.67],["Florianópolis",-27.6,-48.55],["São Paulo",-23.55,-46.63],["Aracaju",-10.91,-37.07],["Palmas",-10.18,-48.33]];
const TECHS=[{k:"5G",c:"--t5g",r:5},{k:"4G+",c:"--t4gp",r:4},{k:"4G",c:"--t4g",r:3},{k:"3G",c:"--t3g",r:2},{k:"2G",c:"--t2g",r:1}];
const TECH=Object.fromEntries(TECHS.map(t=>[t.k,t]));
const OPS=[{k:"Vivo",c:"#8E3FC0"},{k:"Claro",c:"#D52B1E"},{k:"TIM",c:"#1C4FA0"},{k:"Oi",c:"#D9A000"},{k:"Algar",c:"#00968F"},{k:"Brisanet",c:"#E8650A"},{k:"Unifique",c:"#0A7BC2"},{k:"Sercomtel",c:"#2E9E4F"},{k:"Outra",c:"#7A8791"}];
const OP=Object.fromEntries(OPS.map(o=>[o.k,o]));
const STATUS={bom:"Funcionou bem",instavel:"Instável",ruim:"Não funcionou"};
const PTS={bom:100,instavel:50,ruim:0};

const CFG=window.COB_CFG||{};
const S={locais:new Map(),eventos:[],sel:null,mode:"home",form:null,draft:null,fTech:"",fOp:"",canWrite:false,dbState:"loading",uid:null};

/* ---------- API PHP ---------- */
async function api(rota,corpo,params){
  const url=CFG.api+"?r="+encodeURIComponent(rota)+(params?"&"+new URLSearchParams(params):"");
  const opt=corpo?{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":CFG.csrf},body:JSON.stringify(corpo)}:{};
  opt.credentials="same-origin";
  let r,j=null;
  try{r=await fetch(url,opt)}catch(e){const x=new Error("rede");x.code="rede";throw x}
  try{j=await r.json()}catch(e){}
  if(!r.ok){const x=new Error(j&&j.erro||"erro");x.code=j&&j.codigo||("http_"+r.status);x.msg=j&&j.erro;throw x}
  return j;
}
async function carregar(){
  try{
    const d=await api("dados");
    S.locais=new Map(d.locais.map(l=>[l.id,l]));S.eventos=d.eventos;S.uid=d.usuario;S.canWrite=!!d.podeEditar;S.dbState="ready";
  }catch(e){console.error(e);S.dbState=e.code==="sem_sessao"?"off":"error"}
  $("#addBtn").hidden=!S.canWrite;
  if(S.sel&&!S.locais.has(S.sel)){S.sel=null;if(S.mode==="local")S.mode="home"}
  if(S.mode==="form")renderPins();else renderAll();
}
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmtD=d=>{if(!d)return"";const [y,m,dd]=String(d).split("-").map(Number);try{return new Date(y,m-1,dd).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}catch(e){return d}};
function fmtP(e){
  const a=e.data,b=e.dataFim;if(!b||b===a)return fmtD(a);
  const [y1,m1]=String(a).split("-"),[y2,m2]=String(b).split("-");
  const p=s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,m-1,d)};
  try{
    if(y1===y2&&m1===m2)return p(a).getDate().toString().padStart(2,"0")+" a "+fmtD(b);
    if(y1===y2)return p(a).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})+" a "+fmtD(b);
  }catch(x){}
  return fmtD(a)+" a "+fmtD(b);
}
function diasP(e){if(!e.dataFim||e.dataFim===e.data)return 1;const p=s=>{const [y,m,d]=String(s).split("-").map(Number);return Date.UTC(y,m-1,d)};return Math.round((p(e.dataFim)-p(e.data))/864e5)+1}
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const opDot=k=>'<span class="dot" style="--c:'+(OP[k]||OP.Outra).c+'"></span>';
const techChip=(k,small)=>{const t=TECH[k];return t?'<span class="chip" style="--c:var('+t.c+')'+(small?';font-size:13px;padding:1px 6px':'')+'">'+t.k+'</span>':""};

/* ---------- map ---------- */
const map=L.map("map",{minZoom:3,maxZoom:18}).setView([-14.5,-52],4);
map.zoomControl.setPosition("bottomleft");
map.attributionControl.setPrefix(false).addAttribution("Limites estaduais: IBGE via Code for America · Antenas: Anatel, ERBs abr/2026");
const states=L.geoJSON(window.BR_ESTADOS,{style:()=>({color:cssv("--land-line"),weight:1,fillColor:cssv("--land"),fillOpacity:1}),onEachFeature:(f,l)=>l.bindTooltip(f.properties.n,{sticky:true,direction:"top",opacity:.9})}).addTo(map);
L.layerGroup(CAPITAIS.map(([n,la,lo])=>L.marker([la,lo],{interactive:false,keyboard:false,icon:L.divIcon({className:"",html:'<div class="cap">'+esc(n)+'</div>',iconSize:[0,0]})}))).addTo(map);
const pins=L.layerGroup().addTo(map);
/* ---------- antenas Anatel ---------- */
const ERB={ready:false,show:true,n:0};
const TBIT=[{b:8,k:"5G",c:"--t5g"},{b:4,k:"4G",c:"--t4g"},{b:2,k:"3G",c:"--t3g"},{b:1,k:"2G",c:"--t2g"}];
const gkey=(la,lo)=>(Math.floor(la*10)+1000)*4000+(Math.floor(lo*10)+2000);
const merc=la=>Math.log(Math.tan(Math.PI/4+la*Math.PI/360));
function erbOp(i){return ERB.ops[ERB.m[i]&15]}
function erbPass(i){
  const tb=ERB.m[i]>>4;
  if(S.fTech){const need={"5G":8,"4G+":4,"4G":4,"3G":2,"2G":1}[S.fTech];if(!(tb&need))return false}
  if(S.fOp){const o=erbOp(i);if(S.fOp==="Outra"?!!OP[o]:o!==S.fOp)return false}
  return true;
}
const ErbLayer=L.Layer.extend({
  onAdd(m){this._c=L.DomUtil.create("canvas","erb-canvas");this._c.style.position="absolute";(m.getPane("erbPane")||m.createPane("erbPane")).appendChild(this._c);m.getPane("erbPane").style.zIndex=450;m.getPane("erbPane").style.pointerEvents="none";m.on("moveend zoomend resize viewreset",this.redraw,this);m.on("zoomstart",this._hide,this);this.redraw()},
  onRemove(m){this._c.remove();m.off("moveend zoomend resize viewreset",this.redraw,this);m.off("zoomstart",this._hide,this)},
  _hide(){this._c.style.opacity=0},
  redraw(){
    const m=this._map;if(!m)return;const c=this._c,sz=m.getSize(),dpr=window.devicePixelRatio||1;
    L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));
    c.width=sz.x*dpr;c.height=sz.y*dpr;c.style.width=sz.x+"px";c.style.height=sz.y+"px";c.style.opacity=1;
    if(!ERB.ready||!ERB.show)return;
    const ctx=c.getContext("2d");ctx.scale(dpr,dpr);
    const b=m.getBounds(),W=b.getWest(),E=b.getEast(),N=merc(b.getNorth()),Sm=merc(b.getSouth());
    const kx=sz.x/(E-W),ky=sz.y/(N-Sm),z=m.getZoom();
    const r=z<6?1:z<8?1.4:z<10?2:z<12?3:z<14?4:5;
    ctx.globalAlpha=z<8?.55:z<11?.75:.95;
    const paths=TBIT.map(()=>new Path2D()),rest=new Path2D();
    const big=z>=10,ring=z>=14;
    for(let i=0;i<ERB.n;i++){
      const lo=ERB.lng[i];if(lo<W||lo>E)continue;const y=(N-ERB.my[i])*ky;if(y<-6||y>sz.y+6)continue;
      if((S.fTech||S.fOp)&&!erbPass(i))continue;
      const x=(lo-W)*kx,tb=ERB.m[i]>>4;
      const j=tb&8?0:tb&4?1:tb&2?2:tb&1?3:-1;const p=j<0?rest:paths[j];
      if(big){p.moveTo(x+r,y);p.arc(x,y,r,0,6.2832)}else p.rect(x-r,y-r,r*2,r*2);
    }
    const draw=(p,col)=>{ctx.fillStyle=col;ctx.fill(p);if(ring){ctx.lineWidth=1;ctx.strokeStyle=cssv("--panel");ctx.stroke(p)}};
    draw(rest,cssv("--t2g"));for(let j=3;j>=0;j--)draw(paths[j],cssv(TBIT[j].c));
  }
});
const erbLayer=new ErbLayer().addTo(map);
async function loadErb(){
  try{
    const resp=await fetch(CFG.erb,{credentials:"same-origin"});if(!resp.ok)throw new Error("erb "+resp.status);
    const bin=new Uint8Array(await resp.arrayBuffer());
    // Se o servidor já entregou descompactado (Content-Encoding), o arquivo não começa com a assinatura gzip.
    const txt=bin[0]===0x1f&&bin[1]===0x8b?await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text():new TextDecoder().decode(bin);
    const o=JSON.parse(txt);const n=o.lo.length;
    ERB.lat=new Float64Array(n);ERB.lng=new Float64Array(n);ERB.my=new Float64Array(n);ERB.m=Uint8Array.from(o.m);ERB.c=o.c;ERB.a=o.a;ERB.num=o.n;ERB.ops=o.ops;ERB.cities=o.cities;ERB.grid=new Map();
    let acc=0;for(let i=0;i<n;i++){acc+=o.la[i];const la=acc/1e5,lo=o.lo[i]/1e5;ERB.lat[i]=la;ERB.lng[i]=lo;ERB.my[i]=merc(la);const k=gkey(la,lo);let g=ERB.grid.get(k);if(!g)ERB.grid.set(k,g=[]);g.push(i)}
    ERB.n=n;ERB.ready=true;$("#erbLbl").textContent="Antenas";erbLayer.redraw();
    if(S.mode==="local"||S.mode==="home")renderPanel();
  }catch(e){console.error(e);ERB.error=true;$("#erbLbl").textContent="Antenas indisponíveis";$("#erbBtn").disabled=true}
}
const distM=(a,b,c,d)=>{const R=6371000,toR=Math.PI/180,dl=(c-a)*toR,dg=(d-b)*toR,h=Math.sin(dl/2)**2+Math.cos(a*toR)*Math.cos(c*toR)*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
function erbAround(la,lo,ring){const out=[];const fl=Math.floor(la*10),fg=Math.floor(lo*10);for(let a=-ring;a<=ring;a++)for(let b=-ring;b<=ring;b++){const g=ERB.grid.get((fl+a+1000)*4000+(fg+b+2000));if(g)for(const i of g)out.push(i)}return out}
function nearbyErb(la,lo,maxM){
  const res={},cand=erbAround(la,lo,1);let nearest=null;
  for(const i of cand){const d=distM(la,lo,ERB.lat[i],ERB.lng[i]);if(!nearest||d<nearest.d)nearest={i,d};if(d>maxM)continue;
    const o=erbOp(i);const r=res[o]||(res[o]={k:o,n:0,tb:0,min:Infinity});r.n++;r.tb|=ERB.m[i]>>4;if(d<r.min)r.min=d}
  return {ops:Object.values(res).sort((a,b)=>b.n-a.n),nearest};
}
const fmtDist=d=>d<1000?Math.round(d/10)*10+" m":(d/1000).toFixed(1).replace(".",",")+" km";
const techMini=tb=>TBIT.filter(t=>tb&t.b).map(t=>'<span class="minichip" style="--c:var('+t.c+')">'+t.k+'</span>').join("");
function erbPopup(i,latlng){
  const ci=ERB.cities[ERB.c[i]]||["",""];
  L.popup({maxWidth:260}).setLatLng(latlng||[ERB.lat[i],ERB.lng[i]]).setContent('<div class="pop"><b>'+opDot(erbOp(i))+' '+esc(erbOp(i))+'</b><div class="ad">'+esc(ERB.a[i]||"Endereço não informado")+'<br>'+esc(ci[0])+' – '+esc(ci[1])+'</div><div class="chips" style="gap:4px">'+techMini(ERB.m[i]>>4)+'</div><div class="mt">Estação '+esc(ERB.num[i])+' · Anatel, abr/2026</div></div>').openOn(map);
}
function erbAt(pt){
  if(!ERB.ready||!ERB.show||map.getZoom()<8)return -1;
  const ll=map.containerPointToLatLng(pt);let best=-1,bd=12*12;
  for(const i of erbAround(ll.lat,ll.lng,1)){if((S.fTech||S.fOp)&&!erbPass(i))continue;const p=map.latLngToContainerPoint([ERB.lat[i],ERB.lng[i]]);const d=(p.x-pt.x)**2+(p.y-pt.y)**2;if(d<bd){bd=d;best=i}}
  return best;
}

map.fitBounds(states.getBounds(),{padding:[20,20]});
try{new ResizeObserver(()=>map.invalidateSize()).observe($("#map"))}catch(e){}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>states.setStyle({color:cssv("--land-line"),fillColor:cssv("--land")}));
let draftMarker=null;
map.on("click",e=>{
  if(S.mode!=="form"){const i=erbAt(e.containerPoint);if(i>=0)erbPopup(i);return}
  const sel=$("#fLocal");if(sel&&sel.value!=="novo"){sel.value="novo";onLocalChange()}
  setDraft(+e.latlng.lat.toFixed(6),+e.latlng.lng.toFixed(6),"Posição marcada no mapa. Arraste o pin para ajustar.");
});
function setDraft(lat,lng,msg,noRedraw){
  S.draft={lat,lng};
  const la=$("#fLat"),lo=$("#fLng");if(la&&document.activeElement!==la){la.value=isFinite(lat)?lat:""}if(lo&&document.activeElement!==lo){lo.value=isFinite(lng)?lng:""}
  const m=$("#geoMsg");if(m&&msg)m.textContent=msg+(isFinite(lat)?" ("+lat.toFixed(5)+", "+lng.toFixed(5)+")":"");
  if(!noRedraw)drawDraft();
}
function parseCoords(s){
  s=String(s||"").trim();if(!s)return null;
  let m=s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)||s.match(/[?&](?:q|ll|query|mlat)=(-?\d+\.\d+)(?:,|%2C|&mlon=)(-?\d+\.\d+)/i)||s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(!m)return null;const lat=parseFloat(m[1]),lng=parseFloat(m[2]);
  return (isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)?{lat,lng}:null;
}
function drawDraft(){
  if(draftMarker){draftMarker.remove();draftMarker=null}
  if(S.mode==="form"&&$("#fLocal")?.value==="novo"&&S.draft&&isFinite(S.draft.lat)&&isFinite(S.draft.lng))
    {draftMarker=L.marker([S.draft.lat,S.draft.lng],{draggable:true,autoPan:true,zIndexOffset:2000,icon:L.divIcon({className:"",iconSize:[0,0],html:'<div class="pin draft"><span class="nm">'+esc(($("#fLocNome")?.value||"").trim()||"Novo local")+'</span></div>'})}).addTo(map);
     draftMarker.on("dragend",()=>{const p=draftMarker.getLatLng();setDraft(+p.lat.toFixed(6),+p.lng.toFixed(6),"Posição ajustada no mapa.")});}
}
function setPlacing(on){$("#app").classList.toggle("placing",on);if(!on){S.draft=null;drawDraft()}}

/* ---------- derived ---------- */
const evsOf=id=>S.eventos.filter(e=>e.localId===id);
function rankOf(evs){
  const ops={};
  for(const e of evs)for(const r of (e.resultados||[])){
    if(!r||!r.operadora)continue;
    const o=ops[r.operadora]||(ops[r.operadora]={k:r.operadora,n:0,pts:0,bom:0,instavel:0,ruim:0,techs:new Set()});
    o.n++;o.pts+=PTS[r.status]??50;if(o[r.status]!=null)o[r.status]++;if(r.tecnologia)o.techs.add(r.tecnologia);
  }
  return Object.values(ops).map(o=>({...o,score:Math.round(o.pts/o.n)})).sort((a,b)=>b.score-a.score||b.n-a.n);
}
function statsOf(l){
  const evs=evsOf(l.id);const techs=new Set();
  evs.forEach(e=>(e.resultados||[]).forEach(r=>{if(r.tecnologia&&r.status!=="ruim")techs.add(r.tecnologia)}));
  const best=TECHS.find(t=>techs.has(t.k))||null;
  const last=evs[0];const alert=!!last&&(last.resultados||[]).some(r=>r.status==="ruim");
  return {evs,techs,best,alert,rank:rankOf(evs)};
}

/* ---------- pins ---------- */
function renderPins(){
  pins.clearLayers();
  for(const l of S.locais.values()){
    if(!isFinite(l.lat)||!isFinite(l.lng))continue;
    const st=statsOf(l);
    const rs=st.evs.flatMap(e=>e.resultados||[]);
    if(S.fTech&&!rs.some(r=>r.tecnologia===S.fTech))continue;
    if(S.fOp&&!rs.some(r=>r.operadora===S.fOp))continue;
    const t=st.best,r=t?t.r:0;
    const bars='<span class="bars" aria-hidden="true">'+[1,2,3,4,5].map(i=>'<i style="height:'+(2+i*1.8)+'px;opacity:'+(i<=r?1:.35)+'"></i>').join("")+'</span>';
    const html='<div class="pin '+(t?"":"none")+(S.sel===l.id?" sel":"")+'" style="'+(t?"--c:var("+t.c+")":"")+'"><span class="tg">'+bars+(t?t.k:"—")+'</span><span class="nm">'+esc(l.nome)+'</span><span class="count" title="'+st.evs.length+(st.evs.length===1?' evento':' eventos')+'">'+st.evs.length+'</span>'+(st.alert?'<span class="alert" title="Alguma operadora não funcionou no evento mais recente"></span>':"")+'</div>';
    const m=L.marker([l.lat,l.lng],{title:l.nome,riseOnHover:true,zIndexOffset:S.sel===l.id?1000:0,icon:L.divIcon({className:"",iconSize:[0,0],html})});
    m.on("click",()=>{if(S.mode==="form")return pickLocal(l.id);select(l.id)});
    pins.addLayer(m);
  }
}
function pickLocal(id){const s=$("#fLocal");if(s){s.value=id;onLocalChange()}}
function select(id,fly){
  S.sel=id;S.mode="local";S.form=null;setPlacing(false);
  const l=S.locais.get(id);if(l&&fly)map.flyTo([l.lat,l.lng],Math.max(map.getZoom(),11),{duration:.6});
  renderAll();
}

/* ---------- panel ---------- */
function renderPanel(){
  const p=$("#panel");
  if(S.mode==="form")return renderForm(p);
  const l=S.sel&&S.locais.get(S.sel);
  if(S.mode==="local"&&l)return renderLocal(p,l);
  S.mode="home";S.sel=null;renderHome(p);
}
function banner(){
  if(S.dbState==="off")return '<div class="banner">Sua sessão expirou. <a href="'+esc(CFG.login||"/")+'">Entre de novo no Portal</a> para ver os eventos.</div>';
  if(S.dbState==="error")return '<div class="banner">Não foi possível carregar os eventos. Recarregue a página para tentar de novo.</div>';
  if(S.dbState==="loading")return '<p class="muted">Carregando eventos…</p>';
  return "";
}
function rankHtml(rank,emptyMsg){
  if(!rank.length)return '<p class="muted" style="margin:0">'+emptyMsg+'</p>';
  return '<ol class="rank">'+rank.map((o,i)=>{const c=(OP[o.k]||OP.Outra).c;
    const parts=[o.n+(o.n===1?" uso":" usos")];if(o.bom)parts.push("funcionou bem "+o.bom+"×");if(o.instavel)parts.push("instável "+o.instavel+"×");if(o.ruim)parts.push("não funcionou "+o.ruim+"×");
    if(o.techs.size)parts.push([...o.techs].sort((x,y)=>(TECH[y]?.r||0)-(TECH[x]?.r||0)).join(", "));
    return '<li class="'+(i===0&&rank.length>1&&o.score>rank[1].score?"best":"")+'"><span class="name">'+opDot(o.k)+esc(o.k)+'</span><span class="score">'+o.score+'</span><span class="meter"><b style="width:'+o.score+'%;--c:'+c+'"></b></span><span class="meta">'+parts.join(" · ")+'</span></li>'}).join("")+
  '</ol><p class="muted" style="margin:10px 0 0">Nota de 0 a 100: funcionou bem vale 100, instável vale 50, não funcionou vale 0.</p>';
}
function renderHome(p){
  const nRes=S.eventos.reduce((s,e)=>s+(e.resultados||[]).length,0);
  const recent=S.eventos.slice(0,12);
  p.innerHTML='<div class="p-head"><h2>Visão geral</h2><div class="sub">Cada pin é um local. Clique para ver os eventos de lá, qual operadora funciona melhor e quais redes pegam.</div></div><div class="p-body">'+banner()+
  '<section><div class="stats"><div class="stat"><b>'+S.eventos.length+'</b><span>eventos</span></div><div class="stat"><b>'+S.locais.size+'</b><span>locais</span></div><div class="stat"><b>'+nRes+'</b><span>avaliações de operadora</span></div></div></section>'+
  '<section><h3>Operadoras em todos os eventos</h3>'+rankHtml(rankOf(S.eventos),"As notas aparecem depois do primeiro evento registrado.")+'</section>'+
  '<section><h3>Eventos recentes</h3>'+(recent.length?'<ul class="alist recent">'+recent.map(e=>{const l=S.locais.get(e.localId);const rs=e.resultados||[];
     return '<li><button data-go="'+esc(e.localId)+'"><span><span class="n">'+esc(e.nome)+'</span><br><span class="l">'+esc(fmtP(e))+(l?" · "+esc(l.nome):"")+'</span></span><span style="display:flex;gap:3px">'+rs.slice(0,5).map(r=>'<span class="dot" title="'+esc(r.operadora+": "+(STATUS[r.status]||""))+'" style="--c:'+(r.status==="bom"?"var(--t4g)":r.status==="ruim"?"var(--bad)":"var(--t3g)")+'"></span>').join("")+'</span></button></li>'}).join("")+'</ul>'
    :(S.dbState==="ready"?'<div class="empty">Nenhum evento registrado ainda. '+(S.canWrite?'Use <b>Registrar evento</b>, marque o local no mapa e informe como cada operadora se saiu.':'Quem tem permissão de edição pode registrar o primeiro.')+'</div>':""))+'</section>'+
  '<section><h3>Como ler o mapa</h3><div class="legend"><div>Cada pin mostra a melhor rede que funcionou, o nome do local e o número de eventos.</div>'+'<div class="chips">'+TECHS.map(t=>techChip(t.k)).join("")+'</div>'+'<div><span class="chip off">—</span> nenhuma rede funcionou ou não foi informada</div><div style="margin-top:6px">Os pontos pequenos são as antenas da Anatel (abr/2026), coloridos pela rede mais avançada que oferecem. Aproxime o mapa e clique em um ponto para ver a operadora e o endereço.</div><div><span class="dot" style="--c:var(--bad);width:12px;height:12px"></span> alguma operadora falhou no evento mais recente</div></div></section></div>';
  p.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>select(b.dataset.go,true));
}
function evCard(e){
  const rs=e.resultados||[];
  return '<li class="evc"><div class="top"><span class="nm">'+esc(e.nome)+'</span><span class="dt">'+esc(fmtP(e))+(diasP(e)>1?' · '+diasP(e)+' dias':'')+'</span></div>'+
  (e.descricao?'<div class="desc">'+esc(e.descricao)+'</div>':"")+
  '<ul class="res">'+rs.map(r=>'<li><span>'+opDot(r.operadora)+'</span><span><b>'+esc(r.operadora)+'</b> '+techChip(r.tecnologia,1)+'</span><span class="st '+esc(r.status)+'">'+esc(STATUS[r.status]||"")+'</span>'+(r.obs?'<span class="obs">'+esc(r.obs)+'</span>':"")+'</li>').join("")+'</ul>'+
  (S.canWrite?'<div class="tools"><button class="btn ghost small" data-edit="'+esc(e.id)+'">Editar</button><button class="btn danger small" data-del="'+esc(e.id)+'">Excluir</button></div>':"")+'</li>';
}
function nearHtml(l){
  if(ERB.error)return "";
  if(!ERB.ready)return '<section><h3>Antenas a até 1 km</h3><p class="muted" style="margin:0">Carregando antenas da Anatel…</p></section>';
  const nb=nearbyErb(l.lat,l.lng,1000);const tot=nb.ops.reduce((s,o)=>s+o.n,0);
  let body;
  if(!nb.ops.length)body='<p class="muted" style="margin:0">Nenhuma antena registrada a até 1 km.'+(nb.nearest?' A mais próxima fica a '+fmtDist(nb.nearest.d)+' ('+esc(erbOp(nb.nearest.i))+').':'')+'</p>';
  else body='<ul class="near">'+nb.ops.map(o=>'<li>'+opDot(o.k)+'<span class="nm">'+esc(o.k)+'</span><span class="meta">'+o.n+(o.n===1?' antena':' antenas')+' · mais perto a '+fmtDist(o.min)+' '+techMini(o.tb)+'</span></li>').join("")+'</ul>';
  return '<section><h3>Antenas a até 1 km <small>'+tot+'</small></h3>'+body+'<p class="muted" style="margin:10px 0 0">Fonte: Anatel, ERBs abr/2026. Mostra as redes que cada antena oferece, não a qualidade do sinal.</p></section>';
}
function renderLocal(p,l){
  const st=statsOf(l);
  const osm="https://www.openstreetmap.org/?mlat="+l.lat+"&mlon="+l.lng+"#map=16/"+l.lat+"/"+l.lng;
  p.innerHTML='<div class="p-head"><button class="btn ghost small close" id="back">Fechar</button><h2 style="padding-right:64px">'+esc(l.nome)+'</h2>'+(l.endereco?'<div class="sub">'+esc(l.endereco)+'</div>':"")+'<div class="muted">'+l.lat.toFixed(5)+', '+l.lng.toFixed(5)+' · <a href="'+osm+'" target="_blank" rel="noopener">Ver ruas no OpenStreetMap</a></div></div>'+
  '<div class="p-body"><section><h3>Redes que funcionaram aqui</h3><div class="chips">'+TECHS.map(t=>'<span class="chip '+(st.techs.has(t.k)?"":"off")+'" style="--c:var('+t.c+')">'+t.k+'</span>').join("")+'</div></section>'+
  '<section><h3>Qual operadora é melhor aqui</h3>'+rankHtml(st.rank,"Nenhuma operadora avaliada neste local ainda.")+'</section>'+nearHtml(l)+
  '<section><h3>Eventos <small>'+st.evs.length+'</small></h3>'+(S.canWrite?'<button class="btn primary" id="newHere" style="width:100%;margin-bottom:12px">Registrar evento neste local</button>':"")+
  (st.evs.length?'<ul class="events">'+st.evs.map(evCard).join("")+'</ul>':'<div class="empty">Nenhum evento neste local.</div>')+'</section>'+
  (S.canWrite?'<section><button class="btn danger small" id="delL">Excluir local'+(st.evs.length?' e seus '+st.evs.length+' eventos':'')+'</button></section>':"")+'</div>';
  $("#back").onclick=()=>{S.sel=null;S.mode="home";renderAll()};
  const nh=$("#newHere");if(nh)nh.onclick=()=>openForm(null,l.id);
  p.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openForm(b.dataset.edit));
  p.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>confirmBtn(b,"Confirmar exclusão",async()=>{await api("evento_excluir",{id:b.dataset.del});await carregar()}));
  const dl=$("#delL");if(dl)dl.onclick=()=>confirmBtn(dl,"Clique de novo para excluir",async()=>{await api("local_excluir",{id:l.id});S.sel=null;S.mode="home";await carregar()});
}
async function confirmBtn(b,msg,fn){
  if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent=msg;return}
  b.disabled=true;try{await fn()}catch(e){b.disabled=false;b.textContent=dbErr(e)}
}

/* ---------- form ---------- */
let rowSeq=0;
function openForm(editId,localId){
  const ev=editId?S.eventos.find(e=>e.id===editId):null;
  S.form={id:editId||null,back:S.sel,data:ev?JSON.parse(JSON.stringify(ev)):{nome:"",data:today(),dataFim:today(),localId:localId||"",descricao:"",resultados:[{operadora:"Vivo",tecnologia:"4G",status:"bom",obs:""}]}};
  S.mode="form";S.draft=null;setPlacing(!S.form.data.localId);renderAll();
}
function rowHtml(r){
  const id="r"+(rowSeq++);
  return '<div class="oprow" data-row="'+id+'"><div class="row"><label>Operadora<select data-f="operadora">'+OPS.map(o=>'<option'+(o.k===r.operadora?" selected":"")+'>'+o.k+'</option>').join("")+'</select></label>'+
  '<label>Rede usada<select data-f="tecnologia">'+TECHS.map(t=>'<option'+(t.k===r.tecnologia?" selected":"")+'>'+t.k+'</option>').join("")+'</select></label>'+
  '<button type="button" class="btn ghost small" data-rm aria-label="Remover operadora">Remover</button></div>'+
  '<div class="seg" role="radiogroup" aria-label="Resultado">'+Object.entries(STATUS).map(([k,v])=>'<label><input type="radio" name="st_'+id+'" value="'+k+'"'+(r.status===k?" checked":"")+'><span>'+v+'</span></label>').join("")+'</div>'+
  '<input data-f="obs" maxlength="200" placeholder="Observação (opcional): ex. sem dados na entrada" value="'+esc(r.obs||"")+'"></div>';
}
function renderForm(p){
  const f=S.form,d=f.data;
  const locs=[...S.locais.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  p.innerHTML='<div class="p-head"><h2>'+(f.id?"Editar evento":"Registrar evento")+'</h2><div class="sub">Informe onde foi, quais operadoras foram usadas e se funcionaram.</div></div><div class="p-body"><section><form id="evForm" novalidate>'+
  '<label>Evento<input name="nome" maxlength="100" placeholder="Ex.: Show no estádio, feira, queda geral no centro" value="'+esc(d.nome)+'"></label>'+
  '<div class="row"><label>Início<input name="data" type="date" value="'+esc(d.data)+'"></label><label>Fim<input name="dataFim" type="date" value="'+esc(d.dataFim||d.data)+'" min="'+esc(d.data)+'"></label></div>'+
  '<div class="fbox" style="display:grid;gap:10px"><label>Local<select id="fLocal"><option value="novo">Novo local</option>'+locs.map(l=>'<option value="'+esc(l.id)+'"'+(l.id===d.localId?" selected":"")+'>'+esc(l.nome)+'</option>').join("")+'</select></label>'+
  '<div id="novoBox" style="display:grid;gap:10px"><label>Nome do local<input id="fLocNome" maxlength="100" placeholder="Ex.: Allianz Parque"></label>'+
  '<div><div class="lbl">Posição</div><div class="seg" role="radiogroup" aria-label="Como informar a posição"><label><input type="radio" name="posmode" value="end" checked><span>Endereço</span></label><label><input type="radio" name="posmode" value="coord"><span>Latitude e longitude</span></label></div></div>'+
  '<div id="endBox"><label for="fEnd">Endereço</label><div style="display:flex;gap:6px;margin-top:4px"><input id="fEnd" maxlength="200" placeholder="Ex.: Av. Francisco Matarazzo, 1705, São Paulo – SP"><button type="button" class="btn" id="fGeo">Localizar</button></div></div>'+
  '<div id="coordBox" hidden><div class="row"><label>Latitude<input id="fLat" inputmode="decimal" placeholder="-23.5275"></label><label>Longitude<input id="fLng" inputmode="decimal" placeholder="-46.6784"></label></div><p class="muted" style="margin:6px 0 0">Também dá para colar no campo de latitude o par completo (-23.5275, -46.6784) ou um link do Google Maps.</p></div>'+
  '<p class="muted" id="geoMsg" style="margin:0" aria-live="polite">Você também pode clicar no mapa ou em um pin existente.</p></div></div>'+
  '<div><div class="lbl">Operadoras usadas</div><div id="rows" style="display:grid;gap:8px">'+(d.resultados||[]).map(rowHtml).join("")+'</div><button type="button" class="btn small" id="addRow" style="margin-top:8px">Adicionar operadora</button></div>'+
  '<label>Descrição <span class="opt">opcional</span><textarea name="descricao" maxlength="1000" placeholder="O que aconteceu, horário de pico, quantas pessoas…">'+esc(d.descricao||"")+'</textarea></label>'+
  '<div class="err" id="fErr"></div><div class="actions"><button type="button" class="btn ghost" id="fCancel">Cancelar</button><button class="btn primary" type="submit" id="fSave">'+(f.id?"Salvar alterações":"Salvar evento")+'</button></div></form></section></div>';
  onLocalChange();
  $("#fLocal").onchange=onLocalChange;
  const di=p.querySelector("[name=data]"),df=p.querySelector("[name=dataFim]");
  di.onchange=()=>{df.min=di.value;if(!df.value||df.value<di.value)df.value=di.value};
  const sync=()=>{const p=parseCoords($("#fLat").value);if(p){$("#fLat").value=p.lat;$("#fLng").value=p.lng;setDraft(p.lat,p.lng,"Coordenadas reconhecidas.");return}
    setDraft(parseFloat($("#fLat").value.replace(",",".")),parseFloat($("#fLng").value.replace(",",".")),"",false)};
  $("#fLat").oninput=sync;$("#fLng").oninput=sync;
  $("#fLocNome").oninput=()=>drawDraft();
  document.querySelectorAll("[name=posmode]").forEach(r=>r.onchange=()=>{const c=r.value==="coord"&&r.checked;if(!r.checked)return;$("#coordBox").hidden=r.value!=="coord";$("#endBox").hidden=r.value==="coord"});
  $("#fGeo").onclick=geocode;
  $("#fEnd").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();geocode()}};
  $("#rows").onclick=e=>{const b=e.target.closest("[data-rm]");if(b)b.closest(".oprow").remove()};
  $("#addRow").onclick=()=>{const used=[...document.querySelectorAll('[data-f=operadora]')].map(s=>s.value);const next=OPS.find(o=>!used.includes(o.k))||OPS[0];$("#rows").insertAdjacentHTML("beforeend",rowHtml({operadora:next.k,tecnologia:"4G",status:"bom"}))};
  $("#fCancel").onclick=()=>{const back=S.form.back;S.form=null;setPlacing(false);if(back&&S.locais.has(back))select(back);else{S.mode="home";renderAll()}};
  p.querySelector("[name=nome]").focus();
  $("#evForm").onsubmit=saveForm;
}
async function geocode(){
  const end=$("#fEnd").value.trim(),msg=$("#geoMsg"),btn=$("#fGeo");
  if(!end){msg.textContent="Digite o endereço para localizar.";return}
  const pc=parseCoords(end);if(pc){setDraft(pc.lat,pc.lng,"Coordenadas reconhecidas.");map.flyTo([pc.lat,pc.lng],15,{duration:.6});return}
  btn.disabled=true;btn.textContent="Localizando…";msg.textContent="Procurando o endereço…";
  try{
    const r=(await api("geocode",null,{q:end})).resultado;
    if(!r){msg.textContent="Endereço não encontrado. Tente incluir cidade e estado, ou clique no mapa.";return}
    const lat=+r?.lat,lng=+r?.lng;
    if(!isFinite(lat)||!isFinite(lng)||r.lat===null){msg.textContent="Endereço não encontrado. Tente incluir cidade e estado, ou clique no mapa.";return}
    const prec={endereco:"no número",rua:"na rua",bairro:"no bairro",cidade:"na cidade"}[r.precisao]||"";
    setDraft(+lat.toFixed(6),+lng.toFixed(6),"Encontrado: "+(r.encontrado||end)+". A posição é aproximada"+(prec?" ("+prec+")":"")+"; confira o pin e arraste para ajustar.");
    map.flyTo([lat,lng],r.precisao==="cidade"?12:15,{duration:.6});
  }catch(e){
    msg.textContent=e&&e.msg||"Não foi possível localizar agora. Use latitude e longitude ou clique no mapa.";
  }finally{btn.disabled=false;btn.textContent="Localizar"}
}
function onLocalChange(){
  const v=$("#fLocal").value,novo=v==="novo";
  $("#novoBox").style.display=novo?"grid":"none";setPlacing(novo);
  
  drawDraft();
  if(!novo){const l=S.locais.get(v);if(l)map.panTo([l.lat,l.lng])}
}
async function saveForm(ev){
  ev.preventDefault();const err=$("#fErr");const fd=new FormData(ev.target);
  const nome=String(fd.get("nome")||"").trim(),data=fd.get("data"),dataFim=fd.get("dataFim")||data;
  if(!nome){err.textContent="Dê um nome para o evento.";return}
  if(!data){err.textContent="Informe a data de início do evento.";return}
  if(dataFim<data){err.textContent="A data de fim não pode ser anterior à data de início.";return}
  let localId=$("#fLocal").value;let novoLocal=null;
  if(localId==="novo"){
    const ln=$("#fLocNome").value.trim(),lat=S.draft?.lat,lng=S.draft?.lng;
    if(!ln){err.textContent="Dê um nome para o novo local.";return}
    if(!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){err.textContent="Defina a posição do local: localize o endereço, informe latitude e longitude ou clique no mapa.";return}
    novoLocal={nome:ln,endereco:$("#fEnd").value.trim().slice(0,200),lat,lng};
  }
  const resultados=[...document.querySelectorAll("#rows .oprow")].map(r=>({operadora:r.querySelector("[data-f=operadora]").value,tecnologia:r.querySelector("[data-f=tecnologia]").value,status:(r.querySelector("input[type=radio]:checked")||{}).value||"",obs:r.querySelector("[data-f=obs]").value.trim().slice(0,200)}));
  if(!resultados.length){err.textContent="Adicione pelo menos uma operadora.";return}
  if(resultados.some(r=>!r.status)){err.textContent="Marque se cada operadora funcionou bem, ficou instável ou não funcionou.";return}
  const btn=$("#fSave");btn.disabled=true;btn.textContent="Salvando…";err.textContent="";
  try{
    const doc={id:S.form.id,nome,data,dataFim,localId:novoLocal?null:localId,novoLocal,descricao:String(fd.get("descricao")||"").trim().slice(0,1000),resultados};
    const r=await api("evento_salvar",doc);
    S.form=null;setPlacing(false);await carregar();select(r.localId,true);
  }catch(e){console.error(e);btn.disabled=false;btn.textContent=S.form&&S.form.id?"Salvar alterações":"Salvar evento";err.textContent=dbErr(e)}
}
function dbErr(e){
  const c=e&&e.code;
  if(c==="sem_permissao"){S.canWrite=false;$("#addBtn").hidden=true}
  if(c==="rede")return "Não foi possível salvar. Verifique a conexão e tente de novo.";
  return e&&e.msg||"Não foi possível salvar. Verifique a conexão e tente de novo.";
}
function renderAll(){renderPins();renderPanel()}

/* ---------- toolbar ---------- */
TECHS.forEach(t=>$("#fTech").insertAdjacentHTML("beforeend",'<option value="'+t.k+'">Com '+t.k+'</option>'));
OPS.forEach(o=>$("#fOp").insertAdjacentHTML("beforeend",'<option value="'+o.k+'">'+o.k+'</option>'));
$("#fTech").onchange=e=>{S.fTech=e.target.value;renderPins();erbLayer.redraw()};
$("#fOp").onchange=e=>{S.fOp=e.target.value;renderPins();erbLayer.redraw()};
$("#erbBtn").onclick=()=>{ERB.show=!ERB.show;$("#erbBtn").setAttribute("aria-pressed",ERB.show);map.closePopup();erbLayer.redraw()};
$("#addBtn").onclick=()=>openForm(null,S.mode==="local"?S.sel:"");
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&S.mode==="form")$("#fCancel")?.click()});
renderAll();
setTimeout(loadErb,30);

/* ---------- data ---------- */
carregar();
