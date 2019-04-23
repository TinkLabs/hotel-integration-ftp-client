
import { initReorderMessage } from '../src/database/sqlite';


initReorderMessage(1, 2);
// hander();

// import AWS from 'aws-sdk';
// import uuid from 'uuid/v4';
// import { sqlite } from '../src/database/sqlite';

// let sqs = new AWS.SQS({ region: 'ap-southeast-1' });
// async function sendToHaiQueue(raw) {
//   let message = JSON.parse(raw);

//   let haiQueueParams = {
//     QueueUrl: process.env.HAI_QUEUE_URL,
//     MessageBody: JSON.stringify(raw),
//     MessageDeduplicationId: uuid(),
//     MessageGroupId: message.event,
//   };
//   return new Promise((resolve, reject) => {
//     sqs.sendMessage(haiQueueParams, (err, response) => {
//       if (err) {
//         reject(err);
//       }
//       resolve(response);
//     });
//   });
// }

// async function receiveChunk(raw) {
//   let msg = JSON.parse(raw);
//   let { meta } = msg;
//   if (!meta) {
//     return;
//   }
//   let uniqueId = meta.reorder_unique_id;
//   let chunkCount = meta.reorder_chunk_count;
//   let chunkId = meta.chunk_id;
//   let chunkSeq = meta.chunk_seq;

//   // IF message record not exists, try to insert one.
//   await (async () => new Promise((resolve, reject) => {
//     sqlite.get('SELECT * FROM reorder_messages WHERE id = ?', [uniqueId], (err, row) => {
//       if (err) { reject(err); }
//       if (row === undefined) {
//         sqlite.run('INSERT INTO reorder_messages(id, chunk_count, chunk_received_count, status) VALUES (?, ?, ?, ?)', [
//           uniqueId, chunkCount, 0, '',
//         ], () => { resolve(); }); // don't care this error.
//       } else {
//         resolve();
//       }
//     });
//   }))();

//   await (async () => new Promise((resolve, reject) => {
//     sqlite.run('INSERT INTO reorder_message_chunks(id, message_id, sequence, content) VALUES (?, ?, ?, ?)', [
//       chunkId, uniqueId, chunkSeq, raw,
//     ], (err) => { if (err) { reject(err); } resolve(); });
//   }))();

//   await (async () => new Promise((resolve, reject) => {
//     let sql = 'UPDATE reorder_messages SET chunk_received_count = chunk_received_count + 1, status = CASE chunk_received_count WHEN chunk_count - 1 THEN "FINISH" ELSE status END WHERE id = ?';
//     sqlite.run(sql, [uniqueId], (err) => { if (err) { reject(err); } resolve(); });
//   }))();
// }

// async function resendChunk() {
//   let sql = 'SELECT * FROM reorder_messages WHERE status = ?';

//   let message = await (async () => new Promise((resolve, reject) => {
//     sqlite.get(sql, ['FINISH'], (err, row) => { if (err) { reject(err); } resolve(row); });
//   }))();

//   if (message === undefined) {
//     return;
//   }

//   let messageId = message.id;
//   sqlite.run('UPDATE reorder_messages SET status = ? where id = ?', ['resending', messageId], (err) => { if (err) { throw new Error(err); } });
//   try {
//     for (let i = 0; i < message.chunk_count; i += 1) {
//       // eslint-disable-next-line no-await-in-loop
//       let chunk = await (async () => new Promise((resolve, reject) => {
//         sqlite.get('SELECT * FROM reorder_message_chunks where message_id = ? and sequence = ?', [messageId, i], (err, row) => {
//           if (err) { reject(err); }
//           resolve(row);
//         });
//       }))();
//       // eslint-disable-next-line no-await-in-loop
//       await sendToHaiQueue(chunk.content);
//     }
//     sqlite.run('UPDATE reorder_messages SET status = ? where id = ?', ['resend_done', messageId], (err) => { if (err) { throw err; } });
//     sqlite.run('DELETE FROM reorder_message_chunks WHERE message_id = ?', [messageId], (err) => { if (err) { throw err; } });
//   } catch (e) {
//     console.log(e);
//     sqlite.run('UPDATE reorder_messages SET status = ? where id = ?', ['resend_error', messageId], () => { });
//   }
// }

// receiveChunk('{"event":"RESERVATIONS","meta":{"reorder_unique_id":1234, "reorder_chunk_count":"2", "chunk_id":"11", "chunk_seq":"0"}, "data":{"reservations":[{},{}]}}');
// receiveChunk('{"event":"RESERVATIONS","meta":{"reorder_unique_id":1234, "reorder_chunk_count":"2", "chunk_id":"21", "chunk_seq":"1"}, "data":{"reservations":[{},{}]}}');

// resendChunk();
