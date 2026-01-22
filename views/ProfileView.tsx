
import React, { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ProfileViewProps {
  userId: string;
  userName: string;
  setUserName: (name: string) => void;
  userAvatar: string;
  setUserAvatar: (avatar: string) => void;
  onLogout: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ userId, userName, setUserName, userAvatar, setUserAvatar, onLogout }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updating, setUpdating] = useState(false);

  const saveProfile = async (newUsername: string) => {
    setUpdating(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername })
      .eq('id', userId);
    
    if (error) {
      alert("Erro ao salvar nome: " + error.message);
    } else {
      alert("Perfil atualizado com sucesso!");
    }
    setUpdating(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limite de tamanho para Base64 no banco (aprox 1MB para ser seguro)
    if (file.size > 1024 * 1024) {
      alert("A imagem é muito grande. Escolha uma foto de até 1MB.");
      return;
    }

    setUpdating(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: base64 })
        .eq('id', userId);
        
      if (error) {
        alert("Erro ao salvar imagem: " + error.message);
      } else {
        setUserAvatar(base64);
      }
      setUpdating(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center animate-in fade-in duration-300">
      <div className="relative group mb-6">
        <div className={`size-36 rounded-full border-4 border-primary p-1 bg-background-dark shadow-2xl shadow-primary/20 overflow-hidden relative ${updating ? 'opacity-50' : ''}`}>
           <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
           {updating && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/40">
               <div className="size-6 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
             </div>
           )}
        </div>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-2 right-2 bg-accent-green text-white p-2.5 rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95 border-4 border-background-dark"
          title="Alterar Foto"
        >
          <span className="material-symbols-outlined text-lg">photo_camera</span>
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handlePhotoUpload} 
        />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col gap-2 text-left">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nickname de Atleta</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)}
              className="flex-1 bg-slate-900 border-slate-800 rounded-2xl px-5 py-4 text-lg font-bold text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
              placeholder="Como quer ser chamado?"
            />
          </div>
          <button 
            onClick={() => saveProfile(userName)}
            disabled={updating}
            className="w-full mt-2 bg-primary py-4 rounded-2xl text-white font-black uppercase tracking-tighter shadow-xl shadow-primary/20 hover:bg-blue-600 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            ATUALIZAR DADOS
          </button>
        </div>
        
        <div className="bg-card-dark rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
           <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <span className="text-slate-400 font-bold text-xs uppercase">Pontuação ELO</span>
              <span className="text-primary font-black text-2xl italic tracking-tighter">1200</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-slate-400 font-bold text-xs uppercase">Nível de Carreira</span>
              <span className="text-accent-green font-black text-lg">PRO 1</span>
           </div>
        </div>
      </div>

      <button 
        onClick={onLogout}
        className="mt-12 text-red-500 font-black text-xs uppercase tracking-widest hover:text-red-400 flex items-center gap-2 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">logout</span>
        Finalizar Sessão
      </button>
    </div>
  );
};

export default ProfileView;
