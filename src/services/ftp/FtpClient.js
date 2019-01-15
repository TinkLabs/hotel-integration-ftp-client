import EventEmitter from 'events';
import FTP from 'ftp';
import Promise from 'bluebird';
import readline from 'readline';

export default class FtpClient extends EventEmitter {
  constructor(ftpConfig) {
    super();

    this.ftpClinet = null;
    this.initFtp(ftpConfig);
  }

  async getFile(filePath) {
    return new Promise((resolve, reject) => {
      this.ftpClient.get(filePath, (err, stream) => {
        if (!err) { resolve(stream); } else { reject(); }
      });
    });
  }

  initFtp(ftpConfig) {
    this.ftpClient = new FTP();
    this.ftpClient.connect(ftpConfig);

    this.ftpClient.on('ready', () => {
      this.emit('connect');
    });

    this.ftpClient.on('end', () => {
      this.emit('diconnect');
    });

    this.ftpClient.on('error', (error) => {
      this.emit('error', error);
    });
  }

  static async toArray(readStream) {
    const res = [];
    try {
      const rl = readline.createInterface(readStream);
      await rl.on('line', (line) => { res.push(line); });
    } catch (error) {
      this.emit('error', error);
    }
    return res;
  }
}
