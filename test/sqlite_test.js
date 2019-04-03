import uuid from 'uuid/v4';
import {
  insertFileMessage,
  insertFileChunk,
  selectFileMessageByUuid,
  selectFileChunkSizeByUuid,
} from '../src/database/sqlite';

async function testFileMessage() {
  let fileUuid = uuid();
  insertFileMessage(fileUuid, 13);
  let fileResult = await selectFileMessageByUuid(fileUuid);
  console.info('query result: ', JSON.stringify(fileResult, null, 2), '\n ');
}

async function testFileChunk() {
  let fileUuid = uuid();
  insertFileMessage(fileUuid, 13);
  insertFileChunk(fileUuid, 1);
  insertFileChunk(fileUuid, 2);
  insertFileChunk(fileUuid, 3);
  insertFileChunk(fileUuid, 4);
  let fileResult = await selectFileChunkSizeByUuid(fileUuid);
  console.info('query result: ', JSON.stringify(fileResult, null, 2), '\n ');
}

// testFileMessage();
testFileChunk();
