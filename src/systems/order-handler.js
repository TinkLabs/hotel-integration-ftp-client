/* eslint-disable no-await-in-loop */
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import AWS from 'aws-sdk';
import { reorderKnex, ENUM_REORDER_STATUS } from '../database/reorderKnex';

let sqs = new AWS.SQS({ region: 'ap-southeast-1' });

async function sendToHaiQueue(raw) {
  let message = JSON.parse(raw);
  delete message.meta.reorder_unique_id;
  delete message.meta.reorder_chunk_count;
  delete message.meta.reorder;
  // delete message.meta.recoder_chunk_seq;

  let haiQueueParams = {
    QueueUrl: process.env.HAI_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    MessageDeduplicationId: uuid(),
    MessageGroupId: message.event,
  };
  return new Promise((resolve, reject) => {
    sqs.sendMessage(haiQueueParams, (err, response) => {
      if (err) {
        reject(err);
      }
      resolve(response);
    });
  });
}

async function receiveChunk(raw) {
  let msg = JSON.parse(raw);
  let { meta } = msg;
  if (!meta) {
    return;
  }
  let uniqueId = meta.reorder_unique_id;
  let chunkCount = meta.reorder_chunk_count;
  let chunkId = meta.chunk_id;
  let chunkSeq = meta.reorder_chunk_seq;

  // If message record not exists, try to create one.
  let row = await reorderKnex('reservation_reorder_messages').where('id', uniqueId).first('*');
  if (row === undefined) {
    reorderKnex('reservation_reorder_messages').insert({
      id: uniqueId,
      chunk_count: chunkCount,
      chunk_received_count: 0,
      status: ENUM_REORDER_STATUS.REORDER_RECEIVING,
      modify_at: reorderKnex.fn.now(),
      create_at: reorderKnex.fn.now(),
    });
  } else if (row.status === ENUM_REORDER_STATUS.CLIENT_SEND) {
    reorderKnex('reservation_reorder_messages').where('id', uniqueId).update({ status: ENUM_REORDER_STATUS.REORDER_RECEIVING, modify_at: reorderKnex.fn.now() }).then(() => {});
  } else if (row.status !== ENUM_REORDER_STATUS.REORDER_RECEIVING) {
    throw new Error(`message ${row.id} status ${row.status} but recerve a new message`);
  }

  await reorderKnex('reservation_reorder_message_chunks').insert({
    id: chunkId,
    message_id: uniqueId,
    sequence: chunkSeq,
    content: raw,
    modify_at: reorderKnex.fn.now(),
    create_at: reorderKnex.fn.now(),
  });

  let sql = 'UPDATE reservation_reorder_messages SET modify_at = ?, chunk_received_count = chunk_received_count + 1, status = CASE chunk_received_count WHEN chunk_count THEN ? ELSE status END WHERE id = ?';
  await reorderKnex.raw(sql, [reorderKnex.fn.now(), ENUM_REORDER_STATUS.REORDER_RECEIVED, uniqueId]);
}

async function reorderChunk() {
  // send to hai queue one by one;
  let message = await reorderKnex('reservation_reorder_messages').where('status', ENUM_REORDER_STATUS.REORDER_RECEIVED).first('*');
  if (message === undefined) {
    return;
  }

  let messageId = message.id;
  await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: ENUM_REORDER_STATUS.REORDER_SENDING, modify_at: reorderKnex.fn.now() });
  try {
    for (let i = 0; i < message.chunk_count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      let chunk = await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId, sequence: i }).first('*');
      // eslint-disable-next-line no-await-in-loop
      await sendToHaiQueue(chunk.content);
    }

    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: ENUM_REORDER_STATUS.REORDER_FINISH, modify_at: reorderKnex.fn.now() });
    await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId }).delete();
    console.log(`[reorderChunk] success reorder message ${messageId} to SQS, chunk count ${message.chunk_count}`);
  } catch (err) {
    console.log(`[reorderChunk] error reorder message ${messageId} to SQS, chunk count ${message.chunk_count}, err ${err}`);
    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: ENUM_REORDER_STATUS.REORDER_ERROR, modify_at: reorderKnex.fn.now() });
  }
}

export default function startHandle() {
  // receive chunk from REORDER-QUEUE.
  setInterval(() => {
    sqs.receiveMessage({ QueueUrl: process.env.HAI_REORDER_URL }, async (error, data) => {
      if (error) {
        console.log(`[receive message from ${process.env.HAI_REORDER_URL} error]`, error);
      }
      if (data.Messages) {
        receiveChunk(data.Messages[0].Body).catch((err) => {
          console.info('[receiveChunk error]', err.message);
        });
        sqs.deleteMessage({
          ReceiptHandle: data.Messages[0].ReceiptHandle,
          QueueUrl: process.env.HAI_REORDER_URL,
        }, (err, resp) => {
          if (err) {
            console.info('[delete message from queue error]', JSON.stringify(err.message, null, 2), '\n ');
          }
          console.info('[successful send file with fileId: ] ', JSON.stringify(resp, null, 2));
        });
      }
    });
  }, 1000);

  // send order chunk to HAI-QUEUE
  setInterval(() => {
    reorderChunk();
  }, 10000);
}
