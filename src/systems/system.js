import EventEmitter from 'events';
import Chalk from 'chalk';
import fs from 'fs';
import ReadLineAsync from './readline-async';
import SftpClient from '../services/ftp/sftpClient';
import { parser } from './helpers';


async function fileLineTotal(fileName, newLineCharacter) {
  const rl = new ReadLineAsync(fileName, { separator: newLineCharacter });
  let i = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await rl.next() !== false) {
    i += 1;
  }
  return i;
}

async function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}


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

  async getFileChunkInfo(fileName, chunkSize) {
    const setting = this.fileConfig;
    let localFile = await this.ftp.downloadFile(fileName);

    let totalLine = await fileLineTotal(localFile, setting.recordSplit);
    let totalRecordCount = totalLine - setting.ignoredTop - setting.ignoredBot;
    let totalChunkCount = Math.ceil(totalRecordCount / chunkSize);

    return {
      fileName,
      localFile,
      totalLine,
      totalRecordCount,
      totalChunkCount,
      chunkSize,
    };
  }

  async chunkFile(chunkInfo, cb) {
    const setting = this.fileConfig;

    let {
      localFile, totalLine, totalRecordCount, totalChunkCount, chunkSize,
    } = chunkInfo;

    let rl = new ReadLineAsync(localFile, { separator: setting.recordSplit });
    let line;
    let buf = '';
    let i = 0;
    let readCount = 0;
    let chunkSeq = 0;
    let lineNum = 0;

    console.log('chunk file:', localFile, 'totalLine:', totalLine, 'totalRecordCount:', totalRecordCount);

    // eslint-disable-next-line no-cond-assign, no-await-in-loop
    while (line = await rl.next()) {
      if (setting.encode) {
        line = Buffer.from(line, setting.encode);
      }
      lineNum += 1;
      if (lineNum > setting.ignoredTop && lineNum <= totalLine - setting.ignoredBot) {
        buf += line;
        i += 1;
        readCount += 1;

        if (i >= chunkSize || readCount === totalRecordCount) {
          let raw = buf;
          buf = '';
          i = 0;

          let chunkRecord = parser(
            raw,
            0, // top already ingored.
            0, // bot already ingored too.
            setting.recordSplit, setting.fieldSplit,
            setting.dataSchema,
          );

          console.log('parser chunk:', chunkSeq, 'last record:', readCount, 'totalChunkCount:', totalChunkCount);
          // eslint-disable-next-line no-await-in-loop
          await cb(chunkRecord, chunkSeq, totalRecordCount);
          chunkSeq += 1;
          // eslint-disable-next-line no-await-in-loop
          await sleep(300);
        }
      }
    }
    fs.unlinkSync(localFile);
    console.log('unlink localFile', localFile);
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

  closeFtp() {
    this.ftp.closeFTPConnect();
  }
}
