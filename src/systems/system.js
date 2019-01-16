import EventEmitter from 'events';
import { parser } from './helpers';
import SftpClient from '../services/ftp/sftpClient';

export default class System extends EventEmitter {
  constructor(hotelId, ftpConfig, fileConfig) {
    super();

    this.socket = null;
    this.ftp = null;
    this.hotelId = hotelId;
    this.fileConfig = fileConfig;
    this.ftpConfig = ftpConfig;

    this.initFtp();
  }

  async getDir() {
    return this.ftp.getDir().map(data => data.filename);
  }

  async getData(fileName) {
    const setting = this.fileConfig;

    // get remote data
    let raw = await this.ftp.dowmloadFile(fileName);

    return parser(
      raw, setting.header, setting.footer,
      setting.recordSplit, setting.fieldSplit, setting.dataSchema,
    );
  }

  async deleteFile(fileName) {
    return this.ftp.deleteFile(fileName);
  }

  initFtp() {
    this.ftp = new SftpClient(
      this.hotelId,
      {
        host: this.ftpConfig.host,
        user: this.ftpConfig.user,
        password: this.ftpConfig.password,
        port: this.ftpConfig.port,
      },
      this.ftpConfig.remote,
    );

    this.ftp.on('diconnect', () => {
      this.emit('ftp.diconnect');
      console.log('ftp.diconnect');
    });

    this.ftp.on('error', (error) => {
      this.emit('ftp.error', error);
      console.log('ftp.error: ', error);
    });
  }
}
