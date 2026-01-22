
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoom, ViewState } from '../types';
import { supabase } from '../lib/supabase';

interface GameViewProps {
  onBack: () => void;
  room: GameRoom | null;
  userName: string;
  userAvatar: string;
}

type PieceColor = 'white' | 'red';
interface Piece { color: PieceColor; isKing: boolean; }
type BoardState = (Piece | null)[][];
interface Position { r: number; c: number; }
interface Move { from: Position; to: Position; captures: Position[]; isJump: boolean; }
type GameResult = 'white_win' | 'red_win' | 'draw' | 'surrender' | 'timeout' | null;

const GameView: React.FC<GameViewProps> = ({ onBack, room, userName, userAvatar }) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<GameRoom | null>(room);
  const [board, setBoard] = useState<BoardState>([]);
  const [turn, setTurn] = useState<PieceColor>('white');
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [gameResult, setGameResult] = useState<GameResult>(null);
  const [whiteTime, setWhiteTime] = useState(180);
  const [redTime, setRedTime] = useState(180);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myColor: PieceColor | null = roomData && currentUserId 
    ? (currentUserId === roomData.creator_id ? 'white' : 'red') 
    : null;

  // Inicializar tabuleiro
  useEffect(() => {
    if (!roomData) return;

    const initBoard = () => {
      const initialBoard: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
      for (let r = 0; r < 3; r++) { for (let c = 0; c < 8; c++) { if ((r + c) % 2 === 0) initialBoard[r][c] = { color: 'red', isKing: false }; } }
      for (let r = 5; r < 8; r++) { for (let c = 0; c < 8; c++) { if ((r + c) % 2 === 0) initialBoard[r][c] = { color: 'white', isKing: false }; } }
      return initialBoard;
    };

    if (roomData.board_state) {
      setBoard(roomData.board_state);
    } else if (currentUserId === roomData.creator_id) {
      // Se sou o criador e não tem board, eu crio e salvo
      const newBoard = initBoard();
      setBoard(newBoard);
      supabase.from('rooms').update({ board_state: newBoard }).eq('id', roomData.id).then();
    } else {
      setBoard(initBoard());
    }

    if (roomData.current_turn) setTurn(roomData.current_turn);
  }, [roomData?.id, currentUserId]);

  // Buscar usuário e escutar mudanças
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));

    if (!roomData) return;

    const channel = supabase
      .channel(`room-${roomData.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomData.id}` }, (payload) => {
        const updated = payload.new as GameRoom;
        setRoomData(updated);
        if (updated.board_state) setBoard(updated.board_state);
        if (updated.current_turn) setTurn(updated.current_turn);
        if (updated.status === 'finished' && updated.winner_id) {
          setGameResult(updated.winner_id === roomData.creator_id ? 'white_win' : 'red_win');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomData?.id]);

  // Lógica do Cronômetro
  useEffect(() => {
    if (roomData?.status !== 'playing' || gameResult) return;

    timerRef.current = setInterval(() => {
      if (turn === 'white') setWhiteTime(prev => Math.max(0, prev - 1));
      else setRedTime(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [turn, roomData?.status, gameResult]);

  const syncMoveWithSupabase = async (newBoard: BoardState, nextTurn: PieceColor) => {
    if (!roomData) return;
    await supabase
      .from('rooms')
      .update({
        board_state: newBoard,
        current_turn: nextTurn,
        last_move_at: new Date().toISOString()
      })
      .eq('id', roomData.id);
  };

  const getMovesForPiece = useCallback((currentBoard: BoardState, r: number, c: number, onlyJumps = false): Move[] => {
    const piece = currentBoard[r][c];
    if (!piece) return [];
    const moves: Move[] = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    directions.forEach(([dr, dc]) => {
      const nr = r + dr; const nc = c + dc; const jr = r + dr * 2; const jc = c + dc * 2;
      // Saltos (Capturas)
      if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8) {
        const mid = currentBoard[nr][nc]; const end = currentBoard[jr][jc];
        if (mid && mid.color !== piece.color && !end) {
          moves.push({ from: { r, c }, to: { r: jr, c: jc }, captures: [{ r: nr, c: nc }], isJump: true });
        }
      }
      // Movimento Simples
      if (!onlyJumps) {
        const isForward = piece.color === 'white' ? dr < 0 : dr > 0;
        if ((isForward || piece.isKing) && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !currentBoard[nr][nc]) {
          moves.push({ from: { r, c }, to: { r: nr, c: nc }, captures: [], isJump: false });
        }
      }
    });
    return moves;
  }, []);

  const calculateAllValidMoves = useCallback((currentBoard: BoardState, activeColor: PieceColor): Move[] => {
    let allMoves: Move[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if (piece && piece.color === activeColor) allMoves.push(...getMovesForPiece(currentBoard, r, c));
      }
    }
    const jumps = allMoves.filter(m => m.isJump);
    return jumps.length > 0 ? jumps : allMoves;
  }, [getMovesForPiece]);

  useEffect(() => {
    if (turn === myColor && board.length > 0) {
      setValidMoves(calculateAllValidMoves(board, turn));
    } else {
      setValidMoves([]);
    }
  }, [board, turn, myColor, calculateAllValidMoves]);

  const handleCellClick = (r: number, c: number) => {
    if (gameResult || turn !== myColor || roomData?.status !== 'playing') return;
    const piece = board[r][c];
    if (piece && piece.color === turn) setSelected({ r, c });
    else if (selected) {
      const move = validMoves.find(m => m.from.r === selected.r && m.from.c === selected.c && m.to.r === r && m.to.c === c);
      if (move) executeMove(move);
      else setSelected(null);
    }
  };

  const executeMove = (move: Move) => {
    const newBoard = board.map(row => [...row]);
    const piece = { ...newBoard[move.from.r][move.from.c]! };
    newBoard[move.to.r][move.to.c] = piece;
    newBoard[move.from.r][move.from.c] = null;
    
    // Tornar Dama
    if ((piece.color === 'white' && move.to.r === 0) || (piece.color === 'red' && move.to.r === 7)) {
      piece.isKing = true;
    }
    
    // Remover capturadas
    move.captures.forEach(cap => { newBoard[cap.r][cap.c] = null; });

    // Verificar se há mais capturas obrigatórias para a mesma peça (multicaptura)
    const extraJumps = move.isJump ? getMovesForPiece(newBoard, move.to.r, move.to.c, true) : [];
    
    if (extraJumps.length > 0) {
      setBoard(newBoard);
      setSelected(move.to);
      setValidMoves(extraJumps);
      syncMoveWithSupabase(newBoard, turn);
    } else {
      const nextTurn = turn === 'white' ? 'red' : 'white';
      setBoard(newBoard);
      setTurn(nextTurn);
      setSelected(null);
      syncMoveWithSupabase(newBoard, nextTurn);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // Se a sala ainda está esperando
  if (roomData?.status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark p-6 animate-in fade-in duration-500">
        <div className="bg-card-dark border border-slate-800 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="size-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-primary/20">
            <span className="material-symbols-outlined text-5xl text-primary animate-pulse">person_search</span>
          </div>
          <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tighter italic">Aguardando Oponente</h2>
          <p className="text-sm text-slate-500 mb-6">Convide um amigo ou aguarde alguém aceitar seu desafio na lista de salas.</p>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-6">
            <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">ID da Partida</p>
            <p className="text-xs font-mono text-primary truncate">{roomData.id}</p>
          </div>
          <button onClick={onBack} className="w-full py-3 bg-slate-800 text-slate-400 font-bold rounded-xl text-xs hover:text-white transition-colors">CANCELAR E VOLTAR</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-dark p-4 animate-in zoom-in-95 duration-300">
      <header className="flex justify-between items-center mb-6">
        <button onClick={onBack} className="text-slate-400 font-bold text-xs uppercase flex items-center gap-1">
          <span className="material-symbols-outlined">chevron_left</span> Sair
        </button>
        <div className="text-center">
           <h1 className="text-lg font-black text-primary tracking-tighter italic uppercase">Arena Pro</h1>
           <span className="text-[10px] text-accent-green font-bold flex items-center gap-1 justify-center">
             <span className="size-1.5 bg-accent-green rounded-full animate-ping"></span> 100% ONLINE
           </span>
        </div>
        <div className="w-12"></div>
      </header>

      {/* Oponente */}
      <div className={`bg-card-dark rounded-2xl p-4 border transition-all ${turn !== myColor ? 'border-red-500/50 shadow-lg shadow-red-500/10 scale-[1.02]' : 'border-slate-800 opacity-60'} flex justify-between items-center mb-4`}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full border-2 border-red-500 bg-slate-900 flex items-center justify-center font-bold text-white text-xs">
            {roomData?.opponent_name?.charAt(0) || roomData?.creator?.charAt(0) || 'O'}
          </div>
          <div>
            <p className="text-sm font-bold text-white truncate max-w-[120px]">
              {myColor === 'white' ? roomData?.opponent_name || 'Desafiante' : roomData?.creator}
            </p>
            <p className="text-[10px] text-slate-500 font-bold">Nível 1 • {myColor === 'white' ? 'Vermelhas' : 'Brancas'}</p>
          </div>
        </div>
        <div className={`bg-black/40 px-3 py-1.5 rounded-lg font-mono text-xl font-bold ${redTime < 30 ? 'text-red-500 animate-pulse' : 'text-slate-300'}`}>
          {formatTime(redTime)}
        </div>
      </div>

      {/* Tabuleiro */}
      <div className="aspect-square w-full grid grid-cols-8 grid-rows-8 border-[6px] border-card-dark rounded-2xl overflow-hidden shadow-2xl bg-card-dark mb-4 ring-1 ring-slate-800 relative">
        {board.length > 0 && board.map((row, r) => row.map((piece, c) => {
            const isDark = (r + c) % 2 === 0;
            const isSelected = selected?.r === r && selected?.c === c;
            const isTarget = validMoves.some(m => m.from.r === selected?.r && m.from.c === selected?.c && m.to.r === r && m.to.c === c);
            
            return (
              <div key={`${r}-${c}`} onClick={() => handleCellClick(r, c)}
                className={`relative flex items-center justify-center cursor-pointer transition-colors ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`}>
                
                {isTarget && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="size-4 rounded-full bg-primary/40 animate-ping"></div>
                  </div>
                )}
                
                {piece && (
                  <div className={`size-[85%] rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center border-b-4 border-black/30 active:scale-95
                    ${piece.color === 'white' ? 'bg-gradient-to-br from-white to-slate-200' : 'bg-gradient-to-br from-red-500 to-red-700'} 
                    ${isSelected ? 'ring-[4px] ring-primary ring-offset-2 ring-offset-slate-900 scale-110 z-10' : ''}
                  `}>
                    {piece.isKing && (
                      <span className={`material-symbols-outlined text-2xl ${piece.color === 'white' ? 'text-slate-400' : 'text-red-200'} fill-1`}>
                        grade
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
        }))}
      </div>

      {/* Você */}
      <div className={`bg-card-dark rounded-2xl p-4 border transition-all ${turn === myColor ? 'border-primary/50 shadow-lg shadow-primary/10 scale-[1.02]' : 'border-slate-800 opacity-60'} flex justify-between items-center mb-6`}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full border-2 border-primary overflow-hidden shadow-inner">
            <img src={userAvatar} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{userName} <span className="text-[10px] text-primary">(Você)</span></p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{myColor?.toUpperCase()}</p>
          </div>
        </div>
        <div className={`bg-primary/10 px-3 py-1.5 rounded-lg font-mono text-xl font-bold border border-primary/20 ${whiteTime < 30 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
          {formatTime(whiteTime)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => alert("Solicitação enviada ao oponente")} className="bg-slate-800/50 hover:bg-slate-800 p-4 rounded-2xl text-[10px] font-black uppercase text-slate-400 active:scale-95 transition-all">Propor Empate</button>
        <button onClick={() => setGameResult('surrender')} className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 p-4 rounded-2xl text-[10px] font-black uppercase text-red-500 active:scale-95 transition-all">Abandonar</button>
      </div>

      {gameResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background-dark/95 backdrop-blur-xl p-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-card-dark border border-slate-800 rounded-[40px] p-10 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent-green to-primary"></div>
             <h2 className="text-4xl font-black italic mb-4 uppercase text-white tracking-tighter">FIM DE JOGO</h2>
             <div className={`text-xl font-bold mb-8 ${gameResult.includes(myColor!) ? 'text-accent-green' : 'text-red-500'}`}>
                {gameResult.includes(myColor!) ? 'VOCÊ VENCEU!' : 'OPONENTE VENCEU!'}
             </div>
             <p className="text-slate-500 mb-8 font-medium text-sm px-4">Seu ELO e estatísticas foram atualizados. Continue treinando para subir no ranking mundial!</p>
             <button onClick={onBack} className="w-full py-5 bg-primary hover:bg-blue-600 rounded-2xl font-black text-white shadow-xl shadow-primary/20 transition-all active:scale-95">RETORNAR AO LOBBY</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
