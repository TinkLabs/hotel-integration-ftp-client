/* eslint-disable no-await-in-loop */
import uuid from 'uuid/v4';
import Promise from 'bluebird';
import AWS from 'aws-sdk';
import lodash from 'lodash';
import { Consumer } from 'sqs-consumer';
import {
  reorderKnex,
  REORDER_STATUS,
  nextMessage,
  mysqlNow,
} from '../database/reorderKnex';

let sqs = new AWS.SQS({ region: 'ap-southeast-1' });

async function sendToHaiQueue(raw) {
  let message = JSON.parse(raw);
  delete message.data.meta.reorder_unique_id;
  delete message.data.meta.reorder_chunk_count;
  delete message.data.meta.reorder;
  delete message.data.meta.reorder_chunk_seq;

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

async function reorderReceive() {
  const consumer = Consumer.create({
    queueUrl: process.env.HAI_REORDER_URL,
    handleMessageTimeout: 3000,
    handleMessage: async (message) => {
      let raw = message.Body;
      let msg = JSON.parse(raw);
      let meta = msg.meta ? msg.meta : msg.data.meta;
      if (!meta) {
        return;
      }
      let uniqueId = meta.reorder_unique_id;
      let chunkId = meta.chunk_id;

      // If message record not exists, try to create one.
      let row = await reorderKnex('reservation_reorder_messages').where('id', uniqueId).first('*');
      if (row === undefined) {
        console.log(`message ${uniqueId} not exists`);
      } else if (row.status === REORDER_STATUS.INIT) {
        reorderKnex('reservation_reorder_messages').where('id', uniqueId).update({ status: REORDER_STATUS.RECEIVING, modify_at: mysqlNow() }).then(() => { });
      } else if (row.status !== REORDER_STATUS.RECEIVING) {
        console.log(`message ${row.id} status ${row.status} but recerve a new message`);
      }

      await reorderKnex('reservation_reorder_message_chunks').where('id', chunkId).update({
        id: chunkId,
        content: raw,
        status: REORDER_STATUS.CHUNK_RECEIVED,
        modify_at: mysqlNow(),
      });

      console.log(`update ${chunkId} status success`);

      let sql = 'UPDATE reservation_reorder_messages SET modify_at = ?, chunk_received_count = (select count(*) from reservation_reorder_message_chunks where message_id = ? and status = ?) WHERE id = ?';
      await reorderKnex.raw(sql, [mysqlNow(), uniqueId, REORDER_STATUS.CHUNK_RECEIVED, uniqueId]);
    },
  });
  consumer.on('error', (err) => {
    console.error(err.message);
    consumer.stop();
  });
  consumer.on('processing_error', (err) => {
    console.error(err.message);
    consumer.stop();
  });
  consumer.start();
}

async function reorderSend() {
  // send to hai queue one by one;
  let message = await reorderKnex('reservation_reorder_messages').where('status', REORDER_STATUS.PENDING).first('*');
  if (message === undefined) {
    return;
  }

  let messageId = message.id;
  await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.SENDING, modify_at: mysqlNow() });
  try {
    for (let i = 0; i < message.chunk_count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      let chunk = await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId, sequence: i }).first('*');
      // eslint-disable-next-line no-await-in-loop
      if (chunk && chunk.content && chunk.status === REORDER_STATUS.CHUNK_RECEIVED) {
        await sendToHaiQueue(chunk.content);
        reorderKnex('reservation_reorder_messages').where('id', messageId).update({ modify_at: mysqlNow() }).then(() => { });
      }
    }

    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.FINISH, modify_at: mysqlNow() });
    await reorderKnex('reservation_reorder_message_chunks').where({ message_id: messageId }).delete();
    console.log(`[reorderSend]reorder message ${messageId} success, chunk count ${message.chunk_count}, delete message from database`);
  } catch (err) {
    console.log(`[reorderSend] error reorder message ${messageId} to SQS, chunk count ${message.chunk_count}, err ${err}`);
    await reorderKnex('reservation_reorder_messages').where('id', messageId).update({ status: REORDER_STATUS.ERROR, modify_at: mysqlNow() });
  }
}

