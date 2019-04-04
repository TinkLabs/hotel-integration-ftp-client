import uuid from 'uuid/v4';
import {
  sqlite,
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
  deleteChunkByFileId,
  selectFileChunkByFileIdOrderBySequence,
} from '../src/database/sqlite';
import timestamp from 'time-stamp';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFileMessage() {
  let fileUuid = uuid();
  insertFileMessage(fileUuid, 13);
  await sleep(100);
  let fileResult = await selectFileMessageByUuid(fileUuid);
  console.info('query result: ', JSON.stringify(fileResult, null, 2), '\n ');
}

async function testFileChunk() {
  let fileUuid = uuid();
  insertFileMessage(fileUuid, 13);
  insertFileChunk(fileUuid, 1);
  insertFileChunk(fileUuid, 2);
  insertFileChunk(fileUuid, 9);
  insertFileChunk(fileUuid, 7);
  insertFileChunk(fileUuid, 8);
  insertFileChunk(fileUuid, 6);
  insertFileChunk(fileUuid, 5);
  insertFileChunk(fileUuid, 3);
  insertFileChunk(fileUuid, 4);
  await sleep(100);
  let fileResult = await selectFileChunkSizeByUuid(fileUuid);
  let chunks = await selectFileChunkByFileIdOrderBySequence(fileUuid);
  console.info('query result: ', JSON.stringify(fileResult, null, 2), '\n ');
  console.info(JSON.stringify(chunks, null, 2), '\n ');
}

function testTimestamp() {
  console.info(JSON.stringify(timestamp.utc('YYYYMMDD'), null, 2), '\n ');
}

function testQueryAll() {
  sqlite.all('select * from file_msg', [], (err, row) => {
    if (err) {
      console.info(JSON.stringify(err.message, null, 2), '\n ');
    }
    console.info('file_msg:', JSON.stringify(row, null, 2), '\n ');
  });

  sqlite.all('select * from file_chunk', [], (err, row) => {
    if (err) {
      console.info(JSON.stringify(err.message, null, 2), '\n ');
    }
    console.info('file_chunk:', JSON.stringify(row, null, 2), '\n ');
  });
}

async function testQueryFileMessageById() {
  let id = '';
  sqlite.get('select * from file_msg', [], async (err, row) => {
    if (err) {
      console.info(JSON.stringify(err.message, null, 2), '\n ');
    }
    id = row.file_id;
    let fileMessage = await selectFileMessageByUuid(id);
    console.log(fileMessage);
  });
}

// testFileMessage();
// testFileChunk();
// testTimestamp()
testQueryAll();
// testQueryFileMessageById();
