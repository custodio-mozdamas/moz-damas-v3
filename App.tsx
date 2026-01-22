
import React, { useState, useEffect } from 'react';
import { ViewState, GameRoom } from './types';
import LoginView from './views/LoginView';
import LobbyView from './views/LobbyView';
import GameView from './views/GameView';
import RankingView from './views/RankingView';
import BottomNav from './components/BottomNav';
import ProfileView from './views/ProfileView';
import { supabase } from './lib/supabase';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.AUTH);
  const [session, setSession] = useState<any>(null);
  const [triggerCreateRoom, setTriggerCreateRoom] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<GameRoom | null>(null);
  
  const [userName, setUserName] = useState('Jogador');
  const [userAvatar, setUserAvatar] = useState('https://picsum.photos/seed/profile/200');

  useEffect(() => {
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        await fetchProfile(session.user.id);
        setCurrentView(ViewState.LOBBY);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await fetchProfile(session.user.id);
        setCurrentView(ViewState.LOBBY);
      } else {
        setCurrentView(ViewState.AUTH);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      if (data.username) setUserName(data.username);
      if (data.avatar_url) setUserAvatar(data.avatar_url);
    } else {
      // Cria perfil se não existir
      const { data: userData } = await supabase.auth.getUser();
      const defaultName = userData.user?.email?.split('@')[0] || 'Jogador';
      
      await supabase.from('profiles').upsert({
        id: userId,
        username: defaultName,
        elo: 1200,
        level: 1
      });
      setUserName(defaultName);
    }
  };

  const handleCreateRoomRequest = () => {
    if (currentView !== ViewState.LOBBY) setCurrentView(ViewState.LOBBY);
    setTriggerCreateRoom(prev => prev + 1);
  };

  const handleJoinGame = (room: GameRoom) => {
    setSelectedRoom(room);
    setCurrentView(ViewState.GAME);
  };

  const renderView = () => {
    if (!session && currentView !== ViewState.AUTH) return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <div className="size-12 border-4 border-primary border-t-transparent animate-spin rounded-full"></div>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Sincronizando Arena...</p>
      </div>
    );

    switch (currentView) {
      case ViewState.AUTH:
        return <LoginView onLogin={() => {}} />;
      case ViewState.LOBBY:
        return <LobbyView 
          onJoinGame={handleJoinGame} 
          createTrigger={triggerCreateRoom} 
          userName={userName}
          userAvatar={userAvatar}
        />;
      case ViewState.GAME:
        return <GameView 
          onBack={() => setCurrentView(ViewState.LOBBY)} 
          room={selectedRoom}
          userName={userName}
          userAvatar={userAvatar}
        />;
      case ViewState.RANKING:
        return <RankingView />;
      case ViewState.PROFILE:
        return <ProfileView 
          userId={session?.user?.id}
          userName={userName} 
          setUserName={setUserName} 
          userAvatar={userAvatar} 
          setUserAvatar={setUserAvatar}
          onLogout={() => supabase.auth.signOut()}
        />;
      default:
        return <LobbyView onJoinGame={handleJoinGame} createTrigger={triggerCreateRoom} userName={userName} userAvatar={userAvatar} />;
    }
  };

  return (
    <div className="min-h-screen bg-background-dark max-w-md mx-auto border-x border-slate-800 flex flex-col relative shadow-2xl overflow-x-hidden">
      <main className="flex-1 pb-24 overflow-y-auto custom-scrollbar">
        {renderView()}
      </main>

      {session && currentView !== ViewState.GAME && (
        <BottomNav 
          currentView={currentView} 
          setView={setCurrentView} 
          onCreateRoom={handleCreateRoomRequest}
        />
      )}
    </div>
  );
};

export default App;
