import EventEmitter from 'events';
import Chalk from 'chalk';
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
    return this.ftp.getDir()
      .map(data => ({
        file_name: data.filename,
        last_modified: data.attrs.mtime,
      }));
  }

  async getData(fileName) {
    const setting = this.fileConfig;

    // get remote data
    if (!fileName.endsWith('.txt')) {
      console.log(` fileName with ${fileName} is not need to read`);
      return;
    }
    let raw = await this.ftp.downloadFile(fileName);

    return parser(
      raw,
      setting.ignoredTop, setting.ignoredBot,
      setting.recordSplit, setting.fieldSplit,
      setting.dataSchema,
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
        readyTimeout: 600000,
      },
      this.ftpConfig.remote,
    );

    this.ftp.on('diconnect', () => {
      this.emit('ftp.diconnect');
      console.log('ftp.diconnect');
    });

    this.ftp.on('error', (err) => {
      console.log(Chalk.red(new Date().toISOString(), ':'), `[FTP Error] Hotel[${this.hotelId}] `, JSON.stringify(err));
    });
  }
}
