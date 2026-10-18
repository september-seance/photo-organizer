"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Leaf, Folder, FolderOpen, FileImage, Images, Play, Eye, Check, CheckCircle2, AlertTriangle, MousePointerClick,
  Monitor, Terminal, X, Minus, Square, ChevronRight, ChevronDown, Home, HardDrive, Clock, Wifi, Volume2, Search,
  Plus, Trash2, Pencil, Save, Download, Copy, RotateCcw, Sparkles, ShieldCheck, Undo2, FolderInput, GripVertical,
  BookOpen, FlaskConical, Layers, History, Scale, FileDown, ArrowRight, ArrowLeft, Ban, BadgeCheck, CircleHelp,
  SlidersHorizontal, Camera, Store, Wallet, Timer, Lock, Unlock, Lightbulb
} from "lucide-react";
import { classifyBatch, classifyOne, DEFAULT_CATEGORIES, SAMPLE_BOSE, SAMPLE_MIXED, THUMB_POOL, type Classified } from "@/lib/classifier";
import { testImageCategories, type CategoryGuess } from "@/lib/clip-image-test";
import { readPackageText, type OcrResult } from "@/lib/browser-ocr";

type Section = { id:number; slug:string; num:string; title:string; kicker:string; groupLabel:string; body:string; bullets:string; status:string; sortOrder:number };
type Cat = { id:number; name:string; groupLabel:string; isDefault:boolean; isActive:boolean };
type Decision = { id:number; title:string; context:string; decision:string; status:string; createdAt:string };
type Batch = { id:number; name:string; sourceLabel:string; destLabel:string; threshold:number; total:number; folders:number; status:string; createdAt:string };
type PhotoRow = { id:number; batchId:number; originalName:string; category:string; brand:string; folderName:string; newName:string; confidence:number; method:string; thumb:string };
type View = "doc"|"try"|"categories"|"runs"|"decisions"|"export";
type PhotoAnalysis = {
  ocrText: string;
  ocrQuality: number;
  rotation: 0 | 180;
  ocrCategory: string | null;
  ocrError: string;
  groups: CategoryGuess[];
  items: CategoryGuess[];
  clipError: string;
};

const HERO_IMGS = [
  { src:"https://images.pexels.com/photos/33797659/pexels-photo-33797659.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", label:"earbuds_03.jpg", folder:"Bose QC Ultra Earbuds" },
  { src:"https://images.pexels.com/photos/7857497/pexels-photo-7857497.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", label:"IMG_7719.jpg", folder:"Nike Shoes" },
  { src:"https://images.pexels.com/photos/26559664/pexels-photo-26559664.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", label:"phone_flatlay.jpg", folder:"Samsung Galaxy Phone" },
];

function fmtDate(s:string){ try{ return new Date(s).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}catch{return ""} }
function statusPill(s:string){
  if(s==="locked") return <span className="inline-flex items-center gap-1 rounded-full bg-[#E3EFD3] text-[#3E5C31] px-2 py-0.5 text-[11px] font-semibold"><Lock size={11}/> LOCKED</span>;
  if(s==="decision") return <span className="inline-flex items-center gap-1 rounded-full bg-[#FBE8C8] text-[#8A5A12] px-2 py-0.5 text-[11px] font-semibold"><CircleHelp size={11}/> NEEDS DECISION</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#E9E6DD] text-[#6B6F62] px-2 py-0.5 text-[11px] font-semibold"><Pencil size={11}/> DRAFT</span>;
}

function getFusionSummary(analysis:PhotoAnalysis):string{
  const category=analysis.ocrCategory;
  if(!category) return analysis.items[0]
    ? `CLIP suggests ${analysis.items[0].category}; keep it in Needs Review until checked.`
    : "No clear OCR or CLIP category; keep it in Needs Review.";
  const display=category[0].toUpperCase()+category.slice(1);
  const itemRank=analysis.items.findIndex(item=>item.category===category);
  if(itemRank>=0) return `OCR suggests ${display}; CLIP also lists it among its item guesses. Review before accepting.`;
  const group=DEFAULT_CATEGORIES.find(item=>item.name===category)?.group;
  const groupRank=group?analysis.groups.findIndex(item=>item.category.toLowerCase()===group.toLowerCase()):-1;
  if(groupRank>=0) return `OCR suggests ${display}; CLIP supports the broader ${group} group, but not the exact item. Review before accepting.`;
  return `OCR suggests ${display}, but CLIP does not corroborate it. Keep it in Needs Review until checked.`;
}

