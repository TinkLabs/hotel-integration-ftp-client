import Promise from 'bluebird';

let sqlite3 = require('sqlite3')
  .verbose();

const sqlite = new sqlite3.Database(':memory:');

/**
 * init table
 */
sqlite.serialize(() => {
  sqlite.run('CREATE TABLE file_msg (file_id TEXT,chunk_num INT)');
  sqlite.run('CREATE TABLE file_chunk (file_id TEXT,sequence_num INT)');
});

/**
 *
 * @param uniqueFileId
 * @param chunkRecordsLength
 */
function insertFileMessage(uniqueFileId, chunkRecordsLength) {
  sqlite.run('INSERT INTO file_msg(file_id,chunk_num) VALUES(?,?)', [uniqueFileId, chunkRecordsLength], (err) => {
    if (err) {
      return console.log(err.message);
    }
    return 'insert Success';
  });
}

/**
 *
 * @param uniqueFileId
 * @param sequenceNum
 */
function insertFileChunk(uniqueFileId, sequenceNum) {
  sqlite.run('INSERT INTO file_chunk(file_id,sequence_num) VALUES(?,?)', [uniqueFileId, sequenceNum], (err) => {
    if (err) {
      return console.log(err.message);
    }
    return 'insert Success';
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

export {
  sqlite,
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
};