async function reorderMonitorStatus() {
  // if chunk_count eq chunk_received_count, update status to received
  try {
    await reorderKnex('reservation_reorder_messages')
      .where('status', REORDER_STATUS.RECEIVING)
      .whereRaw('`chunk_received_count` = `chunk_count`')
      .update({ status: REORDER_STATUS.RECEIVED, modify_at: mysqlNow() });

    // upload status from RECEIVED to PENDING, only for the first record of each hotel
    reorderKnex('reservation_reorder_messages')
      .where('status', REORDER_STATUS.RECEIVED)
      .distinct('hotel_id')
      .then((hotels) => {
        hotels.forEach((hotel) => {
          nextMessage(hotel.hotel_id).then((message) => {
            if (message && message.status === REORDER_STATUS.RECEIVED) {
              console.log(`[reorderMonitorStatus] message ${message.id} received!`);
              reorderKnex('reservation_reorder_messages').where('id', message.id).update({ status: REORDER_STATUS.PENDING, modify_at: mysqlNow() }).then(() => { });
            }
          });
        });
      });
  } finally {
    setTimeout(reorderMonitorStatus, 2000);
  }
}

export function orderHandler() {
  if (process.env.REORDER_ENABLE === 0) {
    return;
  }

  // monitor message status.
  reorderMonitorStatus();

  // receive chunk from REORDER-QUEUE.
  reorderReceive();

  // send order chunk to HAI-QUEUE
  setInterval(() => { reorderSend(); }, 5000);
}

export async function orderResend(sockets) {
  if (process.env.REORDER_ENABLE === 0) {
    return;
  }
  lodash.forEach(sockets, (socket, hotelId) => {
    nextMessage(hotelId).then((msg) => {
      if (!msg) {
        return;
      }
      if (new Date() - msg.modify_at < 10 * 60 * 1000) {
        return;
      }
      if (msg.status === REORDER_STATUS.INIT || msg.status === REORDER_STATUS.RECEIVING) {
        // timeout ten minute;
        reorderKnex('reservation_reorder_message_chunks').where({ message_id: msg.id }).limit(1).count('id as count')
          .then((row) => {
            const { count } = row[0];
            // all the chunks in the database, send to socket again.
            if (count === msg.chunk_count) {
              reorderKnex('reservation_reorder_message_chunks')
                .where({ message_id: msg.id, status: REORDER_STATUS.CHUNK_SEND })
                .select('id', 'raw').then((chunks) => {
                  chunks.forEach((chunk) => {
                    let pmsData = JSON.parse(chunk.raw);
                    reorderKnex('reservation_reorder_message_chunks').where('id', chunk.id).update({ modify_at: mysqlNow() }).then(() => { });
                    socket.send(pmsData);
                    console.log(`[orderResend] resend message msgId:${msg.id}, chunkId:${chunk.id}`);
                  });
                });
              reorderKnex('reservation_reorder_messages').where('id', msg.id).update({ modify_at: mysqlNow() }).then(() => { });
            } else {
              // chunk lose before send to socket. set status to error.
              reorderKnex('reservation_reorder_messages').where('id', msg.id).update({ status: REORDER_STATUS.ERROR, modify_at: mysqlNow() }).then(() => { });
              console.log(`[orderResend] msg:${msg.id} set to error, need count ${msg.chunk_count}, get ${count}`);
            }
          });
      }
      if (msg.status === REORDER_STATUS.SENDING) {
        reorderKnex('reservation_reorder_messages').where('id', msg.id).update({ status: REORDER_STATUS.RECEIVED, modify_at: mysqlNow() }).then(() => { });
      }
    });
  });
}
