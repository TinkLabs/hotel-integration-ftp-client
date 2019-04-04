import Promise from 'bluebird';
import path from 'path';

let sqlite3 = require('sqlite3')
  .verbose();

const sqlite = new sqlite3.Database(path.join(__dirname, './ftp-client-sql'), sqlite3.OPEN_READWRITE);
const STATUS = {
  WAIT_FOR_SEND: 'wait_for_send',
  SEND_FINISH: 'send_finish',
};

/**
 * init table
 */
sqlite.serialize(() => {
  sqlite.run('CREATE TABLE IF NOT EXISTS file_msg (file_id TEXT,chunk_num INT,status TEXT)');
  sqlite.run('CREATE TABLE IF NOT EXISTS file_chunk (file_id TEXT,sequence_num INT,msg TEXT,status TEXT)');
});

/**
 *
 * @param uniqueFileId
 * @param chunkRecordsLength
 */
function insertFileMessage(uniqueFileId, chunkRecordsLength) {
  return new Promise((resolve, reject) => {
    sqlite.run('INSERT INTO file_msg(file_id,chunk_num,status) VALUES(?,?)',
      [uniqueFileId, chunkRecordsLength, STATUS.WAIT_FOR_SEND], (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
  });
}

/**
 *
 * @param uniqueFileId
 * @param sequenceNum
 * @param msg
 */
function insertFileChunk(uniqueFileId, sequenceNum, msg) {
  return new Promise((resolve, reject) => {
    sqlite.run('INSERT INTO file_chunk(file_id,sequence_num,msg,status) VALUES(?,?,?,?)',
      [uniqueFileId, sequenceNum, msg, STATUS.WAIT_FOR_SEND], (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
  });
}

/**
 *
 * @param fileId
 * @returns
 * object:{file_id,chunk_num}
 */
async function selectFileMessageByUuid(fileId) {
  return new Promise((resolve, reject) => {
    sqlite.get('SELECT file_id,chunk_num FROM file_msg where file_id =?', [fileId], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}

/**
 *
 * @param fileId
 * @returns
 * object:{file_id,size}
 */
async function selectFileChunkSizeByUuid(fileId) {
  return new Promise((resolve, reject) => {
    sqlite.get('SELECT file_id,count(file_id) as size FROM file_chunk where file_id =?', [fileId], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}

async function selectFileChunkByUuidOrderBySequence(fileId) {
  return new Promise((resolve, reject) => {
    sqlite.all('SELECT file_id,sequence_num FROM file_chunk where file_id =? order by sequence_num', [fileId], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}

async function deleteDataByFileId(fileId) {
  return new Promise((resolve, reject) => {
    sqlite.run('DELETE FROM file_msg where file_id =?', [fileId], (err) => {
      if (err) {
        console.info(JSON.stringify(`delete from file_msg with FileId=${fileId} failed`, null, 2), '\n ');
        reject(err);
      }
    });

    sqlite.run('DELETE FROM file_chunk where file_id =?', [fileId], (err) => {
      if (err) {
        console.info(JSON.stringify(`delete from file_chunk with FileId=${fileId} failed`, null, 2), '\n ');
        reject(err);
      }
    });
  });
}

export {
  sqlite,
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
  deleteDataByFileId,
  selectFileChunkByUuidOrderBySequence,
};
