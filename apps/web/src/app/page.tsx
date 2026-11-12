"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiMutate } from "@/lib/api";

export default function Home() {
  const [fase, setFase] = useState<1 | 2 | 3>(1);
  const [gateEmail, setGateEmail] = useState("");
  const [gatePin, setGatePin] = useState("");
  const [gateShowPin, setGateShowPin] = useState(false);
  const [gateError, setGateError] = useState("");
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  const [, setIsFormOpen] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSensored, setIsSensored] = useState(true);

  const [adminClickCount, setAdminClickCount] = useState(0);
  const [lastAdminClickTime, setLastAdminClickTime] = useState(0);
  const [isAdminModeFase2, setIsAdminModeFase2] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [showAdminToast, setShowAdminToast] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [wargaList, setWargaList] = useState<Array<{id:number;nama:string;nik:string;email:string;nomorKk?:string;namaKk?:string;tempatLahir?:string;tanggalLahir?:string;jenisKelamin?:string;golonganDarah?:string;agama?:string;statusPerkawinan?:string;statusKeluarga?:string;kewarganegaraan?:string;pendidikan?:string;pekerjaan?:string;nomorHp?:string;alamat?:string;desa?:string;rt?:string;rw?:string;kecamatan?:string;kabupaten?:string;provinsi?:string;statusKependudukan?:string;statusTinggal?:string;statusWarga?:string;disabilitas?:string;bantuanSosial?:string;keterangan?:string;registeredBy?:string;createdAt?:string;updatedAt?:string}>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dashboardView, setDashboardView] = useState<"dashboard"|"dataWarga"|"laporan">("dashboard");
  const [dataWargaFilter, setDataWargaFilter] = useState("Keseluruhan Warga");
  const [dataWargaDusun, setDataWargaDusun] = useState("Semua Dusun");
  const [dataWargaShowCount, setDataWargaShowCount] = useState(10);
  const [dataWargaPage, setDataWargaPage] = useState(1);
  const [editingResident, setEditingResident] = useState<number|null>(null);

  // Officer modal - read-only monitoring (no login inside modal)

  const [loadingWarga, setLoadingWarga] = useState(true);
  const [apiError, setApiError] = useState("");
  // Server menolak operasi tulis sampai kredensial awal diganti (403).
  // State ini hanya untuk memaksa pengguna menyelesaikan penggantian lebih dulu.
  const [mustChangeSecret, setMustChangeSecret] = useState(false);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);

  const fetchWargaList = useCallback(async () => {
    setLoadingWarga(true);
    setApiError("");
    try {
      const res = await fetch("/api/warga", { credentials: "include" });
      if (res.status === 401) {
        setWargaList([]);
        setFase(1);
        setGateError("Sesi berakhir. Silakan login kembali sebagai petugas.");
        return;
      }
      if (res.status === 403) {
        const e = await res.json().catch(() => ({}));
        setWargaList([]);
        setMustChangeSecret(true);
        setIsSecretModalOpen(true);
        setApiError(e.message || "Anda harus mengganti kredensial awal terlebih dahulu.");
        return;
      }
      if (!res.ok) throw new Error(`Gagal memuat data warga (${res.status})`);
      const data = await res.json();
      setWargaList(data);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingWarga(false);
    }
  }, []);

  useEffect(() => {
    fetchWargaList();
  }, [fetchWargaList]);

  const [slots, setSlots] = useState<Array<{id:number;name:string;email:string;ip:string;active:boolean;role:"admin"|"petugas"}>>(() => {
    try {
      if (typeof window !== "undefined") {
        const s = localStorage.getItem("officerSlots");
        if (s) return JSON.parse(s);
      }
    } catch {}
    return Array.from({length:6},(_,i)=>({id:i+1,name:"",email:"",ip:"",active:false,role:"petugas" as const}));
  });
  useEffect(()=>{ if(typeof window!=="undefined") localStorage.setItem("officerSlots", JSON.stringify(slots)); },[slots]);

  const activeCount = slots.filter(s=>s.active).length;
  const activeOfficer = slots.find(s=>s.active);

  // Cek sesi cookie saat halaman dimuat (auto-login petugas & admin via JWT httpOnly cookie)
  const sessionCheckedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const profile = await res.json();
        if (!profile?.authenticated || !profile?.email) return;
        setMustChangeSecret(profile.mustChangeSecret === true);

        const isSuperAdmin = profile.role === "super_admin";
        setSlots(prev => {
          const empty = prev.find(s => !s.active);
          if (!empty) return prev;
          return prev.map(s =>
            s.id === empty.id
              ? { ...s, name: profile.nama, email: profile.email, ip: "sesi-cookie", active: true, role: "petugas" as const }
              : s,
          );
        });
        setIsAdminLoggedIn(isSuperAdmin);
        setFase(3);
        setDashboardView("dashboard");
        setIsFormOpen(true);
      } catch {
        // cookie tidak ada / server tidak terjangkau -> tetap di Fase 1
      }
    })();
  }, []);

  useEffect(()=>{
    if(fase===3 && activeCount===0 && !isAdminLoggedIn){
      setFase(2);
      setGateError("Akses terbatas — silakan verifikasi petugas terlebih dahulu di Fase 2.");
    }
  },[fase, activeCount, isAdminLoggedIn]);
  const [gateLoading, setGateLoading] = useState(false);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // 403 dipakai untuk dua sebab: token CSRF bermasalah DAN kredensial awal belum
  // diganti. Jangan sampai error CSRF salah dianggap sebagai "wajib ganti PIN".
  const isMustChangeMessage = (message: unknown): boolean => {
    const text = Array.isArray(message) ? message.join(" ") : String(message ?? "");
    return /kredensial awal|ganti kredensial/i.test(text);
  };

  const handleGateVerifikasi = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError("");
    const inputEmail = gateEmail.trim().toLowerCase();
    const inputPin = gatePin.trim();
    if(!inputEmail || !inputPin){
      setGateError("Email dan PIN wajib diisi.");
      return;
    }
    if(!isValidEmail(inputEmail)){
      setGateError("Format email tidak valid. Gunakan email yang valid (contoh: nama@email.com).");
      return;
    }
    // Nama diisi sebagai identitas tampil; otorisasi tetap ditentukan server dari akun.
    const empty = slots.find(s=>!s.active);
    if(!empty){
      setGateError(`Maksimal 6 petugas aktif bersamaan (${activeCount}/6). Tunggu slot kosong.`);
      return;
    }

    setGateLoading(true);
    try {
      const res = await fetch("/api/petugas/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inputEmail, pin: inputPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Email atau PIN salah.");
      }
      if (!data.success || !data.petugas) {
        throw new Error("Respons server tidak valid");
      }

      setSlots(prev=> prev.map(s=> s.id===empty.id ? {...s, name: data.petugas.nama, email: data.petugas.email, ip: "sesi-cookie", active:true, role:"petugas" as const} : s));
      setGatePin("");
      setFase(3);
      setIsFormOpen(true);
    } catch (err) {
      setGateError(
        err instanceof TypeError
          ? "Tidak dapat terhubung ke server. Pastikan backend berjalan."
          : err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat login",
      );
    } finally {
      setGateLoading(false);
    }
  };

  const handlePetugasLogout = async () => {
    await apiMutate("/api/petugas/logout").catch(() => {});
    setSlots(prev=> prev.map(s=> s.active ? {...s, name:"", email:"", ip:"", active:false} : s));
    setGateEmail("");
    setGatePin("");
    setGateError("");
    setDashboardView("dashboard");
    setFase(1);
  };

  const handleLogout = async (id:number)=>{
    setSlots(prev=> prev.map(s=> s.id===id? {...s, name:"", email:"", ip:"", active:false}:s));
    await apiMutate("/api/petugas/logout").catch(() => {});
  };
  const getSlotLabel = (slot: typeof slots[number])=>{
    if(slot.active && slot.name) return slot.name;
    return "Kosong (Menunggu Input Admin)";
  };

  const handleAdminTriggerClick = () => {
    const now = Date.now();
    if (now - lastAdminClickTime > 2000) {
      setAdminClickCount(1);
    } else {
      setAdminClickCount(prev => prev + 1);
    }
    setLastAdminClickTime(now);
    
    if (adminClickCount >= 4) {
      if (fase === 2) {
        setIsAdminModeFase2(true);
        setShowAdminToast(true);
        setTimeout(() => setShowAdminToast(false), 3000);
      } else {
        setIsAdminModalOpen(true);
        setShowAdminToast(true);
        setTimeout(() => setShowAdminToast(false), 3000);
      }
      setAdminClickCount(0);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    setAdminLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername.trim(), password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Kredensial tidak valid");
      }
      if (!data.success || !data.admin) {
        throw new Error("Respons server tidak valid");
      }

      setSlots(prev => {
        const empty = prev.find(s => !s.active);
        if (!empty) return prev;
        return prev.map(s =>
          s.id === empty.id
            ? { ...s, name: data.admin.username, email: data.admin.email, ip: "sesi-cookie", active: true, role: "petugas" as const }
            : s,
        );
      });

      setIsAdminLoggedIn(true);
      setIsAdminModeFase2(false);
      setIsAdminModalOpen(false);
      setAdminUsername("");
      setAdminPassword("");
      setGateError("");
      setFase(3);
      setDashboardView("dashboard");
      setShowAdminToast(true);
      setTimeout(() => setShowAdminToast(false), 3000);
    } catch (err) {
      setAdminError(
        err instanceof TypeError
          ? "Tidak dapat terhubung ke server. Pastikan backend berjalan."
          : err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat login",
      );
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await apiMutate("/api/admin/logout").catch(() => {});
    setIsAdminLoggedIn(false);
    setFase(1);
  };

  const [formData, setFormData] = useState({
    nama:"", nik:"", email:"", kk:"", namaKk:"", tempatLahir:"", tanggalLahir:"", jenisKelamin:"", golonganDarah:"",
    agama:"", statusPerkawinan:"", statusKeluarga:"", kewarganegaraan:"wni", pendidikan:"", pekerjaan:"", telepon:"",
    alamat:"", desa:"", rt:"", rw:"", kecamatan:"", kabupaten:"", provinsi:"",
    statusKependudukan:"Tetap", statusTinggal:"Menetap", statusWarga:"Aktif", disabilitas:"", bantuanSosial:"", keterangan:""
  });
  const [submitError,setSubmitError]=useState("");
  const [secretForm, setSecretForm] = useState({ current:"", next:"", confirm:"" });
  const [secretError, setSecretError] = useState("");
  const [secretLoading, setSecretLoading] = useState(false);

  const handleChangeSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecretError("");
    if (!secretForm.current || !secretForm.next || !secretForm.confirm) {
      setSecretError("Semua kolom wajib diisi.");
      return;
    }
    setSecretLoading(true);
    try {
      const isAdmin = isAdminLoggedIn;
      const url = isAdmin ? "/api/admin/change-password" : "/api/petugas/change-pin";
      const payload = isAdmin
        ? { currentPassword: secretForm.current, newPassword: secretForm.next, newPasswordConfirm: secretForm.confirm }
        : { currentPin: secretForm.current, newPin: secretForm.next, newPinConfirm: secretForm.confirm };

      const res = await apiMutate(url, {
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(", ") : data.message || "Gagal mengganti kredensial");
      }
      // Server mencabut semua sesi, jadi cookie lama tidak berlaku lagi.
      setMustChangeSecret(false);
      setIsSecretModalOpen(false);
      setSecretForm({ current:"", next:"", confirm:"" });
      setSlots(prev => prev.map(s => s.active ? {...s, name:"", email:"", ip:"", active:false} : s));
      setIsAdminLoggedIn(false);
      setFase(1);
      setApiError("");
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : "Gagal mengganti kredensial");
    } finally {
      setSecretLoading(false);
    }
  };

  const SecretModal = () => (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative z-10 overflow-hidden">
        <div className="px-6 py-5 border-b bg-amber-50">
          <h3 className="text-lg font-bold text-slate-900">Ganti {isAdminLoggedIn ? "Password" : "PIN"} Anda</h3>
          <p className="text-sm text-slate-600 mt-1">
            Demi keamanan, akun hasil pengaturan awal wajib mengganti kredensialnya sebelum dapat menambah atau mengubah data warga.
          </p>
        </div>
        <form onSubmit={handleChangeSecret} className="p-6 space-y-4">
          {secretError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{secretError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isAdminLoggedIn ? "Password Lama" : "PIN Lama"}
            </label>
            <input type="password" autoComplete="current-password" value={secretForm.current}
              onChange={e => setSecretForm(p => ({...p, current: e.target.value}))}
              className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isAdminLoggedIn ? "Password Baru" : "PIN Baru"}
            </label>
            <input type="password" autoComplete="new-password" value={secretForm.next}
              onChange={e => setSecretForm(p => ({...p, next: e.target.value}))}
              placeholder={isAdminLoggedIn ? "Minimal 12 karakter" : "Minimal 8 karakter, ada huruf dan angka"}
              className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ulangi {isAdminLoggedIn ? "Password Baru" : "PIN Baru"}</label>
            <input type="password" autoComplete="new-password" value={secretForm.confirm}
              onChange={e => setSecretForm(p => ({...p, confirm: e.target.value}))}
              className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800 leading-relaxed">
              Setelah diganti, semua sesi keluar dari perangkat ini dan Anda wajib login ulang dengan kredensial baru.
            </p>
          </div>
          <button type="submit" disabled={secretLoading}
            className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition">
            {secretLoading ? "Menyimpan..." : "Simpan Kredensial Baru"}
          </button>
        </form>
      </div>
    </div>
  );

  const updateForm=(f:string,v:string)=> setFormData(p=>({...p,[f]:v}));
  const handleEditResident=(id:number)=>{
    const resident = wargaList.find(r=>r.id===id);
    if(!resident) return;
    setFormData({
      nama:resident.nama||"", nik:resident.nik||"", email:resident.email||"", kk:resident.nomorKk||"", namaKk:resident.namaKk||"", tempatLahir:resident.tempatLahir||"", tanggalLahir:resident.tanggalLahir||"", jenisKelamin:resident.jenisKelamin||"", golonganDarah:resident.golonganDarah||"", agama:resident.agama||"", statusPerkawinan:resident.statusPerkawinan||"", statusKeluarga:resident.statusKeluarga||"", kewarganegaraan:resident.kewarganegaraan||"wni", pendidikan:resident.pendidikan||"", pekerjaan:resident.pekerjaan||"", telepon:resident.nomorHp||"", alamat:resident.alamat||"", desa:resident.desa||"", rt:resident.rt||"", rw:resident.rw||"", kecamatan:resident.kecamatan||"", kabupaten:resident.kabupaten||"", provinsi:resident.provinsi||"", statusKependudukan:resident.statusKependudukan||"Tetap", statusTinggal:resident.statusTinggal||"Menetap", statusWarga:resident.statusWarga||"Aktif", disabilitas:resident.disabilitas||"", bantuanSosial:resident.bantuanSosial||"", keterangan:resident.keterangan||""
    });
    setEditingResident(id);
    setIsFormOpen(true);
    setDashboardView("dashboard");
  };
  const cancelEdit=()=>{ setEditingResident(null); setIsFormOpen(false); };
  const handleSubmit=async (e:React.FormEvent)=>{
    e.preventDefault(); setSubmitError("");
    if(!formData.nama || !formData.nik){ setSubmitError("Nama Lengkap dan NIK wajib diisi."); return; }
    if(mustChangeSecret){ setIsSecretModalOpen(true); setSubmitError("Ganti kredensial Anda terlebih dahulu."); return; }
    const { kk: _kk, telepon: _tel, ...rest } = formData;
    const payload = {
      ...rest,
      nomorKk: _kk || undefined,
      nomorHp: _tel || undefined,
    };
    try {
      if(editingResident!==null){
        const res = await apiMutate(`/api/warga/${editingResident}`, { method: "PUT", body: JSON.stringify(payload) });
        if(!res.ok){
          const e2 = await res.json().catch(()=>({ message: "Gagal memperbarui data warga" }));
          if(isMustChangeMessage(e2.message)){ setMustChangeSecret(true); setIsSecretModalOpen(true); }
          throw new Error(e2.message || `Gagal memperbarui (${res.status})`);
        }
        await fetchWargaList();
        setEditingResident(null);
      } else {
        const res = await apiMutate("/api/warga", { method: "POST", body: JSON.stringify(payload) });
        if(!res.ok){
          const e2 = await res.json().catch(()=>({ message: "Gagal menyimpan data warga" }));
          if(isMustChangeMessage(e2.message)){ setMustChangeSecret(true); setIsSecretModalOpen(true); }
          throw new Error(e2.message || `Gagal menyimpan (${res.status})`);
        }
        await fetchWargaList();
      }
      setFormData({nama:"",nik:"",email:"",kk:"",namaKk:"",tempatLahir:"",tanggalLahir:"",jenisKelamin:"",golonganDarah:"",agama:"",statusPerkawinan:"",statusKeluarga:"",kewarganegaraan:"wni",pendidikan:"",pekerjaan:"",telepon:"",alamat:"",desa:"",rt:"",rw:"",kecamatan:"",kabupaten:"",provinsi:"",statusKependudukan:"Tetap",statusTinggal:"Menetap",statusWarga:"Aktif",disabilitas:"",bantuanSosial:"",keterangan:""});
      setIsFormOpen(false);
      setDashboardView("dataWarga");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Gagal menyimpan data warga");
    }
  };
  const handleDeleteResident=(id:number)=>{
    if(!confirm("Apakah Anda yakin ingin menghapus warga ini?")) return;
    apiMutate(`/api/warga/${id}`, { method: "DELETE" })
      .then(async res=>{
        if(res.ok) return fetchWargaList();
        const e = await res.json().catch(()=>({}));
        if(isMustChangeMessage(e.message)){ setMustChangeSecret(true); setIsSecretModalOpen(true); }
        setApiError(e.message || `Gagal menghapus (${res.status})`);
      })
      .catch(err=>setApiError(err instanceof Error ? err.message : "Gagal terhubung ke server"));
  };
  const maleCount=wargaList.filter(r=>r.jenisKelamin==="Laki-laki").length;
  const femaleCount=wargaList.filter(r=>r.jenisKelamin==="Perempuan").length;
  const displayTotal = wargaList.length;
  const displayMale = maleCount;
  const displayFemale = femaleCount;
  const tetapCount = wargaList.filter(r=>(r.statusKependudukan||"Tetap")==="Tetap").length;
  const pendatangCount = wargaList.filter(r=>r.statusKependudukan==="Pendatang").length;
  // Catatan: `filterStatus` / `filteredResidents` tidak lagi dipakai — tabel Data Warga
  // memakai filter sendiri (dataWargaFilter + searchQuery) di dalam render tbody.

  // Input style helper for contrast guarantee
  const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none";
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";
  const sectionTitleCls = "text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4";

  // Fase 1 & 2 keep top blue header
  if(fase===1 || fase===2){
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <header className="bg-[#2563eb] text-white sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <svg className="w-6 h-6 text-[#2563eb]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 
                      className="text-xl font-bold leading-none cursor-pointer hover:underline select-none"
                      onClick={handleAdminTriggerClick}
                      title="Klik untuk akses Admin"
                    >
                      Sistem Data Warga
                    </h1>
                    <span 
                      className="text-[11px] bg-white/20 border border-white/30 px-2 py-0.5 rounded-full font-semibold cursor-pointer hover:bg-white/30 select-none"
                      onClick={handleAdminTriggerClick}
                      title="Klik untuk akses Admin"
                    >
                      v2.5
                    </span>
                  </div>
                  <p className="text-blue-100 text-sm mt-0.5">Formulir Pendaftaran dan Pendataan Warga</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          {fase===1 && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12 text-center">
                <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-[#2563eb] text-xs font-semibold px-4 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-[#2563eb] rounded-full"></span>
                  Fase 1 dari 3: Portal Pendaftaran Warga Baru
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-6 leading-tight">Selamat Datang di Layanan<br/>Registrasi Kependudukan</h2>
                <p className="text-slate-500 text-sm sm:text-[15px] mt-4 max-w-2xl mx-auto leading-relaxed">
                  Layanan mandiri pendaftaran kependudukan terpadu tingkat RT/RW dan Desa. Ikuti tahapan verifikasi identitas untuk mengisi formulir resmi secara aman.
                </p>
                <button type="button" onClick={()=>setFase(2)} className="mt-8 bg-[#2563eb] hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl shadow-md hover:shadow-lg transition inline-flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer">
                  <span className="text-lg">→</span> Masuk Pendaftaran Warga Baru
                </button>
              </div>
            </div>
          )}
{fase===2 && (
            <div className="max-w-3xl mx-auto space-y-6">
              {isAdminModeFase2 ? (
                /* ===== SUPER ADMIN LOGIN FORM (Easter Egg) ===== */
                <div className="space-y-6 animate-fade-in">
                  {/* Header Card */}
                  <div className="bg-white rounded-2xl shadow-sm border-2 border-amber-400/50 p-8 sm:p-10 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-red-500/5" />
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500 animate-stripe" />
                    <div className="relative flex items-center justify-center gap-3 mb-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse-slow">
                        <span className="text-white text-2xl">🔐</span>
                      </div>
                      <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse-slow" style={{animationDelay: '0.5s'}}>
                        <span className="text-white text-2xl">🛡</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-100 to-red-100 border-2 border-amber-400 text-amber-800 text-xs font-black px-4 py-2 rounded-full tracking-widest mb-4 animate-pulse-fast">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      Fase 2 dari 3: Autentikasi Super Admin
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 bg-gradient-to-r from-amber-700 via-red-700 to-amber-700 bg-clip-text text-transparent">Gerbang Login Administrator / Super Admin</h2>
                    <p className="text-slate-600 text-sm sm:text-[15px] mt-3 max-w-2xl mx-auto leading-relaxed">Masukkan kredensial Super Administrator untuk akses penuh ke sistem.</p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-400/50 text-red-600 text-[10px] font-black px-3 py-1 rounded-full tracking-widest animate-pulse-fast">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                        MODE ADMINISTRATOR AKTIF
                      </span>
                      <span className="inline-flex items-center gap-1 bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wider">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        LEVEL 5 ACCESS
                      </span>
                    </div>
                  </div>

                  {/* Login Form Card */}
                  <div className="bg-gradient-to-br from-amber-50 via-white to-red-50 rounded-2xl border-2 border-amber-300/50 p-5 sm:p-6 shadow-lg shadow-amber-200/50 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(251,191,36,0.1)_0%,_transparent_50%),_radial-gradient(ellipse_at_bottom_left,_rgba(239,68,68,0.08)_0%,_transparent_50%)]" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 relative">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 text-amber-800">
                        <span className="w-8 h-8 bg-amber-100 border border-amber-300 rounded-lg flex items-center justify-center">🔐</span>
                        Otorisasi Super Administrator
                      </h3>
                      <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-400/50 text-red-600 text-xs font-bold px-3 py-1.5 rounded-full self-start sm:self-auto animate-pulse-fast">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                        AKSES TERBATAS
                      </span>
                    </div>
                    <form onSubmit={handleAdminLogin} className="bg-white/80 backdrop-blur-sm rounded-xl border border-amber-200/50 p-5 sm:p-6 space-y-5 relative">
                      {adminError && <div className="bg-red-50 border-2 border-red-300 text-red-800 p-3 rounded-lg text-sm animate-shake">{adminError}</div>}
                      
                      {/* Username/Email Field */}
                      <div>
                        <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 text-amber-700">
                          <span>👤</span>
                          Username / Email Admin <span className="text-red-500 text-lg">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                          </span>
                          <input value={adminUsername} onChange={e=>setAdminUsername(e.target.value)} placeholder="admin" type="text" className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-amber-400/40 focus:border-amber-500 outline-none text-base text-slate-900 placeholder:text-slate-400 bg-white transition-all" autoComplete="username" />
                        </div>
                      </div>
                      
                      {/* Password Field */}
                      <div>
                        <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2 text-amber-700">
                          <span>🔑</span>
                          Password Admin <span className="text-red-500 text-lg">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2z"/></svg>
                          </span>
                          <input value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="••••••••" type="password" className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-amber-400/40 focus:border-amber-500 outline-none text-base text-slate-900 placeholder:text-slate-400 bg-white transition-all" autoComplete="current-password" />
                        </div>
                      </div>
                      
                      {/* Info Box */}
                      <div className="bg-gradient-to-r from-amber-50 to-red-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
                        <span className="text-amber-500 mt-0.5">⚠</span>
                        <p className="text-xs sm:text-sm text-amber-800 leading-relaxed font-medium">
                          Akses khusus Super Administrator. Kredensial awal dibuat oleh seed dan wajib diganti saat pertama kali masuk. Hubungi pengelola desa bila lupa.
                        </p>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-amber-100">
                        <button type="button" onClick={()=>{setIsAdminModeFase2(false); setAdminUsername(""); setAdminPassword(""); setAdminError("");}} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3.5 border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition" disabled={adminLoading}>
                          ← Kembali ke Login Petugas
                        </button>
                        <button type="submit" disabled={adminLoading} className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 via-amber-600 to-red-600 hover:from-amber-600 hover:via-amber-700 hover:to-red-700 text-white font-black rounded-xl text-sm transition shadow-xl shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed">
                          {adminLoading ? (
                            <>
                              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              <span>Memproses...</span>
                            </>
                          ) : (
                            <>
                              <span>🔐</span> Masuk sebagai Super Administrator
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Warning Footer */}
                  <div className="bg-gradient-to-r from-amber-50 to-red-50 rounded-xl border-2 border-amber-200 p-4 text-center animate-pulse-slow">
                    <p className="text-[11px] text-red-700 font-mono tracking-widest font-bold">⚠ AKSES TERBATAS • HANYA UNTUK SUPER ADMINISTRATOR BERWENANG ⚠</p>
                    <p className="text-[10px] text-amber-700 mt-1 font-medium">Sistem pencatatan aktivitas login aktif • Semua akses diamati</p>
                  </div>
                </div>
              ) : (
                /* ===== PETUGAS LOGIN FORM (Normal) ===== */
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10 text-center">
                    <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-[#2563eb] text-xs font-semibold px-4 py-1.5 rounded-full">
                      📑 Fase 2 dari 3: Autentikasi Petugas / Operator
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-6">Gerbang Login Petugas Registrasi</h2>
                    <p className="text-slate-500 text-sm sm:text-[15px] mt-3 max-w-2xl mx-auto leading-relaxed">
                      Masukkan nama petugas dan email kedinasan atau NIK untuk membuka dan memvalidasi pengisian formulir pendaftaran warga.
                    </p>
                  </div>
                  <div className="bg-[#f1f5f9] rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center">📑</span>
                        Otorisasi Operator Kependudukan
                      </h3>
                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full self-start sm:self-auto">
                        🛡 Sesi Petugas Terverifikasi
                      </span>
                    </div>
                    <form onSubmit={handleGateVerifikasi} className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4">
                      {gateError && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">{gateError}</div>}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Kedinasan Petugas <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 6l-10 7L2 6"/></svg>
                          </span>
                          <input value={gateEmail} onChange={e=>setGateEmail(e.target.value)} placeholder="Contoh: nama.petugas@gmail.com atau NIK" className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-slate-900 placeholder:text-slate-400 bg-white ${gateError ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-slate-300 focus:ring-[#2563eb] focus:border-[#2563eb]"}`} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-sm font-medium text-slate-700">Kata Sandi / PIN Petugas <span className="text-red-500">*</span></label>
                          <button type="button" onClick={()=>{ setResetError("Fitur reset kata sandi akan datang. Hubungi administrator desa untuk bantuan."); setIsResetModalOpen(true); }} className="text-xs text-blue-600 hover:underline cursor-pointer font-medium">Lupa Kata Sandi?</button>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 002-2z"/></svg>
                          </span>
                          <input type={gateShowPin?"text":"password"} value={gatePin} onChange={e=>setGatePin(e.target.value)} placeholder="••••••••" className={`w-full pl-10 pr-11 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-slate-900 placeholder:text-slate-400 bg-white ${gateError ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-slate-300 focus:ring-[#2563eb] focus:border-[#2563eb]"}`} />
                          <button type="button" onClick={()=>setGateShowPin(!gateShowPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">{gateShowPin?"🙈":"👁"}</button>
                        </div>
                      </div>
                      <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
                        <span className="text-blue-600 mt-0.5">🛡</span>
                        <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
                          Akses terbatas: Formulir pendaftaran warga hanya dapat dibuka dan diproses oleh petugas/operator kependudukan yang sah. Maksimal 6 petugas aktif bersamaan.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button type="button" onClick={()=>setFase(1)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm transition">
                          ← Kembali ke Beranda
                        </button>
                        <button type="submit" disabled={gateLoading} className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition text-sm">
                          {gateLoading ? "Memproses..." : "👤 Verifikasi Petugas & Buka Formulir"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
        <footer className="bg-white border-t border-[#e2e8f0] mt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm">
            <p className="text-slate-600 text-xs sm:text-sm">Sistem Data Warga © 2025 Administrasi Kependudukan Terpadu.</p>
            <div className="flex items-center gap-3 text-xs sm:text-sm text-slate-600"><a href="#" className="hover:text-slate-900">Panduan Penggunaan</a><span className="text-slate-300">•</span><a href="#" className="hover:text-slate-900">Bantuan Teknis</a></div>
          </div>
        </footer>
        {/* Reset & officer modals */}
        {isModalOpen && <OfficerModal />}
        {isResetModalOpen && <ResetModal />}
      </div>
    );
  }
  // FASE 3 — DASHBOARD WITH DARK SIDEBAR (Gambar 1)
  function Sidebar(){
    return (
      <aside className="w-[280px] bg-slate-900 text-white flex flex-col shrink-0 min-h-screen">
        <div className="px-6 py-6 border-b border-slate-800">
<div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">⛊</div>
              <div>
                <h2 
                  className="text-[15px] font-bold leading-none text-white cursor-pointer hover:underline select-none"
                  onClick={handleAdminTriggerClick}
                  title="Klik untuk akses Admin"
                >
                  Sistem Data Warga v2.5
                </h2>
                <p className="text-[11px] text-slate-400 mt-1">Portal Kependudukan Terpadu</p>
              </div>
            </div>
            {mustChangeSecret && (
              <button onClick={()=>setIsSecretModalOpen(true)}
                className="mt-3 w-full flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg text-left">
                <span>⚠</span> Ganti {isAdminLoggedIn ? "Password" : "PIN"} sebelum lanjut
              </button>
            )}
        </div>
        {/* Widget Status */}
        <div className="px-4 py-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs font-semibold text-slate-300">Sesi Petugas Aktif</p>
            <p className="text-sm font-bold text-white mt-1">({activeCount}/6 Petugas Login)</p>
            <div className="flex items-center gap-2 mt-3">
              <span className={`w-2 h-2 rounded-full ${activeCount>0?"bg-emerald-400":"bg-slate-500"}`}></span>
              <span className="text-xs text-slate-400">{activeCount>0?"Aktif":"Menunggu"}</span>
            </div>
            <button onClick={()=>setIsModalOpen(true)} className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg transition">Kelola</button>
          </div>
        </div>
        {/* Navigasi Utama */}
        <div className="px-4 py-2 flex-1 overflow-y-auto">
          <p className="text-[11px] font-semibold text-slate-500 tracking-widest uppercase px-2 mb-2">Navigasi Utama</p>
          <nav className="space-y-1">
            <button onClick={()=>setDashboardView("dashboard")} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-left ${dashboardView==="dashboard"?"bg-indigo-600 text-white":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <span className="flex items-center gap-3"><span>▦</span> Ringkasan & Dashboard</span>
            </button>
            <button onClick={()=>setDashboardView("dashboard")} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left ${dashboardView==="dashboard"?"text-slate-300":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <span className="flex items-center gap-3"><span>📝</span> Formulir Pendaftaran</span>
              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">Aktif</span>
            </button>
            <button onClick={()=>setDashboardView("dataWarga")} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-left ${dashboardView==="dataWarga"?"bg-indigo-600 text-white":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <span className="flex items-center gap-3"><span>👥</span> Data Warga</span>
              <span className={`${dashboardView==="dataWarga"?"bg-white text-indigo-700":"bg-slate-700 text-white"} text-xs px-2 py-0.5 rounded-full font-bold`}>{wargaList.length}</span>
            </button>
          </nav>
          <p className="text-[11px] font-semibold text-slate-500 tracking-widest uppercase px-2 mt-6 mb-2">Administrasi Desa</p>
          <nav className="space-y-1">
            <button onClick={()=>setIsModalOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white text-sm text-left">
              <span>🔐</span> Otorisasi Petugas (Admin)
            </button>
            <button onClick={()=>setDashboardView("laporan")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left ${dashboardView==="laporan"?"bg-indigo-600 text-white font-medium":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <span>📊</span> Laporan Kependudukan
            </button>
            <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-500 text-sm"><span>⚙</span> Konfigurasi Sistem</a>
          </nav>
        </div>
        <div className="px-4 py-4 border-t border-slate-800">
          {isAdminLoggedIn ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-xl">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-xs">SA</div>
                <div>
                  <p className="text-sm font-bold text-amber-200 leading-none">Super Administrator</p>
                  <p className="text-xs text-amber-400">{activeOfficer?.name || "Admin"}</p>
                </div>
              </div>
              <button onClick={handleAdminLogout} className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2">
                <span>🚪</span> Logout Super Admin
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs">AD</div>
              <div>
                <p className="text-sm font-semibold text-white leading-none">Admin Desa Ciburial</p>
                <p className="text-xs text-slate-400">Petugas • {activeOfficer?.name || "Online"}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  function OfficerModal(){
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setIsModalOpen(false)}></div>
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto relative z-10 flex flex-col">
          {/* Header Indigo/Violet */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white relative">
            <button onClick={()=>setIsModalOpen(false)} className="absolute right-4 top-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white">✕</button>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-white">Manajemen Login Petugas</h3>
              <span className="bg-white/20 border border-white/30 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">Otorisasi Admin Desa</span>
            </div>
            <p className="text-sm text-indigo-100 mt-1">Pemantauan sesi petugas • Maksimal 6 petugas bersamaan</p>
          </div>
          <div className="p-6 space-y-5 bg-white overflow-y-auto">
            {/* Ringkasan Kuota - Read Only */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">Kuota Petugas: {activeCount} / 6 Terisi</p>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">{6-activeCount} Slot Tersedia</span>
              </div>
              <div className="flex gap-1.5 mt-3">
                {Array.from({length:6}).map((_,i)=>(
                  <div key={i} className={`flex-1 h-2 rounded-full ${i < activeCount ? "bg-indigo-600" : "bg-slate-200"}`}></div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-500 font-medium">1 Slot</span><span className="text-[10px] text-slate-500 font-medium">6 Slot</span>
              </div>
              <button onClick={()=>setIsSensored(!isSensored)} className="mt-3 w-full sm:w-auto px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50">{isSensored?"Buka Sensor":"Tutup Sensor"}</button>
            </div>

            {/* Daftar 6 Slot - Read Only Monitoring */}
            <div>
              <p className="text-sm font-bold text-slate-900 mb-3">Daftar 6 Slot Login Petugas</p>
              <div className="space-y-2">
                {slots.map(s=>(
                  <div key={s.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${s.active?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>{s.id}</span>
                      <div className="min-w-0">
                        {s.active ? (
                          <>
                            <p className="text-sm font-bold text-slate-900 truncate">Slot #{s.id} - {s.name}</p>
                            <p className="text-xs font-medium text-slate-700 truncate">{isSensored ? "••••@desa.id" : s.email} • {s.ip}</p>
                          </>
                        ) : (
                          <p className="text-sm font-medium text-slate-500">Slot #{s.id} - {getSlotLabel(s)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.active ? (
                        <>
                          <span className="bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-200">Aktif</span>
                          <button onClick={()=>handleLogout(s.id)} className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium bg-white">Logout</button>
                        </>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200">Slot Kosong</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">Login petugas hanya dapat dilakukan melalui halaman Gerbang Login (Fase 2).</p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
            <p className="text-xs font-medium text-slate-600">🔒 Akses Dilindungi Otentikasi Admin Desa</p>
            <button onClick={()=>setIsModalOpen(false)} className="px-5 py-2 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-100">Tutup Panel</button>
          </div>
        </div>
      </div>
    );
  }

  function ResetModal(){
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setIsResetModalOpen(false)}></div>
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative z-10 overflow-hidden">
          <div className="px-6 py-5 border-b bg-white">
            <h3 className="text-lg font-bold text-slate-900">Pemulihan Akun Petugas</h3>
            <p className="text-sm text-slate-500 mt-1">Masukkan Email Kedinasan / NIK Anda. Kami akan mengirimkan instruksi dan tautan reset kata sandi ke email yang terdaftar.</p>
          </div>
          <div className="p-6 space-y-4 bg-white">
            {resetSent ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">Fitur reset kata sandi sedang dalam pengembangan. Untuk sementara, silakan hubungi administrator desa untuk mengatur ulang kata sandi/PIN Anda.</div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Kedinasan / NIK <span className="text-red-500">*</span></label>
                  <input type="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="Contoh: nama@email.com atau NIK" className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none text-sm placeholder:text-slate-400" />
                </div>
                {resetError && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">{resetError}</div>}
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={()=>setIsResetModalOpen(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-xl text-sm transition">Batal</button>
              {!resetSent ? (
                <button onClick={()=>{
                  setResetError("");
                  setResetSent(true);
                  // Fitur reset password belum terhubung ke backend — jangan
                  // menampilkan pesan sukses palsu. Tampilkan status "akan datang".
                }} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition opacity-50 cursor-not-allowed" disabled>
                  Kirim Tautan Reset</button>
              ) : (
                <button onClick={()=>setIsResetModalOpen(false)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition">Tutup</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function AdminLoginModal(){
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-pulse-slow" onClick={()=>setIsAdminModalOpen(false)}></div>
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative z-10 overflow-hidden border-4 border-amber-400 ring-4 ring-amber-400/30 ring-offset-2 ring-offset-amber-400/20 animate-border-glow">
          {/* Top warning stripe */}
          <div className="h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-stripe" />
          
          <div className="px-6 py-5 border-b bg-gradient-to-r from-amber-900 via-amber-800 to-red-900 relative overflow-hidden">
            {/* Animated background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.15)_0%,_transparent_70%)] animate-pulse-slow" />
            <div className="absolute inset-0 bg-[linear-gradient(45deg,_rgba(255,255,255,0.03)_25%,_transparent_25%,_transparent_75%,_rgba(255,255,255,0.03)_75%,_rgba(255,255,255,0.03))] bg-[size:20px_20px] animate-shimmer" />
            
            <div className="relative flex items-center gap-3">
              {/* Lock icon with pulsing ring */}
              <div className="relative">
                <div className="absolute -inset-2 bg-amber-400/30 rounded-full animate-ping" />
                <div className="w-12 h-12 bg-amber-400/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-amber-400/50 relative">
                  <span className="text-amber-200 text-2xl">🔐</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
                  <span className="bg-gradient-to-r from-amber-300 to-amber-100 bg-clip-text text-transparent">GERBANG LOGIN ADMINISTRATOR</span>
                </h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1.5 bg-red-500/20 border-2 border-red-400/50 text-red-200 text-[10px] font-black px-3 py-1.5 rounded-full tracking-widest animate-pulse-fast">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse-fast"></span>
                    MODE SUPER ADMINISTRATOR
                  </span>
                  <span className="inline-flex items-center gap-1 bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wider">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                    LEVEL 5 ACCESS
                  </span>
                </div>
              </div>
            </div>
            <p className="text-sm text-amber-200/90 mt-2 font-medium">Akses penuh ke konfigurasi sistem & data master</p>
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className="bg-red-500/20 border-2 border-red-400/50 text-red-200 text-[10px] font-black px-2.5 py-1 rounded tracking-widest animate-pulse-fast">CLASSIFIED</span>
              <span className="bg-amber-400/20 border border-amber-400/30 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded tracking-wider">v2.5 Admin</span>
            </div>
          </div>
          
          <div className="p-6 space-y-5 bg-white relative">
            {/* Side accent bars */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 via-red-500 to-amber-500" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 via-red-500 to-amber-500" />
            
            <form onSubmit={handleAdminLogin} className="space-y-5 relative">
              {adminError && <div className="bg-red-50 border-2 border-red-300 text-red-800 p-3 rounded-lg text-sm animate-shake">{adminError}</div>}
              
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="text-amber-600">🔑</span>
                  Username <span className="text-red-500 text-lg">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  </span>
                  <input value={adminUsername} onChange={e=>setAdminUsername(e.target.value)} placeholder="admin" type="text" className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-amber-400/40 focus:border-amber-500 outline-none text-base text-slate-900 placeholder:text-slate-400 bg-white transition-all" autoComplete="username" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <span className="text-amber-600">🛡</span>
                  Password <span className="text-red-500 text-lg">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2z"/></svg>
                  </span>
                  <input value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="••••••••" type="password" className="w-full pl-12 pr-4 py-3.5 border-2 border-slate-300 rounded-xl focus:ring-4 focus:ring-amber-400/40 focus:border-amber-500 outline-none text-base text-slate-900 placeholder:text-slate-400 bg-white transition-all" autoComplete="current-password" />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-3 border-t border-amber-100">
                <button type="button" onClick={()=>{setIsAdminModalOpen(false); setAdminUsername(""); setAdminPassword(""); setAdminError("");}} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition border border-slate-200" disabled={adminLoading}>
                  Batal
                </button>
                <button type="submit" disabled={adminLoading} className="px-6 py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-red-600 hover:from-amber-600 hover:via-amber-700 hover:to-red-700 text-white font-black rounded-xl text-sm transition shadow-xl shadow-amber-500/40 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {adminLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>🔐</span> Masuk sebagai Super Administrator
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
          
          {/* Bottom warning bar */}
          <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-red-50 border-t-2 border-amber-200 flex items-center justify-center gap-2">
            <span className="text-[11px] text-red-700 font-mono tracking-widest animate-pulse-fast">⚠ AKSES TERBATAS • HANYA UNTUK ADMINISTRATOR BERWENANG ⚠</span>
          </div>
          
          {/* Bottom warning stripe */}
          <div className="h-2 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-stripe-reverse" />
        </div>
      </div>
    );
  }

  function AdminToast(){
    return (
      <div className="fixed bottom-6 right-6 z-[90] animate-slide-up">
        <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-red-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 border-2 border-amber-400/50 ring-2 ring-amber-400/20 ring-offset-2 ring-offset-amber-400/20 animate-border-glow relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,_rgba(255,255,255,0.05)_25%,_transparent_25%,_transparent_75%,_rgba(255,255,255,0.05)_75%,_rgba(255,255,255,0.05))] bg-[size:20px_20px] animate-shimmer" />
          <div className="relative flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-2 bg-amber-400/30 rounded-full animate-ping" />
              <span className="w-12 h-12 bg-amber-400/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-amber-400/50 relative text-2xl">🔐</span>
            </div>
            <div>
              <p className="font-black text-base tracking-tight bg-gradient-to-r from-amber-200 to-white bg-clip-text text-transparent">MODE ADMINISTRATOR TERBUKA</p>
              <p className="text-[12px] text-amber-200 font-medium">Easter egg dipicu • Akses Super Admin Level 5 Aktif</p>
            </div>
            <span className="ml-2 bg-red-500/20 border border-red-400/50 text-red-200 text-[10px] font-black px-2.5 py-1 rounded-full tracking-widest animate-pulse-fast">CLASSIFIED</span>
          </div>
        </div>
      </div>
    );
  }

  function LaporanKependudukan(){
    const maleCount = wargaList.filter(r=>r.jenisKelamin==="Laki-laki").length;
    const femaleCount = wargaList.filter(r=>r.jenisKelamin==="Perempuan").length;
    const dTotal = wargaList.length;
    const dMale = maleCount;
    const dFemale = femaleCount;

    const barData = [
      {name:"Penduduk",value:dTotal},{name:"Bulan",value:Math.max(dTotal,10)},{name:"RW",value:Math.max(Math.ceil(dTotal/3),3)},{name:"Dusun",value:Math.max(Math.ceil(dTotal/5),1)},
    ];
    const pieData = [
      {name:"Laki-Laki",value:dMale,color:"#f59e0b"},
      {name:"Perempuan",value:dFemale,color:"#ec4899"},
    ];
    const lineData = [
      {month:"Jan",value:Math.max(dTotal-10,5)},{month:"Feb",value:Math.max(dTotal-7,6)},{month:"Mar",value:Math.max(dTotal-4,8)},
      {month:"Apr",value:Math.max(dTotal-2,10)},{month:"Mei",value:dTotal},{month:"Jun",value:dTotal+2},
      {month:"Jul",value:dTotal+5},{month:"Aug",value:dTotal+3},{month:"Sep",value:dTotal+7},
      {month:"Okt",value:dTotal+10},{month:"Nov",value:dTotal+5},{month:"Des",value:dTotal+3},
    ];
    return (
      <div className="space-y-6">
        {/* Header Aksi */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Laporan Kependudukan</h2>
            <p className="text-xs text-slate-500">Laporan Kependudukan - Desa Ciburial, Tahun 2026</p>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>alert('Download Laporan - placeholder')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">📄 Download Format Excel</button>
            <button onClick={()=>window.print()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">🖨️ CETAK</button>
          </div>
        </div>

        {/* Filter Parameter */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><label className={labelCls}>Tahun Laporan</label><select className={inputCls} defaultValue="2026"><option>2026</option><option>2025</option><option>2024</option><option>2023</option></select></div>
            <div><label className={labelCls}>Bulan</label><select className={inputCls} defaultValue="Semua Bulan"><option>Semua Bulan</option><option>Januari</option><option>Februari</option><option>Maret</option><option>April</option><option>Mei</option><option>Juni</option><option>Juli</option><option>Agustus</option><option>September</option><option>Oktober</option><option>November</option><option>Desember</option></select></div>
            <div><label className={labelCls}>Dusun/RW</label><select className={inputCls} defaultValue="Semua Dusun/RW"><option>Semua Dusun/RW</option><option>RW 01</option><option>RW 02</option><option>RW 03</option></select></div>
            <div><label className={labelCls}>RT</label><select className={inputCls} defaultValue="Semua RT"><option>Semua RT</option><option>RT 01</option><option>RT 02</option><option>RT 03</option></select></div>
          </div>
        </div>

        {/* 3 Chart Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Total Penduduk</h3>
            <div className="w-full h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={barData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{fontSize:11,fill:"#475569"}} /><YAxis tick={{fontSize:11,fill:"#475569"}} /><Tooltip contentStyle={{borderRadius:8,border:"1px solid #e2e8f0"}} /><Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
          </div>
          {/* Card 2: Pie Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Distribusi Jenis Kelamin</h3>
            <div className="w-full h-[200px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${((percent||0)*100).toFixed(0)}%`}><Cell fill={pieData[0].color} /><Cell fill={pieData[1].color} /></Pie></PieChart></ResponsiveContainer></div>
            <div className="flex justify-center gap-4 mt-3">
              {pieData.map(d=>(<div key={d.name} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{backgroundColor:d.color}}></span><span className="text-xs font-semibold text-slate-700">{d.name}</span></div>))}
            </div>
          </div>
          {/* Card 3: Line Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Pertumbuhan Bulanan</h3>
            <div className="w-full h-[260px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={lineData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{fontSize:11,fill:"#475569"}} /><YAxis tick={{fontSize:11,fill:"#475569"}} /><Tooltip contentStyle={{borderRadius:8,border:"1px solid #e2e8f0"}} /><Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{r:3,fill:"#10b981"}} /></LineChart></ResponsiveContainer></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Konten Kanan */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase">PORTAL CIVIC &gt; Sistem Data Warga</p>
            <h1 className="text-lg font-bold text-slate-900 mt-1">{dashboardView==="laporan" ? "Laporan Kependudukan" : dashboardView==="dataWarga" ? "Data Warga" : "Ringkasan & Dashboard"}</h1>
            {dashboardView==="dataWarga" && <p className="text-xs text-slate-500">List data Warga Desa Hannan</p>}
            {dashboardView==="laporan" && <p className="text-xs text-slate-500">PORTAL &gt; LAPORAN KEPENDUDUKAN</p>}
          </div>
          <div className="flex items-center gap-3">
            {/* Hanya tampil di Fase 3 - Dashboard Utama */}
            {fase === 3 && (
              <button onClick={()=>setIsModalOpen(true)} className="hidden sm:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer">
                <span className={`w-2 h-2 rounded-full ${activeCount>0?"bg-emerald-400 animate-pulse":"bg-slate-500"}`}></span>
                Area Petugas ({activeCount}/6 Sesi Terisi)
              </button>
            )}
            {isAdminLoggedIn ? (
              <button onClick={handleAdminLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-full transition flex items-center gap-2 cursor-pointer">
                <span>🚪</span> Keluar / Ganti Admin
              </button>
            ) : (
              <button onClick={handlePetugasLogout} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-full transition flex items-center gap-2 cursor-pointer">
                <span>🚪</span> Keluar / Ganti Petugas
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-6 py-6 space-y-6 overflow-y-auto">
          {dashboardView==="laporan" ? (
            <LaporanKependudukan />
          ) : dashboardView==="dataWarga" ? (
            /* ===== DATA WARGA TAB - Privat Fase 3 (Gambar 1) ===== */
            <div className="space-y-4">
              {/* Header Aksi */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Data Warga</h2>
                  <p className="text-xs text-slate-500">List data Warga Desa Hannan</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={()=>{setDashboardView("dashboard"); setIsFormOpen(true);}} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg">+ Tambah Data</button>
                  <button onClick={()=>alert('Download Format Excel - placeholder')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">📄 Download Format Excel</button>
                  <button onClick={()=>alert('Upload via Excel - placeholder')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">📤 Upload via Excel</button>
                </div>
              </div>

              {/* Filter & Kontrol */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={dataWargaFilter} onChange={e=>{setDataWargaFilter(e.target.value); setDataWargaPage(1)}} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900">
                    <option>Keseluruhan Warga</option>
                    <option>Warga Tetap</option>
                    <option>Warga Pendatang</option>
                  </select>
                  <select value={dataWargaDusun} onChange={e=>{setDataWargaDusun(e.target.value); setDataWargaPage(1)}} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900">
                    <option>Semua Dusun</option>
                    <option>Dusun 01</option>
                    <option>Dusun 02</option>
                  </select>
                  <button onClick={()=>window.print()} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg">🖨️ CETAK</button>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-600">Privasi NIK/HP:</span>
                    <button onClick={()=>setIsSensored(!isSensored)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${isSensored?"bg-indigo-100 text-indigo-700 border-indigo-200":"bg-emerald-100 text-emerald-700 border-emerald-200"}`}>{isSensored?"👁️ Sensor Aktif":"👁️ Sensor Mati"}</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-slate-700 flex items-center gap-2">Tampilkan
                    <select value={dataWargaShowCount} onChange={e=>{setDataWargaShowCount(Number(e.target.value)); setDataWargaPage(1)}} className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900">
                      <option value={10}>10 Data</option>
                      <option value={25}>25 Data</option>
                      <option value={50}>50 Data</option>
                    </select>
                  </label>
                  <div className="ml-auto relative">
                    <input value={searchQuery} onChange={e=>{setSearchQuery(e.target.value); setDataWargaPage(1)}} placeholder="Cari: Ketik nama, NIK, alamat..." className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 w-72" />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                  </div>
                </div>
              </div>

              {/* Tabel Gambar 1 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">NAMA</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">NIK</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">NO KK</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">ALAMAT</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">NO HP</th>
                        <th className="px-4 py-3 text-left text-slate-700 font-bold text-xs uppercase">STATUS</th>
                        <th className="px-4 py-3 text-center text-slate-700 font-bold text-xs uppercase">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {(() => {
                          if (loadingWarga) return <tr><td colSpan={7} className="text-center py-10 text-slate-500">Memuat data warga...</td></tr>;
                          if (apiError) return <tr><td colSpan={7} className="p-4 text-red-600">{apiError}</td></tr>;
                          const filtered = wargaList.filter(r=>{
                          const q = searchQuery.toLowerCase();
                          const matchSearch = !q || r.nama.toLowerCase().includes(q) || r.nik.includes(q) || (r.alamat||"").toLowerCase().includes(q);
                          const matchFilter = dataWargaFilter==="Keseluruhan Warga" || (r.statusKependudukan||"Tetap")=== (dataWargaFilter==="Warga Tetap"?"Tetap":"Pendatang") || r.jenisKelamin===dataWargaFilter;
                          return matchSearch && matchFilter;
                        });
                        const start = (dataWargaPage-1)*dataWargaShowCount;
                        const pageData = filtered.slice(start, start+dataWargaShowCount);
                        if(pageData.length===0) return <tr><td colSpan={7} className="text-center py-10 text-slate-500 bg-white">Belum ada data warga</td></tr>;
                        return pageData.map(r=>{
                          const isTetap = (r.statusKependudukan||"Tetap")==="Tetap";
                          return (
                            <tr key={r.id} className="hover:bg-slate-50 bg-white">
                              <td className="px-4 py-3 font-bold text-slate-900">{r.nama}</td>
                              <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">{isSensored ? "XXXX-XXXX-XXXX-XXXX".slice(0, r.nik.length) : r.nik}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-900">{r.nomorKk ? (isSensored ? "XXXX-XXXX-XXXX-XXXX".slice(0, r.nomorKk.length) : r.nomorKk) : "-"}</td>
                              <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">{r.alamat || "-"}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-900">{r.nomorHp ? (isSensored ? "XXXXX" : r.nomorHp) : "-"}</td>
                              <td className="px-4 py-3"><span className="inline-flex flex-col items-start"><span className="bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-200">AKTIF</span><span className="text-[10px] text-slate-500">{isTetap?"Warga Tetap":"Warga Pendatang"}</span></span></td>
                              <td className="px-4 py-3"><div className="flex items-center justify-center gap-1.5"><button onClick={()=>handleEditResident(r.id)} className="px-2.5 py-1.5 border border-indigo-300 text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-medium">✏️ Ubah</button><button onClick={()=>handleDeleteResident(r.id)} className="px-2.5 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium">🗑️ Hapus</button></div></td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white">
                  {(() => {
                    const total = wargaList.filter(r=>{
                      const q = searchQuery.toLowerCase();
                      return !q || r.nama.toLowerCase().includes(q) || r.nik.includes(q);
                    }).length;
                    const totalPages = Math.max(1, Math.ceil(total / dataWargaShowCount));
                    const start = total===0?0:(dataWargaPage-1)*dataWargaShowCount+1;
                    const end = Math.min(dataWargaPage*dataWargaShowCount, total);
                    return (<>
                      <p className="text-xs text-slate-600">Menampilkan {start} hingga {end} dari {total} data</p>
                      <div className="flex items-center gap-1">
                        <button disabled={dataWargaPage<=1} onClick={()=>setDataWargaPage(p=>Math.max(1,p-1))} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 disabled:opacity-40 bg-white">Sebelumnya</button>
                        <span className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">1</span>
                        <button disabled={dataWargaPage>=totalPages} onClick={()=>setDataWargaPage(p=>Math.min(totalPages,p+1))} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 disabled:opacity-40 bg-white">Selanjutnya</button>
                      </div>
                    </>);
                  })()}
                </div>
              </div>
            </div>
          ) : (
          <>
          {/* 4 Cards Statistik */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Warga Terdata</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{displayTotal}</p>
              <p className="text-xs text-slate-500 mt-1">Terdaftar di sistem</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Warga Laki-Laki</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{displayMale}</p>
              <span className="inline-block mt-2 bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 rounded-full">Laki-laki</span>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Warga Perempuan</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{displayFemale}</p>
              <span className="inline-block mt-2 bg-pink-100 text-pink-700 text-xs font-semibold px-2 py-1 rounded-full">Perempuan</span>
            </div>
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Komposisi Domisili</p>
              <div className="flex gap-4 mt-3">
                <div><p className="text-xl font-bold text-slate-900">{tetapCount}</p><p className="text-xs text-slate-500">Tetap</p></div>
                <div className="w-px bg-slate-200"></div>
                <div><p className="text-xl font-bold text-slate-900">{pendatangCount}</p><p className="text-xs text-slate-500">Pendatang</p></div>
              </div>
            </div>
          </div>

          {/* Form Pendaftaran Multi-Step 5 Bagian */}
          <div id="form-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-slate-900">{editingResident!==null?"Ubah Data Warga":"Formulir Pendaftaran Warga"}</h2>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-200">Formulir Aktif</span>
              </div>
              <span className="text-xs text-slate-500 hidden sm:block">5 Bagian • Lengkapi semua field wajib *</span>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-8 bg-white">
              {/* Bagian 1 */}
              <div>
                <h3 className={sectionTitleCls}>1. Data Identitas Warga</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className={labelCls}>Nama Lengkap *</label><input value={formData.nama} onChange={e=>updateForm("nama",e.target.value)} placeholder="Nama lengkap" className={inputCls}/></div>
                  <div><label className={labelCls}>NIK *</label><input value={formData.nik} onChange={e=>updateForm("nik",e.target.value)} placeholder="16 digit" className={inputCls}/></div>
                  <div><label className={labelCls}>Email</label><input value={formData.email} onChange={e=>updateForm("email",e.target.value)} placeholder="nama@email.com" className={inputCls}/></div>
                  <div><label className={labelCls}>Nomor KK</label><input value={formData.kk} onChange={e=>updateForm("kk",e.target.value)} placeholder="Nomor KK" className={inputCls}/></div>
                  <div><label className={labelCls}>Nama Kepala Keluarga</label><input value={formData.namaKk} onChange={e=>updateForm("namaKk",e.target.value)} placeholder="Nama KK" className={inputCls}/></div>
                  <div><label className={labelCls}>Tempat Lahir</label><input value={formData.tempatLahir} onChange={e=>updateForm("tempatLahir",e.target.value)} placeholder="Tempat lahir" className={inputCls}/></div>
                  <div><label className={labelCls}>Tanggal Lahir</label><input type="date" value={formData.tanggalLahir} onChange={e=>updateForm("tanggalLahir",e.target.value)} className={inputCls}/></div>
                  <div><label className={labelCls}>Jenis Kelamin</label><select value={formData.jenisKelamin} onChange={e=>updateForm("jenisKelamin",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></div>
                  <div><label className={labelCls}>Golongan Darah</label><select value={formData.golonganDarah} onChange={e=>updateForm("golonganDarah",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="A">A</option><option value="B">B</option><option value="AB">AB</option><option value="O">O</option></select></div>
                </div>
              </div>
              {/* Bagian 2 */}
              <div>
                <h3 className={sectionTitleCls}>2. Data Pribadi & Status</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className={labelCls}>Agama</label><select value={formData.agama} onChange={e=>updateForm("agama",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="islam">Islam</option><option value="kristen">Kristen</option><option value="katolik">Katolik</option><option value="hindu">Hindu</option><option value="buddha">Buddha</option><option value="konghucu">Konghucu</option></select></div>
                  <div><label className={labelCls}>Status Perkawinan</label><select value={formData.statusPerkawinan} onChange={e=>updateForm("statusPerkawinan",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="belum-kawin">Belum Kawin</option><option value="kawin">Kawin</option><option value="cerai-hidup">Cerai Hidup</option><option value="cerai-mati">Cerai Mati</option></select></div>
                  <div><label className={labelCls}>Status Dalam Keluarga</label><select value={formData.statusKeluarga} onChange={e=>updateForm("statusKeluarga",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="kepala-keluarga">Kepala Keluarga</option><option value="istri">Istri</option><option value="anak">Anak</option><option value="lainnya">Lainnya</option></select></div>
                  <div><label className={labelCls}>Kewarganegaraan</label><select value={formData.kewarganegaraan} onChange={e=>updateForm("kewarganegaraan",e.target.value)} className={inputCls}><option value="wni">WNI</option><option value="wna">WNA</option></select></div>
                  <div><label className={labelCls}>Pendidikan</label><select value={formData.pendidikan} onChange={e=>updateForm("pendidikan",e.target.value)} className={inputCls}><option value="">Pilih</option><option value="sd">SD</option><option value="smp">SMP</option><option value="sma">SMA</option><option value="s1">S1</option><option value="s2">S2</option></select></div>
                  <div><label className={labelCls}>Pekerjaan</label><input value={formData.pekerjaan} onChange={e=>updateForm("pekerjaan",e.target.value)} placeholder="Swasta" className={inputCls}/></div>
                  <div><label className={labelCls}>Telepon</label><input value={formData.telepon} onChange={e=>updateForm("telepon",e.target.value)} placeholder="08xxxxxxxxxx" className={inputCls}/></div>
                </div>
              </div>
              {/* Bagian 3 */}
              <div>
                <h3 className={sectionTitleCls}>3. Data Alamat Domisili</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-3"><label className={labelCls}>Alamat Lengkap</label><textarea rows={2} value={formData.alamat} onChange={e=>updateForm("alamat",e.target.value)} placeholder="Jalan, desa..." className={inputCls}/></div>
                  <div><label className={labelCls}>Desa/Kelurahan</label><input value={formData.desa} onChange={e=>updateForm("desa",e.target.value)} placeholder="Desa" className={inputCls}/></div>
                  <div><label className={labelCls}>RT</label><input value={formData.rt} onChange={e=>updateForm("rt",e.target.value)} placeholder="001" className={inputCls}/></div>
                  <div><label className={labelCls}>RW</label><input value={formData.rw} onChange={e=>updateForm("rw",e.target.value)} placeholder="005" className={inputCls}/></div>
                  <div><label className={labelCls}>Kecamatan</label><input value={formData.kecamatan} onChange={e=>updateForm("kecamatan",e.target.value)} placeholder="Kecamatan" className={inputCls}/></div>
                  <div><label className={labelCls}>Kabupaten/Kota</label><input value={formData.kabupaten} onChange={e=>updateForm("kabupaten",e.target.value)} placeholder="Kabupaten" className={inputCls}/></div>
                  <div><label className={labelCls}>Provinsi</label><input value={formData.provinsi} onChange={e=>updateForm("provinsi",e.target.value)} placeholder="Provinsi" className={inputCls}/></div>
                </div>
              </div>
              {/* Bagian 4 */}
              <div>
                <h3 className={sectionTitleCls}>4. Data Administrasi</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className={labelCls}>Status Kependudukan</label><select value={formData.statusKependudukan} onChange={e=>updateForm("statusKependudukan",e.target.value)} className={inputCls}><option value="Tetap">Tetap</option><option value="Pendatang">Pendatang</option></select></div>
                  <div><label className={labelCls}>Status Tinggal</label><select value={formData.statusTinggal} onChange={e=>updateForm("statusTinggal",e.target.value)} className={inputCls}><option value="Menetap">Menetap</option><option value="Kontrak">Kontrak</option><option value="Kos">Kos</option></select></div>
                  <div><label className={labelCls}>Status Warga</label><select value={formData.statusWarga} onChange={e=>updateForm("statusWarga",e.target.value)} className={inputCls}><option value="Aktif">Aktif</option><option value="Tidak Aktif">Tidak Aktif</option></select></div>
                  <div><label className={labelCls}>Disabilitas</label><select value={formData.disabilitas} onChange={e=>updateForm("disabilitas",e.target.value)} className={inputCls}><option value="">Tidak Ada</option><option value="Fisik">Fisik</option><option value="Sensorik">Sensorik</option></select></div>
                  <div><label className={labelCls}>Bantuan Sosial</label><select value={formData.bantuanSosial} onChange={e=>updateForm("bantuanSosial",e.target.value)} className={inputCls}><option value="">Tidak Ada</option><option value="PKH">PKH</option><option value="BPNT">BPNT</option></select></div>
                </div>
              </div>
              {/* Bagian 5 */}
              <div>
                <h3 className={sectionTitleCls}>5. Data Tambahan & Catatan Layanan</h3>
                <div>
                  <label className={labelCls}>Keterangan / Catatan</label>
                  <textarea rows={3} value={formData.keterangan} onChange={e=>updateForm("keterangan",e.target.value)} placeholder="Catatan tambahan layanan..." className={inputCls}/>
                </div>
              </div>

              {submitError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{submitError}</div>}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={()=>{ if(editingResident!==null){cancelEdit();} else {setIsFormOpen(false);} }} className="px-6 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50">{editingResident!==null?"Batal Edit":"Batal"}</button>
                <button type="submit" className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow">{editingResident!==null?"Simpan Perubahan":"Mendaftar Sekarang / Simpan Data"}</button>
              </div>
            </form>
          </div>
          </>
          )}
        </main>
      </div>
      {isModalOpen && <OfficerModal />}
      {isResetModalOpen && <ResetModal />}
      {isAdminModalOpen && <AdminLoginModal />}
      {isSecretModalOpen && <SecretModal />}
      {showAdminToast && <AdminToast />}
    </div>
  );
}
