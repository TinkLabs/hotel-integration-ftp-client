/* eslint-disable class-methods-use-this */
import EventEmitter from 'events';
import ssh2 from 'ssh2';
import Promise from 'bluebird';
import path from 'path';
import aws from 'aws-sdk';
import timestamp from 'time-stamp';
import fs from 'fs';

const S3_TAGGING = 'source=ftp-client';

export default class SftpClient extends EventEmitter {
  constructor(hotelId, config, remote) {
    super();

    this.config = config;
    // this.remote = path.join('.', remote);
    // TODO remember change back to `remote` when commit
    this.remote = 'test/cypher_import';
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
  }

  async getDir() {
    let conn = this.initFtp();
    return new Promise((resolve, reject) => {
      // add listener to read
      conn.once('ready', () => {
        conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          // read remote directory
          sftp.readdir(this.remote, (err, list) => {
            if (err) reject(err);
            console.info(JSON.stringify(list, null, 2), '\n ');
            // return array
            resolve(list);
          });
        });
        // sftp connection
      }).connect(this.config);
      // close sftp connection
    }).finally(() => {
      conn.end();
    });
  }

  async downloadFile(fileName, encode = 'utf8') {
    let conn = this.initFtp();
    return new Promise((resolve, reject) => {
      // add listener to read
      conn.once('ready', () => {
        conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          // destination path
          const remotePath = path.join(this.remote, fileName);
          const localPath = path.join(process.env.runtimePath, `${fileName}`);
          const storePath = path.join(
            this.hotelId !== 'string' ? this.hotelId.toString() : this.hotelId,
            `${timestamp.utc('YYYYMMDDHHmmss')}_${fileName}`,
          );

          // download file
          sftp.fastGet(remotePath, localPath, (err) => {
            if (err) reject(err);

            let stream = fs.createReadStream(localPath, { encoding: encode });
            // upload data to s3
            let s3Conf = {
              Bucket: this.s3Busket,
              Key: storePath,
              Body: stream,
              Tagging: S3_TAGGING,
            };
            this.s3.putObject(s3Conf)
              .promise()
              .then(() => {
                this.deleteFile(fileName);
                resolve(localPath);
              })
              .catch((uploadErr) => { reject(uploadErr); });
          });
        });
        // sftp connection
      })
        .connect(this.config);
      // close sftp connection
    }).finally(() => {
      conn.end();
    });
  }

  async deleteFile(fileName) {
    let conn = this.initFtp();
    return new Promise((resolve, reject) => {
      conn.once('ready', () => {
        conn.sftp((connErr, sftp) => {
          if (connErr) reject(connErr);
          sftp.unlink(
            path.join(this.remote, fileName),
            (err) => {
              if (err) reject(err);
              resolve(true);
            },
          );
        });
      })
        .connect(this.config);
    }).finally(() => {
      conn.end();
    });
  }

  initFtp() {
    let conn = new ssh2.Client();

    // TODO: add listener
    conn.on('error', (err) => {
      this.emit('error', err);
    });
    return conn;
  }
}
