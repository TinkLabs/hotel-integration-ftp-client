import EventEmitter from 'events';
import Chalk from 'chalk';
import { parser } from './helpers';
import SftpClient from '../services/ftp/sftpClient'
import nReadLines from 'n-readlines'
import readline from "readline"
import fs from "fs"

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

  async getDataByChunk(fileName, chunkSize, cb) {
    const setting = this.fileConfig;

    // get remote data
    if (!fileName.endsWith('.txt')) {
      console.log(` fileName with ${fileName} is not need to read`);
      return;
    }

    let localFile = await this.ftp.downloadFile(fileName);

    let totelLine = await fileLineTotel(localFile, setting.recordSplit)
    let totelRecordCnt = totelLine - setting.ignoredTop - setting.ignoredBot
    let totelChunkCnt = Math.ceil(totelRecordCnt / chunkSize);

    let rl = new nReadLines(localFile, {newLineCharacter:setting.recordSplit});
    let line, buf = "";
    let i = 0, readedCnt = 0, chunkSeq = 0, lineNum = 0;

    console.log("chunk file:", localFile, "totelLine:", totelLine, "totelRecordCnt:", totelRecordCnt)
    while (line = rl.next()) {

      lineNum++;
      if (lineNum <= setting.ignoredTop || lineNum > totelLine - setting.ignoredBot) {
        continue;
      }

      // console.log(i);
      buf += (buf == "" ? line : setting.recordSplit + line );
      i++; readedCnt++;

      if (i >= chunkSize || readedCnt == totelRecordCnt) {
        chunkSeq++;
        let raw = buf; buf = ""; i = 0;

        let chunkRecord = parser(
          raw,
          0, // top already ingored.
          0, // bot already ingored too.
          setting.recordSplit, setting.fieldSplit,
          setting.dataSchema,
        );

        console.log("parser chunk:", chunkSeq, "last record:", readedCnt, "totelChunkCnt:", totelChunkCnt);
        await cb(chunkRecord, chunkSeq, totelRecordCnt, totelChunkCnt)
      }
    }

    fs.unlinkSync(localFile);
    console.log("unlink localFile", localFile)
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

async function fileLineTotel2(fileName) {
  return new Promise((resolve, reject) => {
      let i = 0;
      let rl = readline.createInterface({input: fs.createReadStream(fileName)})
      
      rl.on("error", (err)=> {reject(err);})
      rl.on("line", ()=>{i++;})
      rl.on("close", () => {resolve(i);})
  })
}

async function fileLineTotel(fileName, newLineCharacter) {
  const lf = newLineCharacter.charCodeAt(0);
  return new Promise((resolve, reject) => {
      var i;
      var count = 0;
      fs.createReadStream(fileName)
      .on('data', function(chunk) {
          for (i=0; i < chunk.length; ++i)
          if (chunk[i] == lf) count++;
      })
      .on('end', function() {
          resolve(count);
      });
  })
}