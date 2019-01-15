import EventEmitter from 'events';
import { isNull } from 'util';
import { parser } from './helpers';
import SocketClient from '../services/socket/SocketClient';
import FtpClient from '../services/ftp/FtpClient';

export default class System extends EventEmitter {
  constructor(ftpConfig, ftpFilePath) {
    super();

    console.log(ftpConfig);
    this.socket = null;
    this.ftp = null;
    this.ftpFilePath = ftpFilePath;
    this.dataSchema = [];

    this.initSocket();
    this.initFtp(ftpConfig);
  }

  async getData() {
    const raw = await this.ftp.getFile(this.ftpFilePath)
      .then(stream => stream)
      .catch((error) => { this.emit('ftp.error', error); });

    if (isNull(raw)) {
      return [];
    }

    return parser(await FtpClient.toArray(raw), 3, 3, '\t', this.dataSchema);
  }

  initSocket() {
    this.socket = new SocketClient('default');

    this.socket.on('connect', () => {
      this.emit('socket.connect');
    });

    this.socket.on('disconnect', () => {
      this.emit('socket.disconnect');
    });

    this.socket.on('error', (error) => {
      this.emit('socket.error', error);
    });

    this.socket.on('connect_error', (error) => {
      this.emit('socket.connetError', error);
    });

    this.socket.on('reconnect_error', (error) => {
      this.emit('socket.reconnectError', error);
    });
  }

  initFtp(config) {
    this.ftp = new FtpClient(config);

    this.ftp.on('connect', () => {
      this.emit('ftp.connect');
    });

    this.ftp.on('diconnect', () => {
      this.emit('ftp.diconnect');
    });

    this.ftp.on('error', (error) => {
      this.emit('ftp.error', error);
    });
  }
}
