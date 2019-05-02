import fs from 'fs';

function optionsGet(options, key, defaultValue) {
  if (options[key] === undefined) {
    return defaultValue;
  }
  return options[key];
}

class ReadLineAsync {
  constructor(fileName, options = {}) {
    this.fileName = fileName;
    this.separator = Buffer.from(optionsGet(options, 'separator', '\n'));
    this.step = optionsGet(options, 'step', 1);
    this.bufferSize = optionsGet(options, 'bufferSize', 2048);
    this.maxLineSize = optionsGet(options, 'maxLineSize', 1024 * 1024 * 1); // 1M

    // property for read.
    this.fd = null;
    this.pos = 0;
    this.readBuffer = Buffer.allocUnsafe(this.bufferSize);
    this.buffer = Buffer.allocUnsafe(this.maxLineSize);
    this.bufferN = 0;
    this.EOL = false;
  }

  async next() {
    let buff = Buffer.allocUnsafe(0);
    for (let i = 0; i < this.step; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const line = await this.readOneLine();
      if (line === false) {
        break;
      }
      buff = Buffer.concat([buff, line]);
    }
    return buff.length > 0 ? buff : false;
  }

  /**
   * Don't Call Me, I am a private method. Please use next().
   */
  async readOneLine() {
    let index = -1;
    do {
      let data = this.buffer.slice(0, this.bufferN);
      if (!this.EOL && !data.includes(this.separator)) {
        // eslint-disable-next-line no-await-in-loop
        if (await this.read() === 0) {
          this.EOL = true;
        }
      }
      data = this.buffer.slice(0, this.bufferN);
      index = data.indexOf(this.separator);
    } while (index === -1 && !this.EOL);

    if (this.EOL && index === -1 && this.bufferN > 0) {
      const line = Buffer.from(this.buffer.slice(0, this.bufferN));
      this.bufferN = 0;
      return line;
    }

    if (index === -1) {
      return false;
    }

    index += this.separator.length;
    const line = Buffer.from(this.buffer.slice(0, index));

    this.buffer.copy(this.buffer, 0, index, this.bufferN);
    this.bufferN -= line.length;

    return line;
  }

  /**
   * Don't Call Me, I am a private method.
   */
  async read() {
    if (!this.fd) {
      this.fd = await new Promise((resolve, reject) => {
        fs.open(this.fileName, 'r', (err, fd) => {
          if (err) { reject(err); }
          resolve(fd);
        });
      });
    }

    let n = 0;
    n = await new Promise((resolve, reject) => {
      fs.read(this.fd, this.readBuffer, 0, this.readBuffer.length, this.pos, (err, readSize) => {
        if (err) { reject(err); }
        resolve(readSize);
      });
    });
    if (n !== 0) {
      this.pos += n;

      // the line is to long, abandon the data before.
      if (this.bufferN + n >= this.maxLineSize) {
        this.bufferN = 0;
      }

      this.readBuffer.copy(this.buffer, this.bufferN, 0, n);
      this.bufferN += n;
    }
    return n;
  }
}

export default ReadLineAsync;
