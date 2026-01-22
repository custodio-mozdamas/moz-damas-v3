
import React, { useState, useEffect } from 'react';
import { GameRoom } from '../types';
import { supabase } from '../lib/supabase';

interface LobbyViewProps {
  onJoinGame: (room: GameRoom) => void;
  createTrigger?: number;
  userName: string;
  userAvatar: string;
}

const LobbyView: React.FC<LobbyViewProps> = ({ onJoinGame, createTrigger, userName, userAvatar }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'Ranked' | 'Casual'>('Ranked');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const [newRoomMode, setNewRoomMode] = useState<'Blitz' | 'Bullet' | 'Rapid'>('Blitz');
  const [newRoomType, setNewRoomType] = useState<'Ranked' | 'Casual'>('Ranked');

  useEffect(() => {
    fetchRooms();
    const channel = supabase
      .channel('lobby-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .or('status.eq.waiting,status.eq.playing')
      .order('created_at', { ascending: false });

    if (data) setRooms(data as any);
    setLoading(false);
  };

  useEffect(() => {
    if (createTrigger && createTrigger > 0) setIsModalOpen(true);
  }, [createTrigger]);

  const handleJoinRoom = async (room: GameRoom) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      alert("Sessão expirada. Por favor, faça login novamente.");
      return;
    }

    // Se eu sou o dono ou já estou na sala, apenas entro
    if (user.id === room.creator_id || user.id === room.opponent_id) {
      onJoinGame(room);
      return;
    }

    if (room.status !== 'waiting') {
      alert("Esta partida já começou.");
      return;
    }

    // TENTATIVA DE ENTRAR NA SALA
    // Removemos filtros excessivos aqui e deixamos a RLS do banco trabalhar
    const { data, error } = await supabase
      .from('rooms')
      .update({
        opponent_id: user.id,
        opponent_name: userName || 'Desafiante',
        status: 'playing'
      })
      .eq('id', room.id)
      .is('opponent_id', null) // Garante que ninguém entrou no milissegundo anterior
      .select()
      .maybeSingle();

    if (error) {
      console.error("Erro Supabase:", error);
      alert("Erro ao conectar: " + error.message);
    } else if (!data) {
      // Se data é null e não tem erro, a RLS ou o filtro .is('opponent_id', null) barrou
      alert("A sala foi ocupada ou você não tem permissão para entrar.");
      fetchRooms();
    } else {
      onJoinGame(data as any);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newRoom = {
      creator_id: user.id,
      creator: userName,
      mode: newRoomMode,
      time: newRoomMode === 'Blitz' ? '3 + 2' : newRoomMode === 'Bullet' ? '1 + 0' : '10 + 5',
      type: newRoomType,
      color: 'primary',
      status: 'waiting',
      current_turn: 'white'
    };

    const { data, error } = await supabase.from('rooms').insert(newRoom).select().maybeSingle();
    
    if (error) {
      alert("Erro ao criar sala: " + error.message);
    } else if (data) {
      setIsModalOpen(false);
      onJoinGame(data as any);
    }
  };

  const filteredRooms = rooms.filter(room => 
    room.type === filter && 
    room.status === 'waiting' &&
    room.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300 relative">
      <div className="bg-card-dark border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img alt="Perfil" className="w-10 h-10 rounded-full border-2 border-primary object-cover" src={userAvatar} />
            <div className="absolute -bottom-1 -right-1 bg-accent-green w-3 h-3 rounded-full border-2 border-card-dark"></div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">JOGADOR</p>
            <p className="text-sm font-bold truncate max-w-[100px]">{userName}</p>
          </div>
        </div>
        <div className="bg-slate-900 rounded-lg px-3 py-1.5 border border-slate-800 flex flex-col items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase">ELO</span>
          <span className="text-sm font-black text-primary">1200</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl">search</span>
          <input 
            className="w-full bg-slate-900 border-slate-800 rounded-xl pl-10 pr-4 h-11 text-sm focus:ring-primary focus:border-primary text-white outline-none" 
            placeholder="Buscar oponente online..." 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['Ranked', 'Casual'] as const).map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                filter === f ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {f === 'Ranked' ? 'Competitivo' : 'Amistoso'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 overflow-y-auto custom-scrollbar">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Salas Disponíveis</h3>
        {loading ? (
          <div className="text-center py-20 text-slate-600 animate-pulse">Buscando jogadores...</div>
        ) : filteredRooms.length > 0 ? (
          <div className="space-y-3">
            {filteredRooms.map((room) => (
              <div 
                key={room.id}
                className="bg-card-dark border border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:border-primary transition-all group shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800 text-primary`}>
                    <span className="material-symbols-outlined text-2xl">
                      {room.mode === 'Blitz' ? 'timer' : room.mode === 'Bullet' ? 'bolt' : 'schedule'}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{room.time}</span>
                      <span className="text-[10px] px-1.5 py-0.5 font-bold rounded bg-primary/20 text-primary">
                        {room.mode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Mestre: <span className="text-slate-300 font-bold">{room.creator}</span></p>
                  </div>
                </div>
                <button 
                  onClick={() => handleJoinRoom(room)}
                  className="px-6 py-2 bg-primary hover:bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg active:scale-95 transition-all"
                >
                  DESAFIAR
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-3xl">
             <span className="material-symbols-outlined text-5xl text-slate-800 mb-2">sports_esports</span>
             <p className="text-slate-500 font-medium">Nenhuma sala aberta no momento.</p>
             <p className="text-[10px] text-slate-700 font-bold mt-1">CRIE UMA SALA PARA OUTROS TE DESAFIAREM</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background-dark/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card-dark border border-slate-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Configurar Desafio</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Controle de Tempo</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Bullet', 'Blitz', 'Rapid'] as const).map(m => (
                    <button 
                      key={m}
                      type="button"
                      onClick={() => setNewRoomMode(m)}
                      className={`py-3 rounded-xl text-xs font-bold border transition-all ${newRoomMode === m ? 'bg-primary/20 border-primary text-primary' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['Ranked', 'Casual'] as const).map(t => (
                    <button 
                      key={t}
                      type="button"
                      onClick={() => setNewRoomType(t)}
                      className={`py-3 rounded-xl text-xs font-bold border transition-all ${newRoomType === t ? 'bg-primary/20 border-primary text-primary' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                    >
                      {t === 'Ranked' ? 'Competitivo' : 'Amistoso'}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-accent-green text-white font-black rounded-2xl shadow-lg shadow-accent-green/20 hover:bg-emerald-600 transition-all active:scale-[0.98]"
              >
                PUBLICAR DESAFIO
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LobbyView;
