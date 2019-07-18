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
    // TODO remember change back to `remote` when commit
    this.remote = path.join('.', remote);
    // this.remote = 'test/cypher_import';
    this.hotelId = hotelId;
    this.s3 = new aws.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_DEFAULT_REGION,
    });

    const bucketName = 'hig2-ftp-data';
    switch (process.env.ENV_STAGE.toLowerCase()) {
      case 'prod':
        this.s3Busket = bucketName;
        break;
      case 'stg':
        this.s3Busket = `${bucketName}-staging`;
        break;
      case 'dev':
      default:
        this.s3Busket = `${bucketName}-dev`;
        break;
    }

    this.FTPConn = null;
    this.SSHConn = null;
  }

  async getDir() {
    await this.initFTPConnect();
    return new Promise((resolve, reject) => {
      this.FTPConn.readdir(this.remote, (err, list) => {
        if (err) reject(err);
        console.info(JSON.stringify(list, null, 2), '\n ');
        // return array
        resolve(list);
      });
    });
  }

  async downloadFile(fileName, encode = 'utf8') {
    await this.initFTPConnect();
    return new Promise((resolve, reject) => {
      // destination path
      const remotePath = path.join(this.remote, fileName);
      const localPath = path.join(process.env.runtimePath, `${fileName}`);
      const storePath = path.join(
        this.hotelId !== 'string' ? this.hotelId.toString() : this.hotelId,
        `${timestamp.utc('YYYYMMDDHHmmss')}_${fileName}`,
      );

      // download file
      this.FTPConn.fastGet(remotePath, localPath, (err) => {
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
            resolve(localPath);
          })
          .catch((uploadErr) => { reject(uploadErr); });
      });
    });
  }

  async deleteFile(fileName) {
    await this.initFTPConnect();
    return new Promise((resolve, reject) => {
      this.FTPConn.unlink(
        path.join(this.remote, fileName),
        (err) => {
          if (err) reject(err);
          resolve(true);
        },
      );
    });
  }

  initFTPConnect() {
    return new Promise((resolve, reject) => {
      if (this.FTPConn && this.SSHConn) {
        resolve();
      } else {
        let ssh = new ssh2.Client();
        ssh.once('ready', () => {
          ssh.sftp((err, sftp) => {
            if (err) {
              reject(err);
            }
            this.FTPConn = sftp;
            this.SSHConn = ssh;
            resolve();
          });
        }).connect(this.config);
      }
    });
  }

  closeFTPConnect() {
    if (this.FTPConn) {
      this.FTPConn.end();
    }
    if (this.SSHConn) {
      this.SSHConn.end();
    }
  }
}
