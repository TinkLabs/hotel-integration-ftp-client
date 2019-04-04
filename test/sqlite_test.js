import uuid from 'uuid/v4';
import {
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
  deleteDataByFileId,
  selectFileChunkByUuidOrderBySequence,
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
  let chunks = await selectFileChunkByUuidOrderBySequence(fileUuid);
  console.info('query result: ', JSON.stringify(fileResult, null, 2), '\n ');
  console.info(JSON.stringify(chunks, null, 2), '\n ');
}

function testTimestamp() {
  console.info(JSON.stringify(timestamp.utc('YYYYMMDD'), null, 2), '\n ');
}

// testFileMessage();
testFileChunk();
// testTimestamp()
