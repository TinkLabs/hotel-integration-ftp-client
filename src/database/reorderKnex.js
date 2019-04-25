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

const REORDER_STATUS = {
  INIT: 'reorder_init',
  RECEIVING: 'reorder_receiving',
  RECEIVED: 'reorder_received',
  PENDING: 'reorder_pending',
  SENDING: 'reorder_sending',
  FINISH: 'reorder_finish',
  ERROR: 'reorder_error',
  TIMEOUT: 'reorder_timeout',
};

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
    modify_at: reorderKnex.fn.now(),
    create_at: reorderKnex.fn.now(),
  });
}

export {
  reorderKnex,
  REORDER_STATUS,
  initReorderMessage,
};
