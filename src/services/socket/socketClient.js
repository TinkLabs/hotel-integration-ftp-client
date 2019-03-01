import EventEmitter from 'events';
import io from 'socket.io-client';

export default class SocketClient extends EventEmitter {
  constructor(integrationId, systemCode, token) {
    super();
    this.socket = null;
    this.token = token;
    this.systemCode = systemCode;
    this.integration_id = integrationId;

    this.initSocket();
  }

  // send data to pms
  send(raw) {
    const data = { event: 'RESERVATIONS', data: raw };

    this.socket.emit('pms_data', data);
    return true;
  }

  initSocket() {
    this.socket = io(process.env.SOCKET_URL, {
      path: process.env.SOCKET_PATH,
      query: {
        token: this.token,
      },
    });

    // add listener
    this.socket.on('connect', () => {
      this.emit('connect');
    });

    this.socket.on('disconnect', () => {
      this.emit('disconnect');
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
      console.log('error', error);
    });

    this.socket.on('connect_error', (error) => {
      this.emit('error', error);
      console.log('error', error);
    });

    this.socket.on('reconnect_error', (error) => {
      this.emit('error', error);
      console.log('error', error);
    });
  }

  close() {
    this.socket.close();
  }
}
