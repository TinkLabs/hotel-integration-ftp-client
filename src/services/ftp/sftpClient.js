/* eslint-disable class-methods-use-this */
import EventEmitter from 'events';
import ssh2 from 'ssh2';
import Promise from 'bluebird';
import path from 'path';
import aws from 'aws-sdk';
import timestamp from 'time-stamp';

export default class SftpClient extends EventEmitter {
  constructor(hotelId, config, remote) {
    super();

    this.conn = null;
    this.config = config;
    this.remote = path.join('.', remote);
    this.hotelId = hotelId;
    this.s3 = new aws.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION,
    });

    const busketName = 'hig2-ftp-data';
    switch (process.env.ENV_STAGE.toLowerCase()) {
      case 'prod':
        this.s3Busket = busketName;
        break;
      case 'stg':
        this.s3Busket = `${busketName}-staging`;
        break;
      case 'dev':
      default:
        this.s3Busket = `${busketName}-dev`;
        break;
    }

    this.initFtp();
  }

  async getDir() {
    return new Promise((resolve, reject) => {
      // add listener to read
      this.conn.once('ready', () => {
        this.conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          // read remote directory
          sftp.readdir(this.remote, (err, list) => {
            if (err) reject(err);
            // return array
            resolve(list);
          });
        });
        // sftp connection
      }).connect(this.config);
      // close sftp connection
    }).finally(() => { this.conn.end(); });
  }

  async dowmloadFile(fileName, encode = 'utf8') {
    return new Promise((resolve, reject) => {
      // add listener to read
      this.conn.once('ready', () => {
        this.conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          // destination path
          const remotePath = path.join(this.remote, fileName);
          const storePath = path.join(
            this.hotelId !== 'string' ? this.hotelId.toString() : this.hotelId,
            `${timestamp.utc('YYYYMMDDHHmmss')}_${fileName}`,
          );

          // download file
          sftp.readFile(remotePath, encode, (err, buff) => {
            if (err) reject(err);

            // upload data to s3
            this.s3.putObject({ Bucket: this.s3Busket, Key: storePath, Body: buff })
              .promise()
              .then(() => { resolve(buff.toString(encode).trim()); })
              .catch((uploadErr) => { reject(uploadErr); });
          });
        });
        // sftp connection
      }).connect(this.config);
      // close sftp connection
    }).finally(() => { this.conn.end(); });
  }

  async deleteFile(fileName) {
    return new Promise((resolve, reject) => {
      this.conn.once('ready', () => {
        this.conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          sftp.unlink(
            path.join(this.remote, fileName),
            (err) => { if (err) reject(err); resolve(true); },
          );
        });
      }).connect(this.config);
    }).finally(() => { this.conn.end(); });
  }

  initFtp() {
    this.conn = new ssh2.Client();

    // TODO: add listener
    this.conn.on('error', (err) => {
      this.emit('error', err);
    });
  }
}