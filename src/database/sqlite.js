import path from 'path';
import dotenv from 'dotenv';

// load the .env file
dotenv.load();

// const dbConfig = {
//   client: 'sqlite3',
//   connection: {
//     filename: path.join(__dirname, './ftp-client-sql'),
//   },
//   useNullAsDefault: false,
// };
const dbConfig = {
  client: 'mysql2',
  connection: {
    host: 'localhost',
    user: 'root',
    password: 'abc123',
    database: 'backend2',
  },
};
const reorderKnex = require('knex')(dbConfig);

// let sqlite3 = require('sqlite3').verbose();

// const sqlite = new sqlite3.Database(dbConfig.connection.filename);
// sqlite.serialize(() => {
//   sqlite.run('CREATE TABLE IF NOT EXISTS reorder_messages (id TEXT PRIMARY KEY, chunk_count INT, chunk_received_count INT, status TEXT)');
//   sqlite.run('CREATE TABLE IF NOT EXISTS reorder_message_chunks (id TEXT PRIMARY KEY, message_id TEXT, sequence INT, content TEXT)');
// });
// sqlite.close();

const ENUM_REORDER_STATUS = {
  CLIENT_SEND: 'client_send',
  REORDER_RECEIVING: 'reorder_receiving',
  REORDER_RECEIVED: 'reorder_received',
  REORDER_SENDING: 'reorder_sending',
  REORDER_FINISH: 'reorder_finish',
  REORDER_ERROR: 'reorder_error',
  CLIENT_FINISH: 'client_finish',
};

/**
 *
 * @param uniqueFileId
 * @param chunkRecordsLength
 */
function initReorderMessage(uniqueFileId, chunkRecordsLength) {
  return reorderKnex('reorder_messages').insert({
    id: uniqueFileId,
    chunk_count: chunkRecordsLength,
    chunk_received_count: 0,
    status: ENUM_REORDER_STATUS.CLIENT_SEND,
  });
}


export {
  reorderKnex,
  ENUM_REORDER_STATUS,
  initReorderMessage,
};
