import dotenv from 'dotenv';
import moment from 'moment';

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

const REORDER_STATUS = {
  INIT: 'reorder_init',
  RECEIVING: 'reorder_receiving',
  RECEIVED: 'reorder_received',
  PENDING: 'reorder_pending',
  SENDING: 'reorder_sending',
  FINISH: 'reorder_finish',
  ERROR: 'reorder_error',
  TIMEOUT: 'reorder_timeout',

  CHUNK_SEND: 'chunk_send',
  CHUNK_RECEIVED: 'chunk_received',
  CHUNK_FINISH: 'chunk_finish',
};

function mysqlNow() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

/**
 * @param uniqueFileId
 * @param chunkRecordsLength
 */
function initReorderMessage(hotelId, uniqueFileId, chunkRecordsLength) {
  return reorderKnex('reservation_reorder_messages').insert({
    id: uniqueFileId,
    hotel_id: hotelId,
    chunk_count: chunkRecordsLength,
    chunk_received_count: 0,
    status: REORDER_STATUS.INIT,
    modify_at: mysqlNow(),
    create_at: mysqlNow(),
  });
}

function insertReorderMessageChunk(chunkId, msgId, seq, raw) {
  return reorderKnex('reservation_reorder_message_chunks').insert({
    id: chunkId,
    message_id: msgId,
    sequence: seq,
    raw,
    status: REORDER_STATUS.CHUNK_SEND,
    create_at: mysqlNow(),
    modify_at: mysqlNow(),
  });
}

async function nextMessage(hotelId) {
  let record = await reorderKnex('reservation_reorder_messages')
    .where('hotel_id', hotelId)
    .whereIn('status', [
      REORDER_STATUS.INIT,
      REORDER_STATUS.RECEIVING,
      REORDER_STATUS.RECEIVED,
      REORDER_STATUS.SENDING,
      REORDER_STATUS.PENDING,
    ])
    .orderBy('create_at', 'asc')
    .first();
  return record;
}

export {
  reorderKnex,
  REORDER_STATUS,
  initReorderMessage,
  insertReorderMessageChunk,
  nextMessage,
  mysqlNow,
};
