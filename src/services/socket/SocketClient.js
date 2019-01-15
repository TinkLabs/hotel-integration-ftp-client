import EventEmitter from 'events';
import io from 'socket.io-client';

export default class SocketClient extends EventEmitter {
  constructor(systemCode) {
    super();
    this.socket = null;
    this.systemCode = systemCode;

    this.initSocket();
  }

  initSocket() {
    this.socket = io(process.env.SOCKET_URL, {
      path: process.env.SOCKET_PATH,
      query: {
        token: process.env.SOCKET_TOKEN,
        systemCode: this.systemCode,
      },
    });

    this.socket.on('connect', () => {
      this.emit('connect');
    });

    this.socket.on('disconnect', () => {
      this.emit('disconnect');
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });

    this.socket.on('connect_error', (error) => {
      this.emit('error', error);
    });

    this.socket.on('reconnect_error', (error) => {
      this.emit('error', error);
    });
  }

  // send data to pms
  send(raw) {
    const data = (typeof raw === 'string') ? { data: raw } : raw;

    this.socket.emit('ftp_data', data);// TODO
    this.emit('send', JSON.stringify(data));
  }

  close() {
    this.socket.close();
  }
}
