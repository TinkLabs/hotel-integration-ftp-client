import dotenv from 'dotenv';

// load the .env file
dotenv.load();

const dbConfig = {
  client: 'mysql2',
  connection: {
    host: process.env.REORDER_DB_HOST,
    port: process.env.REORDER_DB_PORT,
    user: process.env.REORDER_DB_USER,
    password: process.env.REORDER_DB_PASSWORD,
    database: process.env.REORDER_DB_DATABASE,
  },
};
const reorderKnex = require('knex')(dbConfig);

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
 * @param uniqueFileId
 * @param chunkRecordsLength
 */
function initReorderMessage(uniqueFileId, chunkRecordsLength) {
  return reorderKnex('reservation_reorder_messages').insert({
    id: uniqueFileId,
    chunk_count: chunkRecordsLength,
    chunk_received_count: 0,
    status: ENUM_REORDER_STATUS.CLIENT_SEND,
    modify_at: reorderKnex.fn.now(),
    create_at: reorderKnex.fn.now(),
  });
}

export {
  reorderKnex,
  ENUM_REORDER_STATUS,
  initReorderMessage,
};