export default function SnapSortApp(){
  const [view,setView]=useState<View>("doc");
  const [sections,setSections]=useState<Section[]>([]);
  const [cats,setCats]=useState<Cat[]>([]);
  const [decisions,setDecisions]=useState<Decision[]>([]);
  const [batches,setBatches]=useState<Batch[]>([]);
  const [photosByBatch,setPhotosByBatch]=useState<Record<number,PhotoRow[]>>({});
  const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  const [toast,setToast]=useState("");
  const [openSection,setOpenSection]=useState<string>("one-line-identity");
  const [editingId,setEditingId]=useState<number|null>(null);
  const [editBody,setEditBody]=useState(""); const [editBullets,setEditBullets]=useState(""); const [editStatus,setEditStatus]=useState("draft");
  const [groupFilter,setGroupFilter]=useState("All");
  // prototype
  const [filenames,setFilenames]=useState<string[]>(SAMPLE_BOSE);
  const [selectedFiles,setSelectedFiles]=useState<File[]>([]);
  const [previewUrls,setPreviewUrls]=useState<string[]>([]);
  const [isDragging,setIsDragging]=useState(false);
  const [analysisStatus,setAnalysisStatus]=useState<"idle"|"working"|"done">("idle");
  const [analysesByPhoto,setAnalysesByPhoto]=useState<Record<number,PhotoAnalysis>>({});
  const [analysisProgress,setAnalysisProgress]=useState(0);
  const [batchName,setBatchName]=useState("Founding batch — Bose earbuds & friends");
  const [sourceLabel,setSourceLabel]=useState("~/Pictures/To Sort");
  const [destLabel,setDestLabel]=useState("~/Pictures/Listings");
  const [threshold,setThreshold]=useState(0.7);
  const [overrides,setOverrides]=useState<Record<string,string>>({});
  const [step,setStep]=useState<1|2|3>(1);
  const [saving,setSaving]=useState(false); const [savedMsg,setSavedMsg]=useState("");
  const [customNames,setCustomNames]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  // categories
  const [catSearch,setCatSearch]=useState(""); const [newCat,setNewCat]=useState("");
  // decisions
  const [dTitle,setDTitle]=useState(""); const [dCtx,setDCtx]=useState(""); const [dDec,setDDec]=useState(""); const [dStatus,setDStatus]=useState("open");
  const [expandedRun,setExpandedRun]=useState<number|null>(null);
  const [exportText,setExportText]=useState("");

  function flash(m:string){ setToast(m); setTimeout(()=>setToast(""),3200); }

  async function load(){
    try{
      const r=await fetch("/api/data");
      if(!r.ok) throw new Error("Saved batches and editable settings need a PostgreSQL database. Local batch OCR + CLIP analysis can still run.");
      const j=await r.json(); if(j.error) throw new Error(j.error);
      setSections(j.sections); setCats(j.categories); setDecisions(j.decisions); setBatches(j.batches); setPhotosByBatch(j.photosByBatch);
    }catch(e){ setErr(e instanceof Error?e.message:"Saved app data could not be loaded."); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{
    // Initial database hydration is an intentional effect-driven state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  },[]);
  useEffect(()=>{
    const urls=selectedFiles.map(file=>URL.createObjectURL(file));
    // Blob URLs are created and revoked as the selected-file set changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrls(urls);
    return ()=>urls.forEach(url=>URL.revokeObjectURL(url));
  },[selectedFiles]);
  useEffect(()=>{ if(view==="export"){ fetch("/api/export").then(r=>r.text()).then(setExportText).catch(()=>{}); } },[view,sections,cats,decisions]);

  const activeCats=useMemo(()=>cats.filter(c=>c.isActive).map(c=>c.name),[cats]);
  const availableCategories=useMemo(()=>activeCats.length?activeCats:DEFAULT_CATEGORIES.map(category=>category.name),[activeCats]);
  const classified:Classified[]=useMemo(()=>{
    if(!filenames.length) return [];
    const base=classifyBatch(filenames, activeCats.length?activeCats:["miscellaneous"], threshold);
    const counters:Record<string,number>={};
    return base.map(p=>{
      const hasOverride=Boolean(overrides[p.originalName]);
      const folder=overrides[p.originalName]||(selectedFiles.length?"Uncategorized":p.folderName);
      counters[folder]=(counters[folder]||0)+1; const n=counters[folder];
      const ext=(p.originalName.match(/\.[^.]+$/)?.[0]||".jpg").toLowerCase();
      const baseName=folder.toLowerCase().replace(/[^\w\s-]/g,"").replace(/\s+/g,"_");
      return {...p, folderName:folder, category:folder==="Uncategorized"?"uncategorized":p.category, method:hasOverride?"you fixed it":selectedFiles.length?"needs review":p.method, confidence:hasOverride?1:selectedFiles.length?0:p.confidence, newName: n>1?`${baseName}_${n}${ext}`:`${baseName}${ext}`};
    });
  },[filenames,activeCats,threshold,overrides,selectedFiles.length]);

  const grouped=useMemo(()=>{
    const m=new Map<string,Classified[]>(); for(const p of classified){ if(!m.has(p.folderName)) m.set(p.folderName,[]); m.get(p.folderName)!.push(p);} return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[classified]);
  const reviewCount=classified.filter(p=>p.folderName==="Uncategorized").length;
  const totalPhotosSorted=batches.reduce((a,b)=>a+b.total,0);
  const lockedCount=sections.filter(s=>s.status==="locked").length;
  const groups=["All",...new Set(sections.map(s=>s.groupLabel))];
  const visibleSections=groupFilter==="All"?sections:sections.filter(s=>s.groupLabel===groupFilter);

  async function saveSection(id:number){
    const r=await fetch(`/api/sections/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:editBody,bullets:editBullets,status:editStatus})});
    const row=await r.json(); setSections(s=>s.map(x=>x.id===id?row:x)); setEditingId(null); flash("Identity section saved. The document is the source of truth — nice.");
  }
  async function toggleCat(c:Cat){
    setCats(prev=>prev.map(x=>x.id===c.id?{...x,isActive:!x.isActive}:x));
    await fetch("/api/categories",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:c.id,isActive:!c.isActive})});
  }
  async function addCat(){
    if(!newCat.trim()) return; const r=await fetch("/api/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newCat})}); const j=await r.json();
    if(j.error){ flash(j.error); return;} setCats(p=>[...p,j].sort((a,b)=>a.name.localeCompare(b.name))); setNewCat(""); flash(`Category "${j.name}" added — the sorter can file into it now.`);
  }
  async function deleteCat(c:Cat){ setCats(p=>p.filter(x=>x.id!==c.id)); await fetch("/api/categories",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:c.id})}); }
  async function runSort(){
    setSaving(true); setSavedMsg("");
    try{
      const effectiveOverrides=selectedFiles.length?Object.fromEntries(filenames.map(filename=>[filename,overrides[filename]||"Uncategorized"])):overrides;
      const r=await fetch("/api/batches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:batchName,sourceLabel,destLabel,threshold,filenames,overrides:effectiveOverrides})});
      if(!r.ok) throw new Error("Saving batch history needs a PostgreSQL database. You can still analyze selected photos locally and download an organized ZIP.");
      const j=await r.json();
      if(!j.batch) throw new Error(j.error||"SnapSort could not save this batch.");
      setStep(3); setSavedMsg(`${j.batch.total} photos arranged into a ${j.batch.folders}-folder plan. This prototype saves the sorting history; download the ZIP below to create organized copies of your selected files.`); load();
    }catch(error){ flash(error instanceof Error?error.message:"SnapSort could not save this batch."); }
    finally{ setSaving(false); }
  }
  async function addDecision(){
    if(!dTitle.trim()) return; const r=await fetch("/api/decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:dTitle,context:dCtx,decision:dDec,status:dStatus})}); const j=await r.json();
    if(!j.error){ setDecisions(p=>[j,...p]); setDTitle(""); setDCtx(""); setDDec(""); flash("Decision recorded — future-you will thank present-you."); }
  }
  async function cycleDecision(d:Decision){
    const next=d.status==="open"?"decided":d.status==="decided"?"open":"open";
    const r=await fetch("/api/decisions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:d.id,status:next,decision:d.decision})}); const j=await r.json(); setDecisions(p=>p.map(x=>x.id===d.id?j:x));
  }
  function loadSample(which:"bose"|"mixed"){ setSelectedFiles([]); setAnalysisStatus("idle"); setAnalysesByPhoto({}); setAnalysisProgress(0); setFilenames(which==="bose"?SAMPLE_BOSE:SAMPLE_MIXED); setBatchName(which==="bose"?"Founding batch — Bose earbuds & friends":"Mixed resale batch — garage finds"); setOverrides({}); setStep(2); setSavedMsg(""); }
  function onFiles(input:FileList|File[]|null){
    if(!input) return;
    const picked=[...input].filter(file=>file.type.startsWith("image/")||/\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(file.name));
    if(!picked.length){ flash("Choose image files to preview and sort."); return; }
    setSelectedFiles(picked);
    setAnalysisStatus("idle"); setAnalysesByPhoto({}); setAnalysisProgress(0);
    setFilenames(picked.map(file=>file.name));
    setBatchName(`${picked.length} photos you picked`);
    setOverrides({}); setSavedMsg(""); setStep(2);
  }
  async function analyzeSelectedPhotos(){
    if(!selectedFiles.length){ flash("Choose actual photos before running local OCR + CLIP."); return; }
    setAnalysisStatus("working"); setAnalysesByPhoto({}); setAnalysisProgress(0);
    const testCategories=availableCategories;
    const testGroups=[...new Set(DEFAULT_CATEGORIES.map(category=>category.group))];

    for(let index=0;index<selectedFiles.length;index++){
      const file=selectedFiles[index];
      const analysis:PhotoAnalysis={ocrText:"",ocrQuality:0,rotation:0,ocrCategory:null,ocrError:"",groups:[],items:[],clipError:""};
      try{
        const ocr=await readPackageText(file);
        analysis.ocrText=ocr.text; analysis.ocrQuality=ocr.confidence; analysis.rotation=ocr.rotation;
        const textClass=ocr.text?classifyOne(ocr.text,testCategories,0.7):null;
        analysis.ocrCategory=textClass&&textClass.category!=="uncategorized"?textClass.category:null;
      }catch(error){
        analysis.ocrError=error instanceof Error?error.message:"OCR could not read this image.";
      }
      try{
        analysis.groups=await testImageCategories(file,testGroups,"group");
        analysis.items=await testImageCategories(file,testCategories,"item");
      }catch(error){
        analysis.clipError=error instanceof Error?error.message:"CLIP could not compare this image.";
      }
      setAnalysesByPhoto(previous=>({...previous,[index]:analysis}));
      setAnalysisProgress(index+1);
    }
    setAnalysisStatus("done");
  }

  function toggleOcrSuggestion(photoIndex:number){
    const file=selectedFiles[photoIndex];
    const analysis=analysesByPhoto[photoIndex];
    if(!file||!analysis?.ocrCategory) return;
    const folder=analysis.ocrCategory[0].toUpperCase()+analysis.ocrCategory.slice(1);
    setOverrides(previous=>{
      const next={...previous};
      if(next[file.name]===folder) delete next[file.name];
      else next[file.name]=folder;
      return next;
    });
  }

  async function downloadOrganizedZip(){
    if(!selectedFiles.length){ flash("This sample uses filenames only. Choose actual photos to download a ZIP."); return; }
    try{
      const JSZip=(await import("jszip")).default;
      const zip=new JSZip();
      const safePart=(value:string)=>value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").trim()||"Needs Review";
      const log:string[]=["SnapSort organization log","Original files are included as copies; originals were not changed.",""];
      classified.forEach((photo,index)=>{
        const file=selectedFiles[index];
        if(!file) return;
        const folder=safePart(photo.folderName);
        const newName=safePart(photo.newName);
        zip.folder(folder)?.file(newName,file);
        log.push(`${file.name}  ->  ${folder}/${newName}`);
      });
      zip.file("_snapsort_log.txt",log.join("\n"));
      const blob=await zip.generateAsync({type:"blob"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a"); link.href=url; link.download=`${safePart(batchName)}_sorted.zip`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      flash("Your sorted ZIP is ready. The original photos were left alone.");
    }catch{ flash("SnapSort could not create the ZIP. Please try the download again."); }
  }

  const nav:{id:View;label:string;icon:React.ReactNode;hint:string}[]=[
    {id:"doc",label:"Identity Document",icon:<BookOpen size={17}/>,hint:"Read & edit the ground truth"},
    {id:"try",label:"Try the Prototype",icon:<FlaskConical size={17}/>,hint:"Drop → Preview → Sort, live"},
    {id:"categories",label:"Categories",icon:<Layers size={17}/>,hint:`${activeCats.length} active`},
    {id:"runs",label:"Sorted Batches",icon:<History size={17}/>,hint:`${batches.length} runs · ${totalPhotosSorted} photos`},
    {id:"decisions",label:"Decisions Log",icon:<Scale size={17}/>,hint:`${decisions.filter(d=>d.status==="open").length} open`},
    {id:"export",label:"Export .md",icon:<FileDown size={17}/>,hint:"Take it to your Mint machine"},
  ];

  return (
    <div className="desktop-bg min-h-screen">
      {/* Cinnamon panel */}
      <div className="sticky top-0 z-40 flex items-center gap-3 bg-[#1F2426] text-[#EDE9DF] px-3 sm:px-4 h-11 text-sm shadow-lg">
        <button className="flex items-center gap-2 rounded-md bg-[#92B372] text-[#1F2B18] font-bold px-3 py-1.5 hover:bg-[#A8C68A]"><Leaf size={16}/> Menu</button>
        <span className="hidden md:flex items-center gap-2 text-[#CFCABB]"><span className="w-2 h-2 rounded-full bg-[#92B372]"/> SnapSort — Identity Document</span>
        <span className="hidden lg:inline text-[#8E968C] font-mono2 text-xs">~/Documents/SnapSort-Identity</span>
        <div className="ml-auto flex items-center gap-4 text-[#CFCABB]"><span className="hidden sm:flex items-center gap-1.5 text-xs bg-[#323A3D] rounded-full px-2.5 py-1"><Ban size={12} className="text-[#F0C987]"/> No terminal required</span><Wifi size={15}/><Volume2 size={15}/><span className="text-xs flex items-center gap-1"><Clock size={13}/> Linux Mint · Cinnamon</span></div>
      </div>

      <div className="mx-auto max-w-[1440px] p-2 sm:p-5 pb-16">
        {/* Window */}
        <div className="rounded-xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.45)] border border-black/40">
          <div className="flex items-center gap-3 bg-[#E8E6DF] px-4 h-11 border-b border-[#D5D1C4]">
            <Images size={16} className="text-[#5E8C4A]"/>
            <span className="font-semibold text-sm truncate">SnapSort <span className="text-[#77796F] font-normal">— Photo Organizer for people coming from Windows</span></span>
            <div className="ml-auto flex items-center gap-1 text-[#55584F]"><button className="p-1.5 hover:bg-black/5 rounded"><Minus size={15}/></button><button className="p-1.5 hover:bg-black/5 rounded"><Square size={13}/></button><button className="p-1.5 hover:bg-[#C7544A] hover:text-white rounded"><X size={15}/></button></div>
          </div>

          <div className="flex flex-col lg:flex-row paper min-h-[calc(100vh-170px)]">
            {/* Nemo-style sidebar */}
            <aside className="lg:w-[278px] shrink-0 bg-[#353C3E] text-[#E8E4D8] p-4 flex lg:flex-col gap-4 overflow-x-auto no-scrollbar">
              <div className="hidden lg:block">
                <p className="text-[11px] tracking-[.14em] text-[#A9AEA0] font-bold">PLACES</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-[#D8D3C4] px-2 py-1.5"><Home size={15} className="text-[#92B372]"/> Home <span className="ml-auto text-xs text-[#8E968C]">Pictures</span></div>
                  <div className="flex items-center gap-2 text-[#D8D3C4] px-2 py-1.5"><HardDrive size={15} className="text-[#E9B872]"/> Listings folder <span className="ml-auto text-xs text-[#8E968C]">{totalPhotosSorted} photos</span></div>
                </div>
                <p className="text-[11px] tracking-[.14em] text-[#A9AEA0] font-bold mt-6">THIS PROJECT</p>
              </div>
              <nav className="flex lg:flex-col gap-1.5 min-w-max lg:min-w-0">
                {nav.map(n=>(
                  <button key={n.id} onClick={()=>setView(n.id)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${view===n.id?"bg-[#92B372] text-[#1E2C17] font-semibold shadow":"hover:bg-white/10 text-[#E8E4D8]"}`}>
                    {n.icon}<span><span className="block text-sm leading-tight">{n.label}</span><span className={`block text-[11px] ${view===n.id?"text-[#3E5C31]":"text-[#A9AEA0]"}`}>{n.hint}</span></span>
                  </button>
                ))}
              </nav>
              <div className="hidden lg:block mt-auto rounded-xl bg-[#2B3234] border border-white/10 p-4">
                <p className="flex items-center gap-2 font-semibold text-sm"><ShieldCheck size={16} className="text-[#92B372]"/> The ground rule</p>
                <p className="text-[13px] leading-snug text-[#CFCABB] mt-1.5">If it needs a command, a flag, or a config file to do the main job — it has failed its identity.</p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="rounded-lg bg-white/5 py-2"><p className="font-bold text-lg leading-none">{lockedCount}/{sections.length||12}</p><p className="text-[10px] text-[#A9AEA0] mt-1">SECTIONS<br/>LOCKED</p></div>
                  <div className="rounded-lg bg-white/5 py-2"><p className="font-bold text-lg leading-none">{activeCats.length}</p><p className="text-[10px] text-[#A9AEA0] mt-1">CATEGORIES<br/>ACTIVE</p></div>
                  <div className="rounded-lg bg-white/5 py-2"><p className="font-bold text-lg leading-none">{totalPhotosSorted}</p><p className="text-[10px] text-[#A9AEA0] mt-1">PHOTOS<br/>SORTED</p></div>
                </div>
              </div>
            </aside>

            <main className="flex-1 min-w-0">
              {loading && <div className="p-10 text-center text-[#6B6F62]"><Images className="mx-auto pulse-soft text-[#5E8C4A]" size={36}/><p className="mt-3 font-medium">Opening your identity document…</p><p className="text-sm">(Seeding it from the original Photo Organizer chat &amp; code — no terminal opened in the process.)</p></div>}
              {err && <div className="m-6 rounded-xl bg-[#FDF0EC] border border-[#E8B4A8] p-5"><p className="font-bold flex gap-2"><AlertTriangle className="text-[#B34A3A]"/> Something hiccupped</p><p className="text-sm mt-1 font-mono2">{err}</p><button onClick={load} className="mt-3 rounded-lg bg-[#2E3436] text-white px-4 py-2 text-sm font-semibold">Try again</button></div>}

              {!loading && view==="doc" && (
                <div className="fade-up">
                  {/* HERO */}
                  <div className="px-5 sm:px-8 pt-7 pb-6 border-b border-[#E2DECF]">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wide"><span className="bg-[#2E3436] text-[#D8E6C3] rounded-full px-3 py-1">IDENTITY DOCUMENT · v1.0</span><span className="bg-[#E3EFD3] text-[#3E5C31] rounded-full px-3 py-1">FOR LINUX MINT / CINNAMON</span><span className="bg-[#FDF0EC] text-[#9A3B2D] rounded-full px-3 py-1 flex items-center gap-1"><Terminal size={12}/> TERMINAL: BANNED</span></div>
                    <h1 className="mt-4 text-[clamp(2rem,4.5vw,3.6rem)] leading-[0.98] font-black tracking-tight">SnapSort sorts your<br/>resale photos. <span className="text-[#5E8C4A]">You just<br className="hidden sm:block"/> point at a folder.</span></h1>
                    <p className="mt-4 text-[17px] leading-relaxed text-[#4C5049] max-w-2xl">This is the identity document for rebuilding your <strong>Photo Organizer</strong> — the CLIP-powered script that sorted a dozen Bose earbuds — as a proper Linux Mint app for someone who learned computers on Windows and finds command-line tools tedious. It is the <em>source of truth to build from</em>: who it&apos;s for, what it must never do, and exactly how Drop → Preview → Sort should feel. <strong>It&apos;s alive:</strong> edit any section below, then export it as Markdown to your Mint machine.</p>
                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <button onClick={()=>setView("try")} className="inline-flex items-center gap-2 rounded-xl bg-[#5E8C4A] hover:bg-[#4F7A3E] text-white font-bold px-5 py-3 shadow"><MousePointerClick size={18}/> Try the prototype — no typing commands</button>
                      <a href="/api/export" className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#D5D1C4] hover:border-[#5E8C4A] font-bold px-5 py-3"><Download size={18}/> Download this document (.md)</a>
                    </div>
                    {/* Before / After visual */}
                    <div className="mt-7 grid md:grid-cols-[1fr_auto_1.25fr] gap-4 items-stretch">
                      <div className="rounded-xl bg-[#2E3436] text-[#E8E4D8] p-4">
                        <p className="text-xs font-bold tracking-wider text-[#A9AEA0] flex items-center gap-2"><Terminal size={14}/> BEFORE — THE TEDIOUS WAY</p>
                        <pre className="font-mono2 text-[12px] leading-relaxed mt-3 text-[#C9C4B4] overflow-x-auto">{`$ pip install -r requirements.txt\n$ python organize_photos.py \\\n  --input ./my_photos \\\n  --output ./organized \\\n  --threshold 0.7 --model \\\n  openai/clip-vit-base-patch32\n# ...500MB later, fingers crossed`}</pre>
                        <p className="text-xs mt-3 text-[#F0C987]">Flags, paths typed by hand, silent model download, results you have to go inspect.</p>
                      </div>
                      <div className="flex md:flex-col items-center justify-center gap-1 text-[#5E8C4A] font-black text-sm"><span className="hidden md:block">BECOMES</span><ArrowRight size={28}/></div>
                      <div className="rounded-xl bg-white border border-[#E2DECF] p-4 shadow-sm">
                        <p className="text-xs font-bold tracking-wider text-[#3E5C31] flex items-center gap-2"><Images size={14}/> AFTER — THREE CLICKS IN MINT</p>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {HERO_IMGS.map(h=>(
                            <div key={h.label}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={h.src} alt={h.label} className="h-24 w-full object-cover rounded-lg"/>
                              <p className="font-mono2 text-[10px] mt-1 truncate text-[#77796F]">{h.label}</p>
                              <p className="text-[11px] font-semibold flex items-center gap-1 truncate"><Folder size={12} className="text-[#D99B3F] shrink-0"/> {h.folder}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs mt-2.5 text-[#4C5049]">1. Drop a folder &nbsp;·&nbsp; 2. See the plan &nbsp;·&nbsp; 3. Press <strong>Sort</strong>. Originals untouched.</p>
                      </div>
                    </div>
                  </div>

                  {/* Persona strip */}
                  <div className="px-5 sm:px-8 py-6 grid lg:grid-cols-3 gap-4 border-b border-[#E2DECF] bg-[#FBFAF6]">
                    <div className="rounded-xl bg-[#3E5C31] text-white p-5">
                      <p className="text-xs font-bold tracking-wider text-[#C9DEB0]">THE PERSON</p>
                      <p className="text-xl font-black mt-1.5 leading-tight">A reseller who just<br/>left Windows.</p>
                      <p className="text-sm text-[#E3EFD3] leading-relaxed mt-2">Photographs 10–40 items at a time for eBay / OfferUp / Marketplace. Fluent in File Explorer &amp; right-click menus. Allergic — legitimately — to typing commands to move pictures.</p>
                      <div className="flex gap-2 mt-3 flex-wrap">{["<500 photos / batch","Phone dumps","Bose batch = patient zero"].map(x=><span key={x} className="text-[11px] bg-white/15 rounded-full px-2 py-1">{x}</span>)}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E2DECF] p-5">
                      <p className="text-xs font-bold tracking-wider text-[#8A5A12] flex items-center gap-1.5"><Timer size={14}/> THE WIN, IN NUMBERS</p>
                      <div className="mt-3 space-y-2.5 text-sm">
                        <div className="flex justify-between border-b border-dashed border-[#E2DECF] pb-2"><span>Manual sorting, 100 photos</span><strong>~30 min</strong></div>
                        <div className="flex justify-between border-b border-dashed border-[#E2DECF] pb-2"><span>SnapSort incl. review</span><strong className="text-[#3E5C31]">under 2 min</strong></div>
                        <div className="flex justify-between border-b border-dashed border-[#E2DECF] pb-2"><span>Terminal windows opened</span><strong className="text-[#3E5C31]">0 — ever</strong></div>
                        <div className="flex justify-between"><span>Originals destroyed</span><strong className="text-[#3E5C31]">0 — copy only</strong></div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E2DECF] p-5">
                      <p className="text-xs font-bold tracking-wider text-[#6B6F62] flex items-center gap-1.5"><Monitor size={14}/> WINDOWS HABIT → MINT HOME</p>
                      <div className="mt-3 space-y-2 text-[13px]">
                        {["Double-click installer → double-click .deb","File Explorer → Open in Files (Nemo)","Right-click Send To → Right-click ‘Sort with SnapSort’","C:\\Users\\…\\Pictures → Home › Pictures breadcrumbs","Progress box + Cancel → same, but it actually cancels"].map(x=><p key={x} className="flex gap-2"><CheckCircle2 size={15} className="text-[#5E8C4A] shrink-0 mt-0.5"/>{x}</p>)}
                      </div>
                    </div>
                  </div>

                  {/* Six principles */}
                  <div className="px-5 sm:px-8 py-6 border-b border-[#E2DECF]">
                    <h2 className="text-xl font-black flex items-center gap-2"><BadgeCheck className="text-[#5E8C4A]"/> The six principles <span className="text-sm font-normal text-[#77796F]">— test every screen against these</span></h2>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                      {[
                        {n:"1",t:"No terminal, ever",d:"Install, model download, errors — buttons and progress bars. The words pip, chmod, venv never appear."},
                        {n:"2",t:"Preview before touch",d:"The old --dry-run becomes the main screen. Nothing moves until you've seen the folder plan."},
                        {n:"3",t:"Never destroy",d:"Copy, don't move. Undo always available. Collisions get _2 — never a mid-batch overwrite prompt."},
                        {n:"4",t:"Show, don't ask",d:"Thumbnails over filenames, folder trees over paths, a 'how sure' bar over 0.73."},
                        {n:"5",t:"Windows muscle memory works",d:"Drag-and-drop, right-click in Nemo, double-click results, Esc cancels. Borrow the habit."},
                        {n:"6",t:"Honest AI",d:"Unsure? It says so in plain English and parks the photo in Needs Review. No confident wrong folders."},
                      ].map(p=>(
                        <div key={p.n} className="rounded-xl border border-[#E2DECF] bg-white p-4 hover:border-[#92B372] transition">
                          <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-[#E3EFD3] text-[#3E5C31] font-black">{p.n}</span>
                          <p className="font-bold mt-2">{p.t}</p><p className="text-[13px] text-[#4C5049] leading-relaxed mt-1">{p.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Document sections */}
                  <div className="px-5 sm:px-8 py-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-black">The document itself</h2><span className="text-sm text-[#77796F]">12 sections · click to read · pencil to edit · changes save to the database and into the .md export</span>
                      <div className="ml-auto flex gap-1.5 flex-wrap">{groups.map(g=><button key={g} onClick={()=>setGroupFilter(g)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${groupFilter===g?"bg-[#2E3436] text-white":"bg-white border border-[#D5D1C4]"}`}>{g}</button>)}</div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {visibleSections.map(s=>{
                        const open=openSection===s.slug; const editing=editingId===s.id;
                        return (
                          <article key={s.id} className={`rounded-xl border bg-white overflow-hidden ${open?"border-[#92B372] shadow-md":"border-[#E2DECF]"}`}>
                            <button onClick={()=>setOpenSection(open?"":s.slug)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left">
                              <span className="font-mono2 font-bold text-[#5E8C4A] text-lg w-9 shrink-0">{s.num}</span>
                              <span className="min-w-0"><span className="block font-bold text-[15px] leading-tight">{s.title}</span><span className="block text-xs text-[#77796F]">{s.kicker} · {s.groupLabel}</span></span>
                              <span className="ml-auto flex items-center gap-2 shrink-0">{statusPill(s.status)}{open?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</span>
                            </button>
                            {open && !editing && (
                              <div className="px-4 sm:px-5 pb-5 pl-[68px]">
                                <p className="text-[15px] leading-relaxed text-[#33372F]">{s.body}</p>
                                {s.bullets.trim() && <ul className="mt-3 space-y-2">{s.bullets.split("\n").filter(Boolean).map((b,i)=><li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-[#4C5049] bg-[#FBFAF6] border border-[#EFEBDD] rounded-lg px-3 py-2"><Check size={15} className="text-[#5E8C4A] shrink-0 mt-0.5"/>{b}</li>)}</ul>}
                                <button onClick={()=>{setEditingId(s.id);setEditBody(s.body);setEditBullets(s.bullets);setEditStatus(s.status);}} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#D5D1C4] hover:border-[#5E8C4A] px-3.5 py-2 text-sm font-semibold"><Pencil size={14}/> Edit this section</button>
                              </div>
                            )}
                            {open && editing && (
                              <div className="px-4 sm:px-5 pb-5 pl-[68px] space-y-3">
                                <label className="block text-xs font-bold tracking-wide text-[#6B6F62]">BODY</label>
                                <textarea value={editBody} onChange={e=>setEditBody(e.target.value)} rows={5} className="w-full rounded-lg border border-[#D5D1C4] p-3 text-sm leading-relaxed focus:outline-[#92B372]"/>
                                <label className="block text-xs font-bold tracking-wide text-[#6B6F62]">POINTS (ONE PER LINE)</label>
                                <textarea value={editBullets} onChange={e=>setEditBullets(e.target.value)} rows={6} className="w-full rounded-lg border border-[#D5D1C4] p-3 text-sm leading-relaxed focus:outline-[#92B372]"/>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select value={editStatus} onChange={e=>setEditStatus(e.target.value)} className="rounded-lg border border-[#D5D1C4] px-3 py-2 text-sm font-semibold bg-white"><option value="locked">Locked — settled</option><option value="draft">Draft — still shaping</option><option value="decision">Needs decision</option></select>
                                  <button onClick={()=>saveSection(s.id)} className="inline-flex items-center gap-2 rounded-lg bg-[#5E8C4A] text-white px-4 py-2 text-sm font-bold"><Save size={14}/> Save section</button>
                                  <button onClick={()=>setEditingId(null)} className="rounded-lg border border-[#D5D1C4] px-4 py-2 text-sm font-semibold">Cancel</button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                    <div className="mt-6 rounded-xl bg-[#2E3436] text-[#E8E4D8] p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <Lightbulb className="text-[#F0C987] shrink-0" size={28}/>
                      <div><p className="font-bold">Next step on your Mint machine</p><p className="text-sm text-[#CFCABB] leading-relaxed">Export this document, build the GTK window to match the prototype tab screen-for-screen, and test it against the founding Bose batch. If a tester opens a terminal at any point — that&apos;s a bug in the product, not the tester.</p></div>
                      <button onClick={()=>setView("try")} className="shrink-0 rounded-xl bg-[#92B372] text-[#1E2C17] font-bold px-4 py-2.5">See it working <ArrowRight size={16} className="inline"/></button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && view==="try" && (
                <div className="fade-up px-5 sm:px-8 py-7">
                  <p className="text-xs font-bold tracking-wider text-[#5E8C4A]">LIVE PROTOTYPE · THE INTERACTION SPEC FOR THE MINT BUILD</p>
                  <h2 className="text-3xl font-black mt-1">Drop → Preview → Sort</h2>
                  <p className="text-[#4C5049] mt-2 max-w-2xl leading-relaxed">The filename sorter starts the preview draft. Run local OCR + CLIP on the selected batch to add per-photo evidence; each OCR category remains in Needs Review until you accept it, and nothing moves automatically.</p>

                  {/* stepper */}
                  <div className="flex items-center gap-2 mt-6 flex-wrap">
                    {[{n:1,t:"1 · Drop photos"},{n:2,t:"2 · Preview & fix"},{n:3,t:"3 · Sorted"}].map(s=>(
                      <button key={s.n} onClick={()=>s.n<3&&setStep(s.n as 1|2)} className={`rounded-full px-4 py-2 text-sm font-bold ${step===s.n?"bg-[#2E3436] text-white":step>s.n?"bg-[#E3EFD3] text-[#3E5C31]":"bg-white border border-[#D5D1C4] text-[#77796F]"}`}>{step>s.n?<Check size={14} className="inline mr-1"/>:null}{s.t}</button>
                    ))}
                    <span className="ml-auto text-xs font-mono2 text-[#77796F]">threshold in the old CLI: --threshold {threshold.toFixed(2)} → here: a slider</span>
                  </div>

                  {step===1 && (
                    <div className="mt-5 grid lg:grid-cols-2 gap-4">
                      <div
                        role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileRef.current?.click();}}}
                        onClick={()=>fileRef.current?.click()}
                        onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
                        onDragLeave={()=>setIsDragging(false)}
                        onDrop={e=>{e.preventDefault();setIsDragging(false);onFiles(e.dataTransfer.files);}}
                        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition ${isDragging?"border-[#5E8C4A] bg-[#E3EFD3]":"border-[#92B372] bg-[#F2F7E8] hover:bg-[#EAF2DC]"}`}>
                        <FolderInput size={44} className="mx-auto text-[#5E8C4A]"/>
                        <p className="font-black text-lg mt-3">Drop photos here</p>
                        <p className="text-sm text-[#4C5049] mt-1">…or click to choose images. The actual files stay in this browser; only their names are used for the demo sort.</p>
                        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onClick={e=>e.stopPropagation()} onChange={e=>{onFiles(e.target.files);e.currentTarget.value="";}}/>
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-xl bg-white border border-[#E2DECF] p-4">
                          <p className="font-bold text-sm">No photos handy? Load a sample batch:</p>
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            <button onClick={()=>loadSample("bose")} className="rounded-lg bg-[#2E3436] text-white px-4 py-2.5 text-sm font-bold">The founding Bose batch · 14</button>
                            <button onClick={()=>loadSample("mixed")} className="rounded-lg bg-white border border-[#D5D1C4] px-4 py-2.5 text-sm font-bold">Mixed resale batch · 18</button>
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-[#E2DECF] p-4">
                          <p className="font-bold text-sm">…or paste filenames, one per line:</p>
                          <textarea value={customNames} onChange={e=>setCustomNames(e.target.value)} rows={4} placeholder={"samsung_galaxy_phone.jpg\nnike_shoes.jpg\nIMG_1234.jpg"} className="w-full mt-2 rounded-lg border border-[#D5D1C4] p-3 font-mono2 text-xs"/>
                          <button onClick={()=>{const n=customNames.split("\n").map(x=>x.trim()).filter(Boolean); if(n.length){setSelectedFiles([]);setAnalysisStatus("idle");setAnalysesByPhoto({});setAnalysisProgress(0);setFilenames(n);setBatchName("Your pasted batch");setOverrides({});setStep(2);}}} className="mt-2 rounded-lg bg-[#5E8C4A] text-white px-4 py-2 text-sm font-bold">Use these {customNames.split("\n").filter(x=>x.trim()).length||""} photos</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {step>=2 && (
                    <>
                      <div className="grid lg:grid-cols-[1fr_340px] gap-4 mt-5 items-start">
                        <div className="rounded-2xl bg-white border border-[#E2DECF] shadow-sm overflow-hidden">
                          <div className="flex items-center gap-2 bg-[#EFECE4] px-4 py-2.5 border-b border-[#E2DECF] text-sm flex-wrap">
                            <Home size={14} className="text-[#5E8C4A]"/><span className="font-semibold">Home</span><ChevronRight size={13}/><span>Pictures</span><ChevronRight size={13}/><span className="font-semibold">Listings</span>
                            <span className="ml-auto text-xs bg-[#E3EFD3] text-[#3E5C31] font-bold rounded-full px-2.5 py-1">PREVIEW — nothing has moved yet</span>
                          </div>
                          <div className="p-4 space-y-4 max-h-[560px] overflow-y-auto">
                            {grouped.map(([folder,items],gi)=>(
                              <div key={folder}>
                                <p className="flex items-center gap-2 font-bold"><FolderOpen size={19} className={folder==="Uncategorized"?"text-[#B34A3A]":"text-[#D99B3F]"}/> {folder==="Uncategorized"?"Needs Review":folder} <span className="text-xs font-normal text-[#77796F]">{items.length} photo{items.length>1?"s":""}{folder==="Uncategorized"?" — it's not sure about these. You pick.":""}</span></p>
                                <div className="grid sm:grid-cols-2 gap-2 mt-2 ml-1">
                                  {items.map((p,i)=>{
                                    const photoIndex=classified.indexOf(p);
                                    const analysis=analysesByPhoto[photoIndex];
                                    const ocrFolder=analysis?.ocrCategory?analysis.ocrCategory[0].toUpperCase()+analysis.ocrCategory.slice(1):null;
                                    const accepted=Boolean(ocrFolder&&overrides[p.originalName]===ocrFolder);
                                    return (
                                      <div key={`${p.originalName}-${photoIndex}`} className="rounded-xl border border-[#EFEBDD] bg-[#FBFAF6] p-2.5">
                                        <div className="flex gap-3">
                                          {previewUrls[photoIndex] ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={previewUrls[photoIndex]} alt="Preview of selected photo" className="w-14 h-14 rounded-lg object-cover shrink-0"/>
                                          ) : (
                                            <div className="w-14 h-14 rounded-lg bg-[#EFECE4] text-[#9A6B32] grid place-items-center shrink-0" aria-label="No local photo preview"><FileImage size={22}/></div>
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="font-mono2 text-[11px] text-[#9A6B32] truncate" title={p.originalName}>{p.originalName}</p>
                                            <p className="font-mono2 text-[11px] font-bold truncate" title={p.newName}>→ {p.newName}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                              <div className="flex-1 h-1.5 rounded bg-[#E8E4D8] overflow-hidden"><div className="h-full rounded" style={{width:`${p.confidence*100}%`,background:p.confidence>=threshold?"#5E8C4A":p.confidence>=0.55?"#D99B3F":"#C7544A"}}/></div>
                                              <span className="text-[10px] font-bold text-[#6B6F62]">{selectedFiles.length&&!overrides[p.originalName]?"Needs Review · no acceptance yet":`${Math.round(p.confidence*100)}% sure · ${p.method}`}</span>
                                            </div>
                                            {step===2 && (
                                              <select value={overrides[p.originalName]||""} onChange={e=>setOverrides(o=>({...o,[p.originalName]:e.target.value}))} className="mt-1.5 w-full rounded-md border border-[#D5D1C4] bg-white text-[11px] px-1.5 py-1">
                                                <option value="">Leave in {p.folderName==="Uncategorized"?"Needs Review":p.folderName}</option>
                                                {availableCategories.slice(0,48).map(c=><option key={c} value={c[0].toUpperCase()+c.slice(1)}>Move to {c}</option>)}
                                              </select>
                                            )}
                                          </div>
                                        </div>
                                        {analysis&&<div className="mt-2 rounded-lg border border-[#E2DECF] bg-white p-2.5 text-xs space-y-1.5">
                                          <p><strong>OCR:</strong> {analysis.ocrCategory?`${analysis.ocrCategory[0].toUpperCase()+analysis.ocrCategory.slice(1)} suggestion`:analysis.ocrError?"text reading failed":"no clear category clue"} <span className="text-[#77796F]">· {analysis.ocrQuality?`${Math.round(analysis.ocrQuality)}% OCR engine score, ${analysis.rotation}°`:""}</span></p>
                                          <p><strong>CLIP:</strong> {analysis.groups[0]?.category??"no group result"} group{analysis.items[0]?` · ${analysis.items[0].category} item`:""}{analysis.clipError?` · ${analysis.clipError}`:""}</p>
                                          <p className="text-[#6B6F62]">{getFusionSummary(analysis)}</p>
                                          {analysis.ocrText&&<details><summary className="text-[11px] font-semibold text-[#5E8C4A]">Show package text OCR read</summary><p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-[#6B6F62]">{analysis.ocrText.slice(0,350)}</p></details>}
                                          {analysis.ocrCategory&&<button type="button" onClick={()=>toggleOcrSuggestion(photoIndex)} className="w-full rounded-md border border-[#5E8C4A] px-2.5 py-1.5 font-bold text-[#3E5C31] hover:bg-[#F2F7E8]">{accepted?"Undo accepted OCR suggestion":"Accept OCR suggestion"}</button>}
                                        </div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            {!classified.length && <p className="text-center text-[#77796F] py-10">No photos yet — go back to Step 1 and drop some.</p>}
                          </div>
                        </div>

                        <div className="space-y-3">
                          {selectedFiles.length>0&&<div className="rounded-2xl bg-[#F2F7E8] border border-[#C9DEB0] p-4">
                            <p className="font-bold flex items-center gap-2"><Sparkles size={16} className="text-[#5E8C4A]"/> Combined OCR + CLIP · whole batch</p>
                            <p className="text-xs text-[#4C5049] mt-1">Analyze each selected photo in your browser. OCR reads packaging text (including a 180° check); CLIP suggests groups and items. Images are not uploaded. Every photo stays in Needs Review until you accept OCR or choose a category.</p>
                            <button disabled={analysisStatus==="working"} onClick={()=>void analyzeSelectedPhotos()} className="mt-3 w-full rounded-lg bg-[#2E3436] disabled:opacity-60 text-white px-3 py-2.5 text-sm font-bold">
                              {analysisStatus==="working"?`Analyzing photo ${analysisProgress+1} of ${selectedFiles.length}…`:analysisStatus==="done"?"Re-analyze selected photos":"Analyze selected photos"}
                            </button>
                            {analysisStatus==="working"&&<p role="status" className="mt-2 text-xs text-[#4C5049]">First use downloads OCR and CLIP model resources. Photos are analyzed one by one; a large batch can take a while. Keep this tab open.</p>}
                            {analysisStatus==="done"&&<p className="mt-2 text-xs text-[#4C5049]">Analyzed {Object.keys(analysesByPhoto).length} of {selectedFiles.length} photos. Review each card and accept or change categories; nothing has been sorted yet.</p>}
                          </div>}
                          <div className="rounded-2xl bg-white border border-[#E2DECF] p-4 shadow-sm">
                            <p className="font-bold text-sm flex items-center gap-2"><SlidersHorizontal size={15} className="text-[#5E8C4A]"/> Sorting options <span className="font-normal text-[#77796F] text-xs">(defaults are fine)</span></p>
                            <label className="block text-xs font-bold text-[#6B6F62] mt-4">BATCH NAME</label>
                            <input value={batchName} onChange={e=>setBatchName(e.target.value)} className="w-full rounded-lg border border-[#D5D1C4] px-3 py-2 text-sm mt-1"/>
                            <label className="block text-xs font-bold text-[#6B6F62] mt-3">PHOTOS ARE IN</label>
                            <div className="flex gap-2 mt-1"><input value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} className="flex-1 rounded-lg border border-[#D5D1C4] px-3 py-2 text-sm font-mono2"/><button onClick={()=>setStep(1)} className="rounded-lg bg-[#EFECE4] px-3 text-sm font-bold">Browse…</button></div>
                            <label className="block text-xs font-bold text-[#6B6F62] mt-3">SORTED FOLDERS GO TO</label>
                            <input value={destLabel} onChange={e=>setDestLabel(e.target.value)} className="w-full rounded-lg border border-[#D5D1C4] px-3 py-2 text-sm font-mono2 mt-1"/>
                            <label className="block text-xs font-bold text-[#6B6F62] mt-4">HOW SURE SHOULD IT BE? <span className="text-[#3E5C31]">{threshold<=0.6?"Less strict":threshold>=0.85?"Very strict":"Balanced"} · {threshold.toFixed(2)}</span></label>
                            <input type="range" min={0.5} max={0.95} step={0.05} value={threshold} onChange={e=>setThreshold(Number(e.target.value))} className="w-full mt-1.5"/>
                            <div className="flex justify-between text-[10px] text-[#77796F]"><span>File more, guess more</span><span>Ask me more often</span></div>
                            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                              <div className="rounded-lg bg-[#FBFAF6] border border-[#EFEBDD] py-2"><p className="font-black">{classified.length}</p><p className="text-[10px] text-[#77796F]">PHOTOS</p></div>
                              <div className="rounded-lg bg-[#FBFAF6] border border-[#EFEBDD] py-2"><p className="font-black">{grouped.length}</p><p className="text-[10px] text-[#77796F]">FOLDERS</p></div>
                              <div className={`rounded-lg border py-2 ${reviewCount?"bg-[#FDF0EC] border-[#E8B4A8]":"bg-[#F2F7E8] border-[#C9DEB0]"}`}><p className="font-black">{reviewCount}</p><p className="text-[10px] text-[#77796F]">NEED YOUR EYE</p></div>
                            </div>
                            {step===2 ? (
                              <button disabled={!classified.length||saving} onClick={runSort} className="mt-4 w-full rounded-xl bg-[#5E8C4A] hover:bg-[#4F7A3E] disabled:opacity-50 text-white font-black py-3.5 flex items-center justify-center gap-2"><Play size={18}/> {saving?"Sorting…":"Sort my photos"}</button>
                            ):(
                              <div className="mt-4 rounded-xl bg-[#E3EFD3] text-[#2E4A24] p-3.5 text-sm"><p className="font-bold flex gap-2"><CheckCircle2 size={17}/> Done!</p><p className="mt-1">{savedMsg}</p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  <button onClick={()=>setView("runs")} className="rounded-lg bg-[#2E3436] text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5"><FolderOpen size={13}/> View batch history</button>
                                  {selectedFiles.length>0&&<button onClick={()=>void downloadOrganizedZip()} className="rounded-lg bg-[#5E8C4A] text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5"><Download size={13}/> Download sorted ZIP</button>}
                                  <button onClick={()=>{setStep(1);setSavedMsg("");}} className="rounded-lg bg-white border border-[#B9CFA0] px-3 py-2 text-xs font-bold flex items-center gap-1.5"><RotateCcw size={13}/> Sort another batch</button>
                                </div>
                                {selectedFiles.length>0&&<p className="mt-2 text-[11px] text-[#6B6F62]">ZIP is built in your browser from this session&apos;s selected files; it includes copies and a rename log. Close or reload the tab and select the files again to export.</p>}
                              </div>
                            )}
                            <p className="text-[11px] text-[#77796F] flex gap-1.5 mt-2.5 leading-snug"><ShieldCheck size={13} className="text-[#5E8C4A] shrink-0"/> Original photos are never changed or deleted. Selected files stay in your browser; sorting history saves names and decisions.</p>
                          </div>
                          <div className="rounded-2xl bg-[#2E3436] text-[#CFCABB] p-4 text-[12px] leading-relaxed">
                            <p className="text-[#E8E4D8] font-bold flex items-center gap-2"><Eye size={14}/> What just replaced what</p>
                            <p className="mt-1.5">This one screen replaces: <span className="font-mono2 text-[#F0C987]">--input --output --threshold --categories --dry-run</span>, a pip install, and a trip to the file manager to check the result. That&apos;s the whole identity in one gesture.</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!loading && view==="categories" && (
                <div className="fade-up px-5 sm:px-8 py-7">
                  <p className="text-xs font-bold tracking-wider text-[#5E8C4A]">FROM DEFAULT_CATEGORIES IN ORGANIZE_PHOTOS.PY — NOW CHIPS, NOT A TEXTBOX</p>
                  <h2 className="text-3xl font-black mt-1">Categories it can file into</h2>
                  <p className="text-[#4C5049] mt-2 max-w-2xl">The original 48, carried over exactly. Switch off the ones you never sell (fewer choices = surer AI), and add your own — the prototype sorts using this list immediately.</p>
                  <div className="flex flex-wrap gap-2.5 mt-5">
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-[#D5D1C4] px-3 flex-1 min-w-[220px]"><Search size={16} className="text-[#77796F]"/><input value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Search categories…" className="flex-1 py-2.5 text-sm outline-none bg-transparent"/></div>
                    <input value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCat()} placeholder="New category — e.g. vinyl records" className="rounded-xl bg-white border border-[#D5D1C4] px-3 py-2.5 text-sm min-w-[220px]"/>
                    <button onClick={addCat} className="rounded-xl bg-[#5E8C4A] text-white font-bold px-4 flex items-center gap-2"><Plus size={16}/> Add</button>
                  </div>
                  <p className="text-sm font-bold mt-5">{activeCats.length} of {cats.length} active</p>
                  {[...new Set(cats.map(c=>c.groupLabel))].map(g=>{
                    const inGroup=cats.filter(c=>c.groupLabel===g && c.name.includes(catSearch.toLowerCase())); if(!inGroup.length) return null;
                    return (
                      <div key={g} className="mt-4">
                        <p className="text-xs font-black tracking-wider text-[#6B6F62]">{g.toUpperCase()}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {inGroup.map(c=>(
                            <span key={c.id} className={`inline-flex items-center gap-2 rounded-full pl-3 pr-1.5 py-1.5 text-sm font-semibold border ${c.isActive?"bg-[#E3EFD3] border-[#B9CFA0] text-[#2E4A24]":"bg-white border-[#D5D1C4] text-[#A00] text-[#9AA08F] line-through"}`}>
                              {c.name}{!c.isDefault && <span className="no-underline text-[10px] bg-[#FBE8C8] text-[#8A5A12] rounded-full px-1.5 py-0.5 font-bold" style={{textDecoration:"none"}}>MINE</span>}
                              <button onClick={()=>toggleCat(c)} className={`rounded-full px-2 py-1 text-[11px] font-bold ${c.isActive?"bg-white text-[#3E5C31]":"bg-[#5E8C4A] text-white"}`} style={{textDecoration:"none"}}>{c.isActive?"On":"Off"}</button>
                              {!c.isDefault && <button onClick={()=>deleteCat(c)} className="rounded-full bg-white p-1 text-[#B34A3A]"><Trash2 size={12}/></button>}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!loading && view==="runs" && (
                <div className="fade-up px-5 sm:px-8 py-7">
                  <p className="text-xs font-bold tracking-wider text-[#5E8C4A]">PRINCIPLE 3 IN ACTION — EVERY RUN IS ACCOUNTED FOR AND UNDOABLE</p>
                  <h2 className="text-3xl font-black mt-1">Sorted batches</h2>
                  <p className="text-[#4C5049] mt-2">Saved to PostgreSQL, exactly as the Mint app will keep a local history. Expand a run to see every old → new name (your _snapsort_log.txt, but readable).</p>
                  <div className="space-y-3 mt-5">
                    {batches.map(b=>{
                      const open=expandedRun===b.id; const rows=photosByBatch[b.id]||[];
                      const folderMap=new Map<string,PhotoRow[]>(); rows.forEach(r=>{if(!folderMap.has(r.folderName))folderMap.set(r.folderName,[]);folderMap.get(r.folderName)!.push(r);});
                      return (
                        <div key={b.id} className="rounded-xl bg-white border border-[#E2DECF] overflow-hidden">
                          <button onClick={()=>setExpandedRun(open?null:b.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left flex-wrap">
                            <Folder size={20} className="text-[#D99B3F]"/><span className="font-bold">{b.name}</span>
                            <span className="text-xs bg-[#E3EFD3] text-[#3E5C31] font-bold rounded-full px-2 py-0.5">{b.total} photos → {b.folders} folders</span>
                            <span className="text-xs text-[#77796F] font-mono2 hidden md:inline">{b.sourceLabel} → {b.destLabel}</span>
                            <span className="ml-auto text-xs text-[#77796F] flex items-center gap-2">{fmtDate(b.createdAt)}{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</span>
                          </button>
                          {open && <div className="px-4 pb-4 grid md:grid-cols-2 gap-3">{[...folderMap.entries()].map(([f,items])=>(
                            <div key={f} className="rounded-lg bg-[#FBFAF6] border border-[#EFEBDD] p-3"><p className="font-bold text-sm flex items-center gap-2"><FolderOpen size={15} className="text-[#D99B3F]"/>{f} <span className="font-normal text-xs text-[#77796F]">{items.length}</span></p>
                              {items.map(r=><p key={r.id} className="font-mono2 text-[11px] mt-1.5 truncate"><span className="text-[#9A6B32]">{r.originalName}</span> → <strong>{r.newName}</strong> <span className="text-[#77796F]">({Math.round(r.confidence*100)}% · {r.method})</span></p>)}
                            </div>))}
                            {!rows.length && <p className="text-sm text-[#77796F]">No photo rows stored for this run.</p>}
                          </div>}
                        </div>
                      );
                    })}
                    {!batches.length && <p className="text-[#77796F] bg-white border border-dashed border-[#D5D1C4] rounded-xl p-8 text-center">Nothing sorted yet. The founding Bose batch will appear here after seeding.</p>}
                  </div>
                </div>
              )}

              {!loading && view==="decisions" && (
                <div className="fade-up px-5 sm:px-8 py-7">
                  <p className="text-xs font-bold tracking-wider text-[#5E8C4A]">SO NOTHING GETS SETTLED ACCIDENTALLY BY THE NEXT LINE OF CODE</p>
                  <h2 className="text-3xl font-black mt-1">Decisions log</h2>
                  <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 mt-5 items-start">
                    <div className="space-y-3">
                      {decisions.map(d=>(
                        <div key={d.id} className={`rounded-xl border p-4 bg-white ${d.status==="open"?"border-[#E8C98A]":"border-[#E2DECF]"}`}>
                          <div className="flex items-start gap-2"><p className="font-bold leading-snug">{d.title}</p><button onClick={()=>cycleDecision(d)} className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${d.status==="open"?"bg-[#FBE8C8] text-[#8A5A12]":"bg-[#E3EFD3] text-[#3E5C31]"}`}>{d.status.toUpperCase()} · click to flip</button></div>
                          {d.context && <p className="text-[13px] text-[#4C5049] leading-relaxed mt-1.5"><strong className="text-[#6B6F62]">Why it came up:</strong> {d.context}</p>}
                          {d.decision ? <p className="text-[13px] leading-relaxed mt-1.5 bg-[#FBFAF6] rounded-lg px-3 py-2 border border-[#EFEBDD]"><strong className="text-[#3E5C31]">Decided:</strong> {d.decision}</p> : <p className="text-[13px] text-[#8A5A12] mt-1.5 flex items-center gap-1.5"><CircleHelp size={14}/> Still open — needs an owner and a date.</p>}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-[#2E3436] text-white p-5 sticky top-4">
                      <p className="font-black">Record a decision</p><p className="text-[13px] text-[#CFCABB] mt-1">Future-you, mid-build on Mint, will want to know <em>why</em>.</p>
                      <input value={dTitle} onChange={e=>setDTitle(e.target.value)} placeholder="Decision title…" className="w-full mt-4 rounded-lg bg-white/10 border border-white/15 px-3 py-2.5 text-sm placeholder:text-[#8E968C] outline-none"/>
                      <textarea value={dCtx} onChange={e=>setDCtx(e.target.value)} placeholder="Why it came up…" rows={3} className="w-full mt-2 rounded-lg bg-white/10 border border-white/15 px-3 py-2.5 text-sm placeholder:text-[#8E968C] outline-none"/>
                      <textarea value={dDec} onChange={e=>setDDec(e.target.value)} placeholder="What we decided (leave empty if open)…" rows={3} className="w-full mt-2 rounded-lg bg-white/10 border border-white/15 px-3 py-2.5 text-sm placeholder:text-[#8E968C] outline-none"/>
                      <select value={dStatus} onChange={e=>setDStatus(e.target.value)} className="w-full mt-2 rounded-lg bg-[#3A4346] border border-white/15 px-3 py-2.5 text-sm"><option value="open">Open — not decided yet</option><option value="decided">Decided</option></select>
                      <button onClick={addDecision} className="w-full mt-3 rounded-xl bg-[#92B372] text-[#1E2C17] font-black py-3">Save to the log</button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && view==="export" && (
                <div className="fade-up px-5 sm:px-8 py-7">
                  <p className="text-xs font-bold tracking-wider text-[#5E8C4A]">TAKE THE IDENTITY WITH YOU</p>
                  <h2 className="text-3xl font-black mt-1">Export the document</h2>
                  <p className="text-[#4C5049] mt-2 max-w-2xl leading-relaxed">One Markdown file, generated live from the database — including your edits, active categories and decisions. On Mint: save it in <span className="font-mono2 text-sm">~/Documents</span>, open it in the Text Editor or a Markdown viewer, and build against it. (Yes — copying it there is a drag-and-drop in Files. Still no terminal.)</p>
                  <div className="flex flex-wrap gap-2.5 mt-5">
                    <a href="/api/export" className="inline-flex items-center gap-2 rounded-xl bg-[#5E8C4A] text-white font-black px-5 py-3"><Download size={17}/> Download SnapSort-Identity-Document.md</a>
                    <button onClick={()=>{navigator.clipboard.writeText(exportText);flash("Whole document copied — paste it anywhere.");}} className="inline-flex items-center gap-2 rounded-xl bg-white border border-[#D5D1C4] font-bold px-5 py-3"><Copy size={17}/> Copy all</button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-6">
                    {[{i:<Store size={18}/>,t:"For the build",d:"Hand it to whoever writes the GTK app (even if that's you + an AI assistant). Every screen should trace back to a section."},
                      {i:<Camera size={18}/>,t:"For testing",d:"Section 11's founding test: the mixed Bose batch. If it files itself and only the ambiguous photos ask for help, the identity is working."},
                      {i:<Wallet size={18}/>,t:"For selling",d:"Free, offline, no account. Monetisation — if ever — must never add a login wall in front of someone's own photos."}].map(c=>(
                      <div key={c.t} className="rounded-xl bg-white border border-[#E2DECF] p-4"><span className="inline-flex p-2 rounded-lg bg-[#E3EFD3] text-[#3E5C31]">{c.i}</span><p className="font-bold mt-2">{c.t}</p><p className="text-[13px] text-[#4C5049] leading-relaxed mt-1">{c.d}</p></div>
                    ))}
                  </div>
                  <pre className="mt-6 rounded-xl bg-[#2E3436] text-[#D8D3C4] p-5 font-mono2 text-[12px] leading-relaxed overflow-auto max-h-[520px] whitespace-pre-wrap">{exportText||"Generating…"}</pre>
                </div>
              )}
            </main>
          </div>
        </div>
        <p className="text-center text-[#8E968C] text-xs mt-4">SnapSort Identity Document · Grounded in the original Photo Organizer chat, organize_photos.py (CLIP · 48 categories · brand dictionary) and photo_organizer_gui.py · Rebuilt for Linux Mint, for humans from Windows.</p>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#2E3436] text-white font-semibold text-sm rounded-xl px-5 py-3.5 shadow-2xl flex items-center gap-2 fade-up"><CheckCircle2 size={17} className="text-[#92B372]"/>{toast}</div>}
    </div>
  );
}
