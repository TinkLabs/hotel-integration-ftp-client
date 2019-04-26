/* eslint-disable no-await-in-loop */
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import AWS from 'aws-sdk';
import { reorderKnex, REORDER_STATUS } from '../database/reorderKnex';

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
  let hotelId = meta.hotel_id;

  // If message record not exists, try to create one.
  let row = await reorderKnex('reservation_reorder_messages').where('id', uniqueId).first('*');
  if (row === undefined) {
    reorderKnex('reservation_reorder_messages').insert({
      id: uniqueId,
      hotel_id: hotelId,
      chunk_count: chunkCount,
      chunk_received_count: 0,
      status: REORDER_STATUS.RECEIVING,
      modify_at: reorderKnex.fn.now(),
      create_at: reorderKnex.fn.now(),
    });
  } else if (row.status === REORDER_STATUS.INIT) {
    reorderKnex('reservation_reorder_messages').where('id', uniqueId).update({ status: REORDER_STATUS.RECEIVING, modify_at: reorderKnex.fn.now() }).then(() => { });
  } else if (row.status !== REORDER_STATUS.RECEIVING) {
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

  let sql = 'UPDATE reservation_reorder_messages SET modify_at = ?, chunk_received_count = chunk_received_count + 1 WHERE id = ?';
  await reorderKnex.raw(sql, [reorderKnex.fn.now(), uniqueId]);
}

async function reorderChunk() {
  // send to hai queue one by one;
  let message = await reorderKnex('reservation_reorder_messages').where('status', REORDER_STATUS.PENDING).first('*');
  if (message === undefined) {
    return;
  }

  let messageId = message.id;
  await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.SENDING, modify_at: reorderKnex.fn.now() });
  try {
    for (let i = 0; i < message.chunk_count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      let chunk = await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId, sequence: i }).first('*');
      // eslint-disable-next-line no-await-in-loop
      if (chunk && chunk.content) {
        await sendToHaiQueue(chunk.content);
      }
      // just update the record! less is better than nothing.
      reorderKnex('reservation_reorder_messages').where('id', messageId).update({ modify_at: reorderKnex.fn.now() }).then(() => { });
    }

    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.FINISH, modify_at: reorderKnex.fn.now() });
    await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId }).delete();
    console.log(`[reorderChunk] success reorder message ${messageId} to SQS, chunk count ${message.chunk_count}`);
  } catch (err) {
    console.log(`[reorderChunk] error reorder message ${messageId} to SQS, chunk count ${message.chunk_count}, err ${err}`);
    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.ERROR, modify_at: reorderKnex.fn.now() });
  }

  setTimeout(reorderChunk, 1000);
}

async function monitorMessage() {
  // if chunk_count eq chunk_received_count, update status to received
  await reorderKnex('reservation_reorder_messages')
    .where('status', REORDER_STATUS.RECEIVING)
    .whereRaw('`chunk_received_count` = `chunk_count`')
    .update({ status: REORDER_STATUS.RECEIVED, modify_at: reorderKnex.fn.now() });

  // upload status from RECEIVED to PENDING, only for the first record of each hotel
  reorderKnex('reservation_reorder_messages')
    .where('status', REORDER_STATUS.RECEIVED)
    .distinct('hotel_id')
    .then((hotels) => {
      hotels.forEach((hotel) => {
        reorderKnex('reservation_reorder_messages')
          .where('hotel_id', hotel.hotel_id)
          .whereIn('status', [
            REORDER_STATUS.INIT,
            REORDER_STATUS.RECEIVING,
            REORDER_STATUS.RECEIVED,
            REORDER_STATUS.SENDING,
            REORDER_STATUS.PENDING,
          ])
          .orderBy('create_at', 'asc')
          .first()
          .then((record) => {
            if (record.status === REORDER_STATUS.RECEIVED) {
              reorderKnex('reservation_reorder_messages').where('id', record.id).update({ status: REORDER_STATUS.PENDING, modify_at: reorderKnex.fn.now() }).then(() => { });
            } else if (new Date() - record.modify_at > 60 * 60 * 1000) {
              // 一般都是发送到HAI-QUEUE的过程中，关闭了进程导致的，可以考虑自动回滚为PENDING，暂时手工处理吧
              // if (record.status === REORDER_STATUS.PENDING) {
              // eslint-disable-next-line max-len
              //   reorderKnex('reservation_reorder_messages').where('id', record.id).update({ status: REORDER_STATUS.PENDING, modify_at: reorderKnex.fn.now() }).then(() => { });
              // }
              console.log(`record ${JSON.stringify(record)} block queue more than 1 Hour ${new Date() - record.modify_at}`);
            }
          });
      });
    });

  // timeout.
  // if record keep one status more than ten minutes. set it to ERROR.
  // reorderKnex('reservation_reorder_messages')
  //   .whereIn('status', [
  //     REORDER_STATUS.INIT,
  //     REORDER_STATUS.RECEIVING,
  //     REORDER_STATUS.SENDING,
  //   ])
  //   .whereRaw('NOW() > DATE_ADD(`modify_at`, INTERVAL 1 Hour)')
  //   .select()
  //   .then((records) => { if (records.length > 0) { console.log(typeof records, `record ${JSON.stringify(records)} block queue more than 1 Hour`); } });
  // .update({ status: REORDER_STATUS.TIMEOUT, modify_at: reorderKnex.fn.now() })
  // .then(() => { });

  setTimeout(monitorMessage, 2000);
}

export default function startHandle() {
  // monitor message status.
  monitorMessage();

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
  }, 5000);
}
