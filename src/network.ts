import Peer, { DataConnection } from 'peerjs';

export type NetRole = 'none' | 'host' | 'guest';

export interface RemotePlayerState {
  connected: boolean;
  callsign: string;
  color: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  down: boolean;
}

export interface NetCallbacks {
  onStatus: (status: string, connected: boolean) => void;
  onPeerHello: (callsign: string, color: string) => void;
  onStartMatch: () => void;
  onPacket: (data: Record<string, unknown>) => void;
  onDisconnect: () => void;
}

export class CoopNetwork {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private callbacks: NetCallbacks;

  public role: NetRole = 'none';
  public roomCode = '';

  constructor(callbacks: NetCallbacks) {
    this.callbacks = callbacks;
  }

  public createRoom(callsign: string, color: string): void {
    this.disconnect();
    this.role = 'host';
    this.roomCode = String(Math.floor(1000 + Math.random() * 8999));
    const peerId = `aetherrift-${this.roomCode}`;

    this.callbacks.onStatus(`Создание комнаты ${this.roomCode}...`, false);
    this.peer = new Peer(peerId);

    this.peer.on('open', () => {
      this.callbacks.onStatus(`Комната ${this.roomCode} готова! Ждём напарника...`, false);
    });

    this.peer.on('connection', (conn) => {
      this.conn = conn;
      this.setupConnection(conn, callsign, color);
    });

    this.peer.on('error', (err) => {
      this.callbacks.onStatus(`Ошибка сети: ${err.type}`, false);
    });
  }

  public joinRoom(code: string, callsign: string, color: string): void {
    this.disconnect();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    this.role = 'guest';
    this.roomCode = clean;

    this.callbacks.onStatus(`Подключение к комнате ${clean}...`, false);
    this.peer = new Peer();

    this.peer.on('open', () => {
      if (!this.peer) return;
      const conn = this.peer.connect(`aetherrift-${clean}`, { reliable: false });
      this.conn = conn;
      this.setupConnection(conn, callsign, color);
    });

    this.peer.on('error', (err) => {
      this.callbacks.onStatus(`Не удалось подключиться (${err.type})`, false);
    });
  }

  private setupConnection(conn: DataConnection, callsign: string, color: string): void {
    conn.on('open', () => {
      this.callbacks.onStatus(`Напарник подключён! Комната ${this.roomCode}`, true);
      this.send({ type: 'hello', callsign, color });
    });

    conn.on('data', (raw) => {
      const data = raw as Record<string, unknown>;
      if (data.type === 'hello') {
        this.callbacks.onPeerHello(String(data.callsign || 'НАПАРНИК'), String(data.color || '#ff2a85'));
      } else if (data.type === 'start') {
        this.callbacks.onStartMatch();
      } else {
        this.callbacks.onPacket(data);
      }
    });

    conn.on('close', () => {
      this.callbacks.onStatus('Напарник отключился', false);
      this.callbacks.onDisconnect();
    });
  }

  public send(data: Record<string, unknown>): void {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  public disconnect(): void {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.role = 'none';
    this.roomCode = '';
  }

  public get isConnected(): boolean {
    return Boolean(this.conn && this.conn.open);
  }
}
